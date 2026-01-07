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
    voice_id: Optional[str] = Field(
        default=None,
        description=(
            "Voice identifier for the selected provider. Optional when provider supplies a default."
        ),
    )
    speaking_rate: float = Field(
        default=1.0,
        description=(
            "Speech rate multiplier (e.g., 1.0 for normal, 1.5 for faster). "
            "Defaults to 1.0 when omitted to match documented examples."
        ),
    )
    audio_format: Optional[str] = Field(
        default=None,
        description="Audio format for TTS output (e.g., 'mp3', 'pcm'). Uses server defaults when omitted.",
    )
    sample_rate: Optional[int] = Field(
        default=None,
        description=(
            "Audio sample rate in Hz (e.g., 16000, 44100). "
            "Optional to allow minimal configs shown in the WebSocket examples."
        ),
    )
    connection_timeout: Optional[int] = Field(
        default=None,
        description=(
            "Connection timeout in seconds. Optional override; server default is used when omitted."
        ),
    )
    request_timeout: Optional[int] = Field(
        default=None,
        description=(
            "Request timeout in seconds. Optional override; server default is used when omitted."
        ),
    )
    model: str = Field(..., description="TTS model identifier to use")
    pronunciations: list[Pronunciation] = Field(
        default_factory=list, description="Custom pronunciation overrides"
    )


class LiveKitConfig(BaseModel):
    """LiveKit room configuration for real-time communication."""

    room_name: str = Field(..., description="LiveKit room name to join")
    enable_recording: Optional[bool] = Field(
        default=False,
        description="Whether to enable session recording (defaults to disabled when omitted)",
    )
    sayna_participant_identity: Optional[str] = Field(
        default="sayna-ai",
        description="Identity assigned to the agent participant (defaults to 'sayna-ai')",
    )
    sayna_participant_name: Optional[str] = Field(
        default="Sayna AI",
        description="Display name for the agent participant (defaults to 'Sayna AI')",
    )
    listen_participants: Optional[list[str]] = Field(
        default_factory=list,
        description=(
            "List of participant identities to monitor. Empty list or omission means all participants."
        ),
    )


# ============================================================================
# Outgoing Messages (Client -> Server)
# ============================================================================


class ConfigMessage(BaseModel):
    """Configuration message sent to initialize the Sayna WebSocket connection."""

    type: Literal["config"] = "config"
    stream_id: Optional[str] = Field(
        default=None,
        description="Session identifier used for recording paths; server generates a UUID when omitted",
    )
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


class SipTransferMessage(BaseModel):
    """Message to initiate a SIP call transfer via LiveKit."""

    type: Literal["sip_transfer"] = "sip_transfer"
    transfer_to: str = Field(
        ...,
        description=(
            "Destination to transfer the call to. Accepts E.164 numbers with '+', national numbers, "
            "or internal extensions. LiveKit must be configured and an active SIP participant must exist."
        ),
    )


# ============================================================================
# Incoming Messages (Server -> Client)
# ============================================================================


class ReadyMessage(BaseModel):
    """Message received when the Sayna connection is ready."""

    type: Literal["ready"] = "ready"
    stream_id: Optional[str] = Field(
        default=None,
        description="Session identifier returned by server; may be auto-generated if not provided in config",
    )
    livekit_room_name: Optional[str] = Field(
        default=None, description="LiveKit room name (present only when LiveKit is configured)"
    )
    livekit_url: Optional[str] = Field(
        default=None, description="LiveKit WebSocket URL configured on the server (when available)"
    )
    sayna_participant_identity: Optional[str] = Field(
        default=None,
        description="Identity assigned to the agent participant when LiveKit is configured",
    )
    sayna_participant_name: Optional[str] = Field(
        default=None,
        description="Display name assigned to the agent participant when LiveKit is configured",
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


class SipTransferErrorMessage(BaseModel):
    """SIP transfer-specific error returned by the Sayna server."""

    type: Literal["sip_transfer_error"] = "sip_transfer_error"
    message: str = Field(..., description="Human-readable SIP transfer error description")


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


class SipHook(BaseModel):
    """A SIP webhook hook configuration.

    Defines a mapping between a SIP domain pattern and a webhook URL
    that will receive forwarded SIP events.

    The auth_id field is required by the API. It associates inbound SIP calls
    with a tenant for room ownership. When AUTH_REQUIRED=true on the server,
    auth_id must be non-empty. When AUTH_REQUIRED=false, auth_id may be empty
    but must still be provided in the request.
    """

    host: str = Field(
        ...,
        description="SIP domain pattern (case-insensitive) to match incoming SIP requests",
    )
    url: str = Field(
        ...,
        description="HTTPS URL to forward webhook events to when the host pattern matches",
    )
    auth_id: str = Field(
        ...,
        description=(
            "Tenant identifier for this hook (written to LiveKit room metadata). "
            "Required by the API; may be empty when AUTH_REQUIRED=false on the server."
        ),
    )


class SipHooksResponse(BaseModel):
    """Response from GET /sip/hooks and POST /sip/hooks endpoints.

    Contains the list of all configured SIP webhook hooks.
    """

    hooks: list[SipHook] = Field(
        default_factory=list,
        description="List of configured SIP hooks",
    )


class SetSipHooksRequest(BaseModel):
    """Request body for POST /sip/hooks."""

    hooks: list[SipHook] = Field(
        ...,
        description="List of hooks to add or replace. Existing hooks with matching hosts are replaced.",
    )


class DeleteSipHooksRequest(BaseModel):
    """Request body for DELETE /sip/hooks."""

    hosts: list[str] = Field(
        ...,
        min_length=1,
        description="List of host names to remove (case-insensitive). Must contain at least one host.",
    )


class RemoveLiveKitParticipantRequest(BaseModel):
    """Request body for DELETE /livekit/participant.

    Removes a participant from a LiveKit room, forcibly disconnecting them.
    Room names are sent as-is; the SDK does not modify them. Access scoping
    is enforced server-side based on room metadata.
    """

    room_name: str = Field(
        ...,
        description="The LiveKit room name where the participant is connected",
    )
    participant_identity: str = Field(
        ...,
        description="The identity of the participant to remove",
    )


class RemoveLiveKitParticipantResponse(BaseModel):
    """Response from DELETE /livekit/participant.

    Confirms the successful removal of a participant from a LiveKit room.
    A 404 response may indicate "not found or not accessible" when the room
    exists but belongs to a different authenticated context.
    """

    status: str = Field(
        ...,
        description="Status of the removal operation",
    )
    room_name: str = Field(
        ...,
        description="The room name",
    )
    participant_identity: str = Field(
        ...,
        description="The identity of the removed participant",
    )


class MuteLiveKitParticipantRequest(BaseModel):
    """Request body for POST /livekit/participant/mute.

    Mutes or unmutes a participant's published track in a LiveKit room.
    Room names are sent as-is; the SDK does not modify them. Access scoping
    is enforced server-side based on room metadata.
    """

    room_name: str = Field(
        ...,
        description="The LiveKit room name where the participant is connected",
    )
    participant_identity: str = Field(
        ...,
        description="The identity of the participant whose track to mute",
    )
    track_sid: str = Field(
        ...,
        description="The session ID of the track to mute/unmute",
    )
    muted: bool = Field(
        ...,
        description="True to mute, false to unmute",
    )


class MuteLiveKitParticipantResponse(BaseModel):
    """Response from POST /livekit/participant/mute.

    Confirms the mute/unmute operation on a participant's track.
    A 404 response may indicate "not found or not accessible" when the room
    exists but belongs to a different authenticated context.
    """

    room_name: str = Field(
        ...,
        description="The room name",
    )
    participant_identity: str = Field(
        ...,
        description="The identity of the participant",
    )
    track_sid: str = Field(
        ...,
        description="The session ID of the track",
    )
    muted: bool = Field(
        ...,
        description="Current muted state after the operation",
    )


class SipTransferRequest(BaseModel):
    """Request body for POST /sip/transfer.

    Initiates a SIP REFER transfer for a participant in a LiveKit room.
    Room names are sent as-is; the SDK does not modify them. Access scoping
    is enforced server-side based on room metadata.
    """

    room_name: str = Field(
        ...,
        description="The LiveKit room name where the SIP participant is connected",
    )
    participant_identity: str = Field(
        ...,
        description="The identity of the SIP participant to transfer. Can be obtained by listing participants via GET /livekit/rooms/{room_name}",
    )
    transfer_to: str = Field(
        ...,
        description="The phone number to transfer the call to. Supports: international format (+1234567890), national format (07123456789), or internal extensions (1234)",
    )


class SipTransferResponse(BaseModel):
    """Response from POST /sip/transfer.

    Confirms the SIP transfer operation. A status of "initiated" means the transfer
    request was sent but may still be in progress. A status of "completed" means
    the transfer has finished successfully. A 404 response may indicate "not found
    or not accessible" when the room exists but belongs to a different authenticated context.
    """

    status: Literal["initiated", "completed"] = Field(
        ...,
        description="Status of the transfer request",
    )
    room_name: str = Field(
        ...,
        description="The room name where the transfer was initiated",
    )
    participant_identity: str = Field(
        ...,
        description="The identity of the participant being transferred",
    )
    transfer_to: str = Field(
        ...,
        description="The normalized phone number with tel: prefix",
    )


class LiveKitRoomSummary(BaseModel):
    """Summary information for a LiveKit room.

    Returned when listing rooms via GET /livekit/rooms. Room listings are
    scoped to the authenticated context and may return fewer rooms than
    exist on the server.
    """

    name: str = Field(
        ...,
        description="The room name",
    )
    num_participants: int = Field(
        ...,
        description="Number of current participants in the room",
    )
    creation_time: int = Field(
        ...,
        description="Room creation time (Unix timestamp in seconds)",
    )


class LiveKitRoomsResponse(BaseModel):
    """Response from GET /livekit/rooms endpoint.

    Contains the list of LiveKit rooms accessible to the authenticated context.
    Room listings are scoped server-side and may return fewer rooms than exist.
    """

    rooms: list[LiveKitRoomSummary] = Field(
        ...,
        description="List of rooms accessible to the authenticated client",
    )


class LiveKitParticipantInfo(BaseModel):
    """Detailed information about a participant in a LiveKit room.

    Returned as part of the GET /livekit/rooms/{room_name} response.
    """

    sid: str = Field(
        ...,
        description="Unique session ID for this participant (generated by LiveKit)",
    )
    identity: str = Field(
        ...,
        description="Unique identifier provided when connecting",
    )
    name: str = Field(
        ...,
        description="Display name of the participant",
    )
    state: Literal["JOINING", "JOINED", "ACTIVE", "DISCONNECTED", "UNKNOWN"] = Field(
        ...,
        description="Participant state",
    )
    kind: Literal["STANDARD", "AGENT", "SIP", "EGRESS", "INGRESS", "UNKNOWN"] = Field(
        ...,
        description="Participant kind/type",
    )
    joined_at: int = Field(
        ...,
        description="Timestamp when participant joined (Unix timestamp in seconds)",
    )
    metadata: str = Field(
        ...,
        description="User-specified metadata for the participant",
    )
    attributes: dict[str, str] = Field(
        ...,
        description="User-specified attributes for the participant",
    )
    is_publisher: bool = Field(
        ...,
        description="Whether the participant is currently publishing audio/video",
    )


class LiveKitRoomDetails(BaseModel):
    """Detailed information about a LiveKit room including participants.

    Returned from GET /livekit/rooms/{room_name} endpoint. A 404 response may
    indicate "not found or not accessible" when the room exists but belongs to
    a different authenticated context. The metadata field is an opaque string;
    do not parse it for access decisions as access is enforced server-side.
    """

    sid: str = Field(
        ...,
        description="Unique session ID for the room (generated by LiveKit)",
    )
    name: str = Field(
        ...,
        description="The room name",
    )
    num_participants: int = Field(
        ...,
        description="Number of current participants in the room",
    )
    max_participants: int = Field(
        ...,
        description="Maximum allowed participants (0 = no limit)",
    )
    creation_time: int = Field(
        ...,
        description="Room creation time (Unix timestamp in seconds)",
    )
    metadata: str = Field(
        ...,
        description="Opaque metadata string for the room; do not parse for access decisions",
    )
    active_recording: bool = Field(
        ...,
        description="Whether a recording is currently active",
    )
    participants: list[LiveKitParticipantInfo] = Field(
        ...,
        description="List of participants currently in the room",
    )


# ============================================================================
# Webhook Types
# ============================================================================


class WebhookSIPParticipant(BaseModel):
    """Participant information from a SIP webhook event."""

    name: Optional[str] = Field(
        default=None,
        description="Display name of the SIP participant (may be None if not provided)",
    )
    identity: str = Field(..., description="Unique identity assigned to the participant")
    sid: str = Field(..., description="Participant session ID from LiveKit")


class WebhookSIPRoom(BaseModel):
    """Room information from a SIP webhook event."""

    name: str = Field(..., description="Name of the LiveKit room")
    sid: str = Field(..., description="Room session ID from LiveKit")


class WebhookSIPOutput(BaseModel):
    """SIP webhook payload sent from Sayna service.

    This represents a cryptographically signed webhook event forwarded by Sayna
    when a SIP participant joins a LiveKit room. Use the WebhookReceiver class
    to verify the signature and parse this payload securely.

    See Also:
        WebhookReceiver: Class for verifying and receiving webhooks

    Example:
        >>> from sayna_client import WebhookReceiver
        >>> receiver = WebhookReceiver("your-secret-key")
        >>> webhook = receiver.receive(headers, raw_body)
        >>> print(f"From: {webhook.from_phone_number}")
        >>> print(f"To: {webhook.to_phone_number}")
        >>> print(f"Room: {webhook.room.name}")
    """

    participant: WebhookSIPParticipant = Field(..., description="SIP participant information")
    room: WebhookSIPRoom = Field(..., description="LiveKit room information")
    from_phone_number: str = Field(
        ...,
        description="Caller's phone number (E.164 format, e.g., '+15559876543')",
    )
    to_phone_number: str = Field(
        ...,
        description="Called phone number (E.164 format, e.g., '+15551234567')",
    )
    room_prefix: str = Field(..., description="Room name prefix configured in Sayna (e.g., 'sip-')")
    sip_host: str = Field(
        ..., description="SIP domain extracted from the To header (e.g., 'example.com')"
    )


# ============================================================================
# Union Types
# ============================================================================

OutgoingMessage = Union[
    ReadyMessage,
    STTResultMessage,
    ErrorMessage,
    SipTransferErrorMessage,
    MessageMessage,
    ParticipantDisconnectedMessage,
    TTSPlaybackCompleteMessage,
]
