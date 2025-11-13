"""Sayna Python SDK for server-side WebSocket connections."""

from sayna_client.client import SaynaClient
from sayna_client.errors import (
    SaynaConnectionError,
    SaynaError,
    SaynaNotConnectedError,
    SaynaNotReadyError,
    SaynaServerError,
    SaynaValidationError,
)
from sayna_client.types import (
    ClearMessage,
    ConfigMessage,
    ErrorMessage,
    HealthResponse,
    LiveKitConfig,
    LiveKitTokenRequest,
    LiveKitTokenResponse,
    MessageMessage,
    OutgoingMessage,
    Participant,
    ParticipantDisconnectedMessage,
    Pronunciation,
    ReadyMessage,
    SaynaMessage,
    SendMessageMessage,
    SpeakMessage,
    SpeakRequest,
    STTConfig,
    STTResultMessage,
    TTSConfig,
    TTSPlaybackCompleteMessage,
    VoiceDescriptor,
)

__version__ = "0.0.5"

__all__ = [
    # Client
    "SaynaClient",
    # Errors
    "SaynaError",
    "SaynaNotConnectedError",
    "SaynaNotReadyError",
    "SaynaConnectionError",
    "SaynaValidationError",
    "SaynaServerError",
    # Configuration Types
    "STTConfig",
    "TTSConfig",
    "LiveKitConfig",
    "Pronunciation",
    # WebSocket Message Types
    "ConfigMessage",
    "SpeakMessage",
    "ClearMessage",
    "SendMessageMessage",
    "ReadyMessage",
    "STTResultMessage",
    "ErrorMessage",
    "SaynaMessage",
    "MessageMessage",
    "Participant",
    "ParticipantDisconnectedMessage",
    "TTSPlaybackCompleteMessage",
    "OutgoingMessage",
    # REST API Types
    "HealthResponse",
    "VoiceDescriptor",
    "LiveKitTokenRequest",
    "LiveKitTokenResponse",
    "SpeakRequest",
]
