"""Type definitions for the Sayna SDK."""

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field, RootModel


class Pronunciation(BaseModel):
    """Word pronunciation override for text-to-speech."""

    word: str = Field(..., description="The word to be pronounced differently")
    pronunciation: str = Field(..., description="Phonetic pronunciation or alternative spelling")


class STTConfig(BaseModel):
    """Speech-to-Text (STT) configuration options."""

    provider: str = Field(..., description="The STT provider to use (e.g., 'deepgram', 'google')")
    language: str = Field(..., description="Language code for speech recognition (e.g., 'en-US')")
    sample_rate: int = Field(..., description="Audio sample rate in Hz (e.g., 16000, 44100)")
    channels: int = Field(..., description="Number of audio channels (1 for mono, 2 for stereo)")
    punctuation: bool = Field(..., description="Whether to include punctuation in transcriptions")
    encoding: str = Field(..., description="Audio encoding format (e.g., 'linear16', 'opus')")
    model: str = Field(..., description="STT model identifier to use")


class TTSConfig(BaseModel):
    """Text-to-Speech (TTS) configuration options."""

    provider: str = Field(..., description="The TTS provider to use (e.g., 'elevenlabs', 'google')")
    voice_id: str = Field(..., description="Voice identifier for the selected provider")
    speaking_rate: float = Field(
        ..., description="Speech rate multiplier (e.g., 1.0 for normal, 1.5 for faster)"
    )
    audio_format: str = Field(..., description="Audio format for TTS output (e.g., 'mp3', 'pcm')")
    sample_rate: int = Field(..., description="Audio sample rate in Hz (e.g., 16000, 44100)")
    connection_timeout: int = Field(..., description="Connection timeout in milliseconds")
    request_timeout: int = Field(..., description="Request timeout in milliseconds")
    model: str = Field(..., description="TTS model identifier to use")
    pronunciations: list[Pronunciation] = Field(
        default_factory=list, description="Custom pronunciation overrides"
    )


class LiveKitConfig(BaseModel):
    """LiveKit room configuration for real-time communication."""

    room_name: str = Field(..., description="LiveKit room name to join")
    enable_recording: Optional[bool] = Field(
        default=False, description="Whether to enable session recording"
    )
    recording_file_key: Optional[str] = Field(
        default=None,
        description="Storage key for the recording file (required when enable_recording is true)",
    )
    sayna_participant_identity: Optional[str] = Field(
        default="sayna-ai", description="Identity assigned to the agent participant"
    )
    sayna_participant_name: Optional[str] = Field(
        default="Sayna AI", description="Display name for the agent participant"
    )
    listen_participants: Optional[list[str]] = Field(
        default_factory=list,
        description="List of participant identities to monitor (empty = all participants)",
    )


# ============================================================================
# Outgoing Messages (Client -> Server)
# ============================================================================


class ConfigMessage(BaseModel):
    """Configuration message sent to initialize the Sayna WebSocket connection."""

    type: Literal["config"] = "config"
    audio: Optional[bool] = Field(default=True, description="Whether audio streaming is enabled")
    stt_config: Optional[STTConfig] = Field(
        default=None, description="Speech-to-text configuration (required when audio=true)"
    )
    tts_config: Optional[TTSConfig] = Field(
        default=None, description="Text-to-speech configuration (required when audio=true)"
    )
    livekit: Optional[LiveKitConfig] = Field(
        default=None, description="Optional LiveKit room configuration"
    )


class SpeakMessage(BaseModel):
    """Message to request text-to-speech synthesis."""

    type: Literal["speak"] = "speak"
    text: str = Field(..., description="Text to synthesize")
    flush: Optional[bool] = Field(
        default=None, description="Whether to flush the TTS queue before speaking"
    )
    allow_interruption: Optional[bool] = Field(
        default=None, description="Whether this speech can be interrupted"
    )


class ClearMessage(BaseModel):
    """Message to clear the TTS queue."""

    type: Literal["clear"] = "clear"


class SendMessageMessage(BaseModel):
    """Message to send data to the Sayna session."""

    type: Literal["send_message"] = "send_message"
    message: str = Field(..., description="Message content")
    role: str = Field(..., description="Message role (e.g., 'user', 'assistant')")
    topic: Optional[str] = Field(default=None, description="Optional topic identifier")
    debug: Optional[dict[str, Any]] = Field(default=None, description="Optional debug metadata")


# ============================================================================
# Incoming Messages (Server -> Client)
# ============================================================================


class ReadyMessage(BaseModel):
    """Message received when the Sayna connection is ready."""

    type: Literal["ready"] = "ready"
    livekit_room_name: Optional[str] = Field(
        default=None, description="LiveKit room name (present only when LiveKit is enabled)"
    )
    livekit_url: str = Field(..., description="LiveKit WebSocket URL configured on the server")
    sayna_participant_identity: Optional[str] = Field(
        default=None,
        description="Identity assigned to the agent participant when LiveKit is enabled",
    )
    sayna_participant_name: Optional[str] = Field(
        default=None,
        description="Display name assigned to the agent participant when LiveKit is enabled",
    )


class STTResultMessage(BaseModel):
    """Speech-to-text transcription result."""

    type: Literal["stt_result"] = "stt_result"
    transcript: str = Field(..., description="Transcribed text")
    is_final: bool = Field(..., description="Whether this is a final transcription")
    is_speech_final: bool = Field(..., description="Whether speech has concluded")
    confidence: float = Field(..., description="Transcription confidence score (0-1)")


class ErrorMessage(BaseModel):
    """Error message from the Sayna server."""

    type: Literal["error"] = "error"
    message: str = Field(..., description="Error description")


class SaynaMessage(BaseModel):
    """Message data from a Sayna session participant."""

    message: Optional[str] = Field(default=None, description="Message content")
    data: Optional[str] = Field(default=None, description="Additional data payload")
    identity: str = Field(..., description="Participant identity")
    topic: str = Field(..., description="Message topic")
    room: str = Field(..., description="Room identifier")
    timestamp: int = Field(..., description="Unix timestamp in milliseconds")


class MessageMessage(BaseModel):
    """Wrapper for participant messages."""

    type: Literal["message"] = "message"
    message: SaynaMessage = Field(..., description="The message data")


class Participant(BaseModel):
    """Information about a session participant."""

    identity: str = Field(..., description="Unique participant identity")
    name: Optional[str] = Field(default=None, description="Optional display name")
    room: str = Field(..., description="Room identifier")
    timestamp: int = Field(..., description="Unix timestamp in milliseconds")


class ParticipantDisconnectedMessage(BaseModel):
    """Message received when a participant disconnects."""

    type: Literal["participant_disconnected"] = "participant_disconnected"
    participant: Participant = Field(..., description="The disconnected participant")


class TTSPlaybackCompleteMessage(BaseModel):
    """Message received when the TTS playback is complete."""

    type: Literal["tts_playback_complete"] = "tts_playback_complete"
    timestamp: int = Field(..., description="Unix timestamp in milliseconds")


# ============================================================================
# REST API Types
# ============================================================================


class HealthResponse(BaseModel):
    """Response from GET / health endpoint."""

    status: str = Field(..., description="Health status (should be 'OK')")


class VoiceDescriptor(BaseModel):
    """Voice descriptor from a TTS provider."""

    id: str = Field(..., description="Provider-specific identifier for the voice profile")
    sample: str = Field(default="", description="URL to a preview audio sample")
    name: str = Field(..., description="Human-readable name supplied by the provider")
    accent: str = Field(default="Unknown", description="Detected accent associated with the voice")
    gender: str = Field(
        default="Unknown", description="Inferred gender label from provider metadata"
    )
    language: str = Field(default="Unknown", description="Primary language for synthesis")


class VoicesResponse(RootModel[dict[str, list[VoiceDescriptor]]]):
    """Response from GET /voices endpoint.

    Dictionary where keys are provider names and values are lists of voice descriptors.
    """

    root: dict[str, list[VoiceDescriptor]]


class LiveKitTokenRequest(BaseModel):
    """Request body for POST /livekit/token."""

    room_name: str = Field(..., description="LiveKit room to join or create")
    participant_name: str = Field(..., description="Display name assigned to the participant")
    participant_identity: str = Field(..., description="Unique identifier for the participant")


class LiveKitTokenResponse(BaseModel):
    """Response from POST /livekit/token."""

    token: str = Field(..., description="JWT granting LiveKit permissions")
    room_name: str = Field(..., description="Echo of the requested room")
    participant_identity: str = Field(..., description="Echo of the requested identity")
    livekit_url: str = Field(..., description="WebSocket endpoint for the LiveKit server")


class SpeakRequest(BaseModel):
    """Request body for POST /speak."""

    text: str = Field(..., description="Text to convert to speech")
    tts_config: TTSConfig = Field(..., description="Provider configuration without API credentials")


# ============================================================================
# Union Types
# ============================================================================

OutgoingMessage = Union[
    ReadyMessage,
    STTResultMessage,
    ErrorMessage,
    MessageMessage,
    ParticipantDisconnectedMessage,
    TTSPlaybackCompleteMessage,
]
