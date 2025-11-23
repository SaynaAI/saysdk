"""Sayna WebSocket client for server-side connections."""

import asyncio
import contextlib
import json
import logging
import os
import warnings
from typing import Any, Callable, Optional

import aiohttp
from pydantic import ValidationError

from sayna_client.errors import (
    SaynaConnectionError,
    SaynaNotConnectedError,
    SaynaNotReadyError,
    SaynaValidationError,
)
from sayna_client.http_client import SaynaHttpClient
from sayna_client.types import (
    ClearMessage,
    ConfigMessage,
    ErrorMessage,
    HealthResponse,
    LiveKitConfig,
    LiveKitTokenRequest,
    LiveKitTokenResponse,
    MessageMessage,
    ParticipantDisconnectedMessage,
    ReadyMessage,
    SendMessageMessage,
    SpeakMessage,
    SpeakRequest,
    STTConfig,
    STTResultMessage,
    TTSConfig,
    TTSPlaybackCompleteMessage,
    VoiceDescriptor,
)


logger = logging.getLogger(__name__)


class SaynaClient:
    """Sayna WebSocket client for real-time voice interactions.

    This client provides both WebSocket and REST API access to Sayna services.
    It handles connection management, message routing, and event callbacks.

    Example:
        ```python
        from sayna_client import SaynaClient, STTConfig, TTSConfig

        # Initialize client with configs
        client = SaynaClient(
            url="https://api.sayna.ai",
            stt_config=STTConfig(provider="deepgram", model="nova-2"),
            tts_config=TTSConfig(provider="cartesia", voice_id="example-voice"),
            api_key="your-api-key",
        )

        # REST API (no WebSocket connection required)
        health = await client.health()
        voices = await client.get_voices()

        # WebSocket API (requires connection)
        client.register_on_stt_result(lambda result: print(result.transcript))
        client.register_on_tts_audio(lambda audio: print(f"Received {len(audio)} bytes"))

        await client.connect()
        await client.speak("Hello, world!")
        await client.disconnect()
        ```
    """

    def __init__(
        self,
        url: str,
        stt_config: Optional[STTConfig] = None,
        tts_config: Optional[TTSConfig] = None,
        livekit_config: Optional[LiveKitConfig] = None,
        without_audio: bool = False,
        api_key: Optional[str] = None,
    ) -> None:
        """Initialize the Sayna client.

        Args:
            url: Sayna server URL (e.g., 'https://api.sayna.ai' or 'wss://api.sayna.com/ws')
            stt_config: Speech-to-text provider configuration (required when without_audio=False)
            tts_config: Text-to-speech provider configuration (required when without_audio=False)
            livekit_config: Optional LiveKit room configuration
            without_audio: If True, disables audio streaming (default: False)
            api_key: Optional API key for authentication (defaults to SAYNA_API_KEY env)

        Raises:
            SaynaValidationError: If URL is invalid or if audio configs are missing when audio is enabled
        """
        # Validate URL
        if not url or not isinstance(url, str):
            msg = "URL must be a non-empty string"
            raise SaynaValidationError(msg)
        if not url.startswith(("http://", "https://", "ws://", "wss://")):
            msg = "URL must start with http://, https://, ws://, or wss://"
            raise SaynaValidationError(msg)

        # Validate audio config requirements
        if not without_audio and (stt_config is None or tts_config is None):
            msg = (
                "stt_config and tts_config are required when without_audio=False (audio streaming enabled). "
                "Either provide both configs or set without_audio=True for non-audio use cases."
            )
            raise SaynaValidationError(msg)

        self.url = url
        self.stt_config = stt_config
        self.tts_config = tts_config
        self.livekit_config = livekit_config
        self.without_audio = without_audio
        self.api_key = api_key or os.environ.get("SAYNA_API_KEY")

        # Extract base URL for REST API
        if url.startswith(("ws://", "wss://")):
            # Convert WebSocket URL to HTTP URL
            base_url = url.replace("wss://", "https://").replace("ws://", "http://")
            # Remove /ws endpoint if present
            if base_url.endswith("/ws"):
                base_url = base_url[:-3]
            self.base_url = base_url
        else:
            self.base_url = url

        # HTTP client for REST API calls
        self._http_client = SaynaHttpClient(self.base_url, self.api_key)

        # WebSocket connection state
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._connected = False
        self._ready = False
        self._receive_task: Optional[asyncio.Task[None]] = None

        # Ready message data
        self._livekit_room_name: Optional[str] = None
        self._livekit_url: Optional[str] = None
        self._sayna_participant_identity: Optional[str] = None
        self._sayna_participant_name: Optional[str] = None

        # Event callbacks
        self._on_ready: Optional[Callable[[ReadyMessage], Any]] = None
        self._on_stt_result: Optional[Callable[[STTResultMessage], Any]] = None
        self._on_message: Optional[Callable[[MessageMessage], Any]] = None
        self._on_error: Optional[Callable[[ErrorMessage], Any]] = None
        self._on_participant_disconnected: Optional[
            Callable[[ParticipantDisconnectedMessage], Any]
        ] = None
        self._on_tts_playback_complete: Optional[Callable[[TTSPlaybackCompleteMessage], Any]] = None
        self._on_audio: Optional[Callable[[bytes], Any]] = None

    # ============================================================================
    # Properties
    # ============================================================================

    @property
    def connected(self) -> bool:
        """Whether the WebSocket is connected."""
        return self._connected

    @property
    def ready(self) -> bool:
        """Whether the connection is ready (received ready message)."""
        return self._ready

    @property
    def livekit_room_name(self) -> Optional[str]:
        """LiveKit room name (available after ready)."""
        return self._livekit_room_name

    @property
    def livekit_url(self) -> Optional[str]:
        """LiveKit URL (available after ready)."""
        return self._livekit_url

    @property
    def sayna_participant_identity(self) -> Optional[str]:
        """Sayna participant identity (available after ready when LiveKit is enabled)."""
        return self._sayna_participant_identity

    @property
    def sayna_participant_name(self) -> Optional[str]:
        """Sayna participant name (available after ready when LiveKit is enabled)."""
        return self._sayna_participant_name

    # ============================================================================
    # REST API Methods
    # ============================================================================

    async def health(self) -> HealthResponse:
        """Check server health status.

        Returns:
            HealthResponse with status field

        Raises:
            SaynaServerError: If the server returns an error

        Example:
            >>> health = await client.health()
            >>> print(health.status)  # "OK"
        """
        data = await self._http_client.get("/")
        return HealthResponse(**data)

    async def health_check(self) -> HealthResponse:
        """Check server health status.

        .. deprecated::
            Use :meth:`health` instead. This method will be removed in a future version.

        Returns:
            HealthResponse with status field

        Raises:
            SaynaServerError: If the server returns an error
        """
        warnings.warn(
            "health_check() is deprecated, use health() instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return await self.health()

    async def get_voices(self) -> dict[str, list[VoiceDescriptor]]:
        """Retrieve the catalogue of text-to-speech voices grouped by provider.

        Returns:
            Dictionary mapping provider names to lists of voice descriptors

        Raises:
            SaynaServerError: If the server returns an error

        Example:
            >>> voices = await client.get_voices()
            >>> for provider, voice_list in voices.items():
            ...     print(f"{provider}:", [v.name for v in voice_list])
        """
        data = await self._http_client.get("/voices")
        # Parse the voice catalog
        voices_by_provider: dict[str, list[VoiceDescriptor]] = {}
        for provider, voice_list in data.items():
            voices_by_provider[provider] = [VoiceDescriptor(**v) for v in voice_list]
        return voices_by_provider

    async def speak_rest(self, text: str, tts_config: TTSConfig) -> tuple[bytes, dict[str, str]]:
        """Synthesize text to speech using REST API.

        This is a standalone synthesis method that doesn't require an active WebSocket connection.

        Args:
            text: Text to convert to speech
            tts_config: TTS configuration (without API credentials)

        Returns:
            Tuple of (audio_data, response_headers)
            Headers include: Content-Type, Content-Length, x-audio-format, x-sample-rate

        Raises:
            SaynaValidationError: If text is empty
            SaynaServerError: If synthesis fails

        Example:
            >>> audio_data, headers = await client.speak_rest("Hello, world!", tts_config)
            >>> print(f"Received {len(audio_data)} bytes of {headers['Content-Type']}")
        """
        request = SpeakRequest(text=text, tts_config=tts_config)
        return await self._http_client.post_binary("/speak", json_data=request.model_dump())

    async def get_livekit_token(
        self,
        room_name: str,
        participant_name: str,
        participant_identity: str,
    ) -> LiveKitTokenResponse:
        """Issue a LiveKit access token for a participant.

        Args:
            room_name: LiveKit room to join or create
            participant_name: Display name for the participant
            participant_identity: Unique identifier for the participant

        Returns:
            LiveKitTokenResponse with token and connection details

        Raises:
            SaynaValidationError: If any field is blank
            SaynaServerError: If token generation fails
        """
        request = LiveKitTokenRequest(
            room_name=room_name,
            participant_name=participant_name,
            participant_identity=participant_identity,
        )
        data = await self._http_client.post("/livekit/token", json_data=request.model_dump())
        return LiveKitTokenResponse(**data)

    # ============================================================================
    # WebSocket Connection Management
    # ============================================================================

    async def connect(self) -> None:
        """Establishes connection to the Sayna WebSocket server.

        Sends initial configuration and waits for the ready message.

        Raises:
            SaynaConnectionError: If connection fails

        Returns:
            Promise that resolves when the connection is ready
        """
        if self._connected:
            logger.warning("Already connected to Sayna WebSocket")
            return

        # Convert HTTP(S) URL to WebSocket URL if needed
        ws_url = self.url
        if ws_url.startswith(("http://", "https://")):
            ws_url = ws_url.replace("https://", "wss://").replace("http://", "ws://")
            # Add /ws endpoint if not present
            if not ws_url.endswith("/ws"):
                ws_url = ws_url + "/ws" if not ws_url.endswith("/") else ws_url + "ws"

        try:
            # Create session with headers
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            self._session = aiohttp.ClientSession(headers=headers)

            # Connect to WebSocket
            self._ws = await self._session.ws_connect(ws_url)
            self._connected = True
            logger.info("Connected to Sayna WebSocket: %s", ws_url)

            # Send config message
            config = ConfigMessage(
                audio=not self.without_audio,
                stt_config=self.stt_config,
                tts_config=self.tts_config,
                livekit=self.livekit_config,
            )
            await self._send_json(config.model_dump(exclude_none=True))

            # Start receiving messages
            self._receive_task = asyncio.create_task(self._receive_loop())

        except aiohttp.ClientError as e:
            self._connected = False
            msg = f"Failed to connect to WebSocket: {e}"
            raise SaynaConnectionError(msg, cause=e) from e
        except Exception as e:
            self._connected = False
            msg = f"Unexpected error during connection: {e}"
            raise SaynaConnectionError(msg, cause=e) from e

    async def disconnect(self) -> None:
        """Disconnect from the Sayna WebSocket server."""
        if not self._connected:
            logger.warning("Not connected to Sayna WebSocket")
            return

        try:
            # Cancel receive task
            if self._receive_task:
                self._receive_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._receive_task
                self._receive_task = None

            # Close WebSocket
            if self._ws and not self._ws.closed:
                await self._ws.close()
            self._ws = None

            # Close session
            if self._session and not self._session.closed:
                await self._session.close()
            self._session = None

            self._connected = False
            self._ready = False
            logger.info("Disconnected from Sayna WebSocket")

        except Exception as e:
            logger.exception("Error during disconnect: %s", e)
            msg = f"Error during disconnect: {e}"
            raise SaynaConnectionError(msg, cause=e) from e
        finally:
            # Close HTTP client
            await self._http_client.close()

    # ============================================================================
    # WebSocket Sending Methods
    # ============================================================================

    async def speak(
        self,
        text: str,
        flush: bool = True,
        allow_interruption: bool = True,
    ) -> None:
        """Send text to be synthesized as speech via WebSocket.

        Args:
            text: Text to synthesize
            flush: Whether to flush the TTS queue before speaking (default: True)
            allow_interruption: Whether this speech can be interrupted (default: True)

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
            SaynaValidationError: If text is not a string

        Example:
            >>> await client.speak("Hello, world!")
            >>> await client.speak("Important message", flush=True, allow_interruption=False)
        """
        self._check_ready()
        message = SpeakMessage(text=text, flush=flush, allow_interruption=allow_interruption)
        await self._send_json(message.model_dump(exclude_none=True))

    async def send_speak(
        self,
        text: str,
        flush: bool = True,
        allow_interruption: bool = True,
    ) -> None:
        """Queue text for TTS synthesis via WebSocket.

        .. deprecated::
            Use :meth:`speak` instead. This method will be removed in a future version.

        Args:
            text: Text to synthesize
            flush: Clear pending TTS audio before synthesizing
            allow_interruption: Allow subsequent speak/clear commands to interrupt

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
        """
        warnings.warn(
            "send_speak() is deprecated, use speak() instead",
            DeprecationWarning,
            stacklevel=2,
        )
        await self.speak(text, flush, allow_interruption)

    async def clear(self) -> None:
        """Clear the text-to-speech queue.

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
        """
        self._check_ready()
        message = ClearMessage()
        await self._send_json(message.model_dump(exclude_none=True))

    async def tts_flush(self, allow_interruption: bool = True) -> None:
        """Flush the TTS queue by sending an empty speak command.

        Args:
            allow_interruption: Whether the flush can be interrupted (default: True)

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready

        Example:
            >>> await client.tts_flush()
        """
        await self.speak("", flush=True, allow_interruption=allow_interruption)

    async def send_clear(self) -> None:
        """Clear queued TTS audio and reset LiveKit audio buffers.

        .. deprecated::
            Use :meth:`clear` instead. This method will be removed in a future version.

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
        """
        warnings.warn(
            "send_clear() is deprecated, use clear() instead",
            DeprecationWarning,
            stacklevel=2,
        )
        await self.clear()

    async def send_message(
        self,
        message: str,
        role: str,
        topic: str = "messages",
        debug: Optional[dict[str, Any]] = None,
    ) -> None:
        """Send a data message to the LiveKit room.

        Args:
            message: Message content
            role: Sender role (e.g., 'user', 'assistant')
            topic: LiveKit topic/channel (default: 'messages')
            debug: Optional debug metadata

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
        """
        self._check_ready()
        msg = SendMessageMessage(message=message, role=role, topic=topic, debug=debug)
        await self._send_json(msg.model_dump(exclude_none=True))

    async def on_audio_input(self, audio_data: bytes) -> None:
        """Send audio data to the server for speech recognition.

        Args:
            audio_data: Raw audio bytes matching the STT config

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
            SaynaValidationError: If audio_data is invalid

        Example:
            >>> await client.on_audio_input(audio_bytes)
        """
        self._check_ready()
        if self._ws:
            await self._ws.send_bytes(audio_data)

    async def send_audio(self, audio_data: bytes) -> None:
        """Send raw audio data to the STT pipeline.

        .. deprecated::
            Use :meth:`on_audio_input` instead. This method will be removed in a future version.

        Args:
            audio_data: Raw audio bytes matching the STT config

        Raises:
            SaynaNotConnectedError: If not connected
            SaynaNotReadyError: If not ready
        """
        warnings.warn(
            "send_audio() is deprecated, use on_audio_input() instead",
            DeprecationWarning,
            stacklevel=2,
        )
        await self.on_audio_input(audio_data)

    # ============================================================================
    # Event Registration
    # ============================================================================

    def register_on_ready(self, callback: Callable[[ReadyMessage], Any]) -> None:
        """Register callback for ready event."""
        self._on_ready = callback

    def register_on_stt_result(self, callback: Callable[[STTResultMessage], Any]) -> None:
        """Register callback for STT result events."""
        self._on_stt_result = callback

    def register_on_message(self, callback: Callable[[MessageMessage], Any]) -> None:
        """Register callback for message events."""
        self._on_message = callback

    def register_on_error(self, callback: Callable[[ErrorMessage], Any]) -> None:
        """Register callback for error events."""
        self._on_error = callback

    def register_on_participant_disconnected(
        self, callback: Callable[[ParticipantDisconnectedMessage], Any]
    ) -> None:
        """Register callback for participant disconnected events."""
        self._on_participant_disconnected = callback

    def register_on_tts_playback_complete(
        self, callback: Callable[[TTSPlaybackCompleteMessage], Any]
    ) -> None:
        """Register callback for TTS playback complete events."""
        self._on_tts_playback_complete = callback

    def register_on_tts_audio(self, callback: Callable[[bytes], Any]) -> None:
        """Register a callback for text-to-speech audio data.

        Args:
            callback: Function to call when TTS audio is received

        Example:
            >>> def handle_audio(audio_data: bytes):
            ...     print(f"Received {len(audio_data)} bytes of audio")
            >>> client.register_on_tts_audio(handle_audio)
        """
        self._on_audio = callback

    def register_on_audio(self, callback: Callable[[bytes], Any]) -> None:
        """Register callback for audio data events (TTS output).

        .. deprecated::
            Use :meth:`register_on_tts_audio` instead. This method will be removed in a future version.

        Args:
            callback: Function to call when audio data is received
        """
        warnings.warn(
            "register_on_audio() is deprecated, use register_on_tts_audio() instead",
            DeprecationWarning,
            stacklevel=2,
        )
        self.register_on_tts_audio(callback)

    # ============================================================================
    # Internal Methods
    # ============================================================================

    def _check_connected(self) -> None:
        """Check if connected, raise error if not."""
        if not self._connected:
            raise SaynaNotConnectedError

    def _check_ready(self) -> None:
        """Check if ready, raise error if not."""
        self._check_connected()
        if not self._ready:
            raise SaynaNotReadyError

    async def _send_json(self, data: dict[str, Any]) -> None:
        """Send JSON message to WebSocket."""
        self._check_connected()
        if self._ws:
            await self._ws.send_json(data)
            logger.debug("Sent: %s", data)

    async def _receive_loop(self) -> None:
        """Receive messages from WebSocket in a loop."""
        try:
            if not self._ws:
                return

            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    await self._handle_text_message(msg.data)
                elif msg.type == aiohttp.WSMsgType.BINARY:
                    await self._handle_binary_message(msg.data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error("WebSocket error: %s", self._ws.exception())
                    break
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    logger.info("WebSocket closed")
                    break

        except asyncio.CancelledError:
            logger.debug("Receive loop cancelled")
        except Exception as e:
            logger.exception("Error in receive loop: %s", e)
        finally:
            self._connected = False
            self._ready = False

    async def _handle_text_message(self, data: str) -> None:
        """Handle incoming text (JSON) message."""
        try:
            parsed = json.loads(data)
            msg_type = parsed.get("type")

            logger.debug("Received: %s", parsed)

            if msg_type == "ready":
                await self._handle_ready(ReadyMessage(**parsed))
            elif msg_type == "stt_result":
                await self._handle_stt_result(STTResultMessage(**parsed))
            elif msg_type == "message":
                await self._handle_message(MessageMessage(**parsed))
            elif msg_type == "error":
                await self._handle_error(ErrorMessage(**parsed))
            elif msg_type == "participant_disconnected":
                await self._handle_participant_disconnected(
                    ParticipantDisconnectedMessage(**parsed)
                )
            elif msg_type == "tts_playback_complete":
                await self._handle_tts_playback_complete(TTSPlaybackCompleteMessage(**parsed))
            else:
                logger.warning("Unknown message type: %s", msg_type)

        except ValidationError as e:
            logger.exception("Failed to parse message: %s", e)
        except Exception as e:
            logger.exception("Error handling message: %s", e)

    async def _handle_binary_message(self, data: bytes) -> None:
        """Handle incoming binary (audio) message."""
        logger.debug("Received audio data: %d bytes", len(data))
        if self._on_audio:
            try:
                result = self._on_audio(data)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in audio callback: %s", e)

    async def _handle_ready(self, message: ReadyMessage) -> None:
        """Handle ready message."""
        self._ready = True
        self._livekit_room_name = message.livekit_room_name
        self._livekit_url = message.livekit_url
        self._sayna_participant_identity = message.sayna_participant_identity
        self._sayna_participant_name = message.sayna_participant_name

        logger.info("Ready - LiveKit room: %s", self._livekit_room_name)

        if self._on_ready:
            try:
                result = self._on_ready(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in ready callback: %s", e)

    async def _handle_stt_result(self, message: STTResultMessage) -> None:
        """Handle STT result message."""
        if self._on_stt_result:
            try:
                result = self._on_stt_result(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in STT result callback: %s", e)

    async def _handle_message(self, message: MessageMessage) -> None:
        """Handle message from participant."""
        if self._on_message:
            try:
                result = self._on_message(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in message callback: %s", e)

    async def _handle_error(self, message: ErrorMessage) -> None:
        """Handle error message."""
        logger.error("Server error: %s", message.message)
        if self._on_error:
            try:
                result = self._on_error(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in error callback: %s", e)

    async def _handle_participant_disconnected(
        self, message: ParticipantDisconnectedMessage
    ) -> None:
        """Handle participant disconnected message."""
        logger.info("Participant disconnected: %s", message.participant.identity)
        if self._on_participant_disconnected:
            try:
                result = self._on_participant_disconnected(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in participant disconnected callback: %s", e)

    async def _handle_tts_playback_complete(self, message: TTSPlaybackCompleteMessage) -> None:
        """Handle TTS playback complete message."""
        logger.debug("TTS playback complete at timestamp: %d", message.timestamp)
        if self._on_tts_playback_complete:
            try:
                result = self._on_tts_playback_complete(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.exception("Error in TTS playback complete callback: %s", e)

    # ============================================================================
    # Context Manager Support
    # ============================================================================

    async def __aenter__(self) -> "SaynaClient":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.disconnect()
