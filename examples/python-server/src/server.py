"""
FastAPI server example for Sayna SDK.

This server demonstrates:
1. REST endpoint for generating LiveKit tokens
2. Background task management for Sayna WebSocket sessions
3. Event handling and logging
"""

import asyncio
import logging
import uuid
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from sayna_client import (
    ErrorMessage,
    LiveKitConfig,
    ParticipantDisconnectedMessage,
    SaynaClient,
    STTConfig,
    STTResultMessage,
    TTSConfig,
    TTSPlaybackCompleteMessage,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="Sayna FastAPI Example",
    description="Example server demonstrating Sayna SDK integration with FastAPI",
    version="0.1.0",
)

# STT Configuration
STT_CONFIG = STTConfig(
    provider="deepgram",
    language="en-US",
    sample_rate=16000,
    channels=1,
    punctuation=True,
    encoding="linear16",
    model="nova-3",
)

# TTS Configuration
TTS_CONFIG = TTSConfig(
    provider="elevenlabs",
    voice_id="21m00Tcm4TlvDq8ikWAM",
    speaking_rate=1.0,
    audio_format="linear16",
    sample_rate=16000,
    connection_timeout=30,
    request_timeout=60,
    model="eleven_turbo_v2_5",
    pronunciations=[],
)

# Session storage
sessions: dict[str, SaynaClient] = {}


def session_key(sayna_url: str, room_name: str) -> str:
    """Generate a unique key for a session."""
    return f"{sayna_url}::{room_name}"


async def create_sayna_session(
    sayna_url: str,
    room_name: str,
    participant_identity: str,
) -> SaynaClient:
    """
    Create a new Sayna WebSocket session with event handlers.

    Args:
        sayna_url: Sayna server WebSocket URL
        room_name: LiveKit room name
        participant_identity: Identity for the Sayna agent participant

    Returns:
        Connected SaynaClient instance
    """
    livekit_config = LiveKitConfig(
        room_name=room_name,
        sayna_participant_identity=participant_identity,
        sayna_participant_name="Sayna AI Assistant",
    )

    key = session_key(sayna_url, room_name)
    logger.info("[Sayna] Creating session for: %s, room: %s", sayna_url, room_name)

    client = SaynaClient(url=sayna_url)

    # Register event handlers BEFORE connecting
    async def on_stt_result(result: STTResultMessage) -> None:
        """Handle speech-to-text results."""
        if not result.is_speech_final:
            return

        text = result.transcript.strip()
        if not text:
            return

        logger.info("[Sayna] STT Final: %s", text)
        try:
            # Echo back the transcribed text
            await client.send_speak(text)
        except Exception as e:
            logger.error("[Sayna] Failed to echo transcript: %s", e)

    async def on_participant_disconnected(msg: ParticipantDisconnectedMessage) -> None:
        """Handle participant disconnection."""
        logger.info("[Sayna] Participant disconnected: %s", msg.participant.identity)
        # Clean up session
        if key in sessions:
            del sessions[key]
        try:
            await client.disconnect()
        except Exception as e:
            logger.error("[Sayna] Failed to disconnect after participant left: %s", e)

    async def on_tts_playback_complete(msg: TTSPlaybackCompleteMessage) -> None:
        """Handle TTS playback completion."""
        from datetime import datetime

        timestamp_dt = datetime.fromtimestamp(msg.timestamp / 1000)
        logger.info("[Sayna] TTS playback complete at: %s", timestamp_dt.isoformat())

    def on_error(msg: ErrorMessage) -> None:
        """Handle error messages."""
        logger.error("[Sayna] Error: %s", msg.message)

    # Register callbacks
    client.register_on_stt_result(on_stt_result)
    client.register_on_participant_disconnected(on_participant_disconnected)
    client.register_on_tts_playback_complete(on_tts_playback_complete)
    client.register_on_error(on_error)

    # Connect to WebSocket
    await client.connect(
        stt_config=STT_CONFIG,
        tts_config=TTS_CONFIG,
        livekit_config=livekit_config,
    )

    # Verify connection is ready
    if not client.ready:
        await client.disconnect()
        raise RuntimeError("Sayna connection failed to become ready")

    logger.info("[Sayna] Connected to room: %s", client.livekit_room_name)
    logger.info("[Sayna] Sayna participant: %s", client.sayna_participant_identity)

    # Store session
    sessions[key] = client
    return client


async def ensure_sayna_session(
    sayna_url: str,
    room_name: str,
    participant_identity: str,
) -> SaynaClient:
    """
    Get or create a Sayna session.

    Args:
        sayna_url: Sayna server WebSocket URL
        room_name: LiveKit room name
        participant_identity: Identity for the Sayna agent participant

    Returns:
        Connected SaynaClient instance
    """
    key = session_key(sayna_url, room_name)
    existing = sessions.get(key)

    if existing and existing.connected:
        return existing

    # Clean up stale session if it exists but is disconnected
    if existing:
        del sessions[key]

    return await create_sayna_session(sayna_url, room_name, participant_identity)


@app.get("/")
async def root() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "sayna-fastapi-example"}


@app.post("/sayna/token")
async def get_sayna_token(
    background_tasks: BackgroundTasks,
    sayna_url: str = Query(..., description="Sayna server URL"),
    room: Optional[str] = Query(None, description="LiveKit room name"),
    participant_name: Optional[str] = Query(None, description="Participant display name"),
    participant_identity: Optional[str] = Query(None, description="Participant unique identity"),
) -> JSONResponse:
    """
    Get LiveKit token and establish Sayna agent session.

    This endpoint:
    1. Validates the Sayna URL
    2. Creates a temporary client to get a LiveKit token for the user
    3. Starts a background task to establish the Sayna agent session
    4. Returns the LiveKit token to the user

    Args:
        background_tasks: FastAPI background tasks manager
        sayna_url: Sayna server base URL (http:// or https://)
        room: LiveKit room name (optional, generates UUID if not provided)
        participant_name: Display name for the participant (optional)
        participant_identity: Unique identity for the participant (optional)

    Returns:
        JSON response with LiveKit token and connection details
    """
    # Validate URL
    try:
        parsed = urlparse(sayna_url)
        if parsed.scheme not in ["http", "https"]:
            raise HTTPException(
                status_code=400,
                detail="saynaUrl must use http or https protocol",
            )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid saynaUrl: {e}",
        ) from e

    # Generate defaults
    room_name = room or f"sayna-room-{uuid.uuid4()}"
    part_name = participant_name or "Web User"
    part_identity = participant_identity or f"user-{uuid.uuid4()}"

    logger.info(
        "[API] Token request - URL: %s, Room: %s, Participant: %s",
        sayna_url,
        room_name,
        part_identity,
    )

    try:
        # Create a temporary client just to get the LiveKit token
        temp_client = SaynaClient(url=sayna_url)

        # Use the REST API to get LiveKit token for the user
        token_response = await temp_client.get_livekit_token(
            room_name=room_name,
            participant_name=part_name,
            participant_identity=part_identity,
        )

        # Close the temporary client
        await temp_client.disconnect()

        # Generate agent identity
        agent_identity = f"sayna-agent-{uuid.uuid4()}"

        # Schedule background task to establish the Sayna session
        async def establish_session() -> None:
            """Background task to establish Sayna WebSocket session."""
            try:
                await ensure_sayna_session(sayna_url, room_name, agent_identity)
            except Exception as e:
                logger.error("[Background] Failed to establish Sayna session: %s", e)

        background_tasks.add_task(establish_session)

        # Return token to the user
        return JSONResponse(
            content={
                "token": token_response.token,
                "liveUrl": token_response.livekit_url,
                "roomName": token_response.room_name,
                "participantIdentity": token_response.participant_identity,
            },
            status_code=200,
        )

    except Exception as e:
        logger.error("[API] Failed to get LiveKit token: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get LiveKit token: {e}",
        ) from e


@app.get("/sessions")
async def list_sessions() -> dict[str, Any]:
    """
    List active Sayna sessions (for debugging).

    Returns:
        Dictionary with session count and session keys
    """
    return {
        "count": len(sessions),
        "sessions": [
            {
                "key": key,
                "connected": client.connected,
                "ready": client.ready,
                "room": client.livekit_room_name,
            }
            for key, client in sessions.items()
        ],
    }


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Clean up all Sayna sessions on shutdown."""
    logger.info("[Shutdown] Cleaning up %d Sayna sessions", len(sessions))

    # Disconnect all sessions
    disconnect_tasks = [client.disconnect() for client in sessions.values()]
    await asyncio.gather(*disconnect_tasks, return_exceptions=True)

    sessions.clear()
    logger.info("[Shutdown] All sessions cleaned up")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
