"""Tests for Pydantic type models."""

import pytest
from pydantic import ValidationError

from sayna_client.types import (
    ClearMessage,
    ConfigMessage,
    ErrorMessage,
    LiveKitConfig,
    LiveKitParticipantInfo,
    LiveKitRoomDetails,
    LiveKitRoomsResponse,
    LiveKitRoomSummary,
    MuteLiveKitParticipantRequest,
    MuteLiveKitParticipantResponse,
    Pronunciation,
    ReadyMessage,
    RemoveLiveKitParticipantRequest,
    RemoveLiveKitParticipantResponse,
    SendMessageMessage,
    SipHook,
    SipTransferErrorMessage,
    SipTransferMessage,
    SipTransferRequest,
    SipTransferResponse,
    SpeakMessage,
    STTConfig,
    STTResultMessage,
    TTSConfig,
)


class TestSTTConfig:
    """Tests for STTConfig model."""

    def test_valid_stt_config(self) -> None:
        """Test creating a valid STT configuration."""
        config = STTConfig(
            provider="deepgram",
            language="en-US",
            sample_rate=16000,
            channels=1,
            punctuation=True,
            encoding="linear16",
            model="nova-2",
        )
        assert config.provider == "deepgram"
        assert config.language == "en-US"
        assert config.sample_rate == 16000

    def test_invalid_stt_config(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            STTConfig(provider="deepgram")  # type: ignore[call-arg]


class TestTTSConfig:
    """Tests for TTSConfig model."""

    def test_valid_tts_config(self) -> None:
        """Test creating a valid TTS configuration."""
        config = TTSConfig(
            provider="elevenlabs",
            voice_id="voice-123",
            speaking_rate=1.0,
            audio_format="mp3",
            sample_rate=24000,
            connection_timeout=5000,
            request_timeout=10000,
            model="eleven_multilingual_v2",
            pronunciations=[],
        )
        assert config.provider == "elevenlabs"
        assert config.voice_id == "voice-123"
        assert config.pronunciations == []

    def test_tts_config_with_pronunciations(self) -> None:
        """Test TTS config with pronunciation overrides."""
        config = TTSConfig(
            provider="elevenlabs",
            voice_id="voice-123",
            speaking_rate=1.0,
            audio_format="mp3",
            sample_rate=24000,
            connection_timeout=5000,
            request_timeout=10000,
            model="eleven_multilingual_v2",
            pronunciations=[Pronunciation(word="Sayna", pronunciation="say-nah")],
        )
        assert len(config.pronunciations) == 1
        assert config.pronunciations[0].word == "Sayna"

    def test_minimal_tts_config(self) -> None:
        """Test that minimal doc-style TTS config is accepted."""
        config = TTSConfig(
            provider="deepgram",
            model="aura-asteria-en",
        )
        assert config.speaking_rate == 1.0
        assert config.audio_format is None
        assert config.sample_rate is None
        assert config.pronunciations == []


class TestLiveKitConfig:
    """Tests for LiveKitConfig model."""

    def test_valid_livekit_config(self) -> None:
        """Test creating a valid LiveKit configuration."""
        config = LiveKitConfig(
            room_name="test-room",
            enable_recording=True,
        )
        assert config.room_name == "test-room"
        assert config.enable_recording is True

    def test_livekit_config_defaults(self) -> None:
        """Test LiveKit config with default values."""
        config = LiveKitConfig(room_name="test-room")
        assert config.room_name == "test-room"
        assert config.enable_recording is False  # Default changed to False
        assert config.sayna_participant_identity == "sayna-ai"  # Default
        assert config.sayna_participant_name == "Sayna AI"  # Default
        assert config.listen_participants == []  # Default


class TestMessages:
    """Tests for message types."""

    def test_config_message(self) -> None:
        """Test creating a config message."""
        stt = STTConfig(
            provider="deepgram",
            language="en-US",
            sample_rate=16000,
            channels=1,
            punctuation=True,
            encoding="linear16",
            model="nova-2",
        )
        tts = TTSConfig(
            provider="elevenlabs",
            voice_id="voice-123",
            speaking_rate=1.0,
            audio_format="mp3",
            sample_rate=24000,
            connection_timeout=5000,
            request_timeout=10000,
            model="eleven_multilingual_v2",
        )

        msg = ConfigMessage(
            audio=True,
            stt_config=stt,
            tts_config=tts,
        )
        assert msg.type == "config"
        assert msg.audio is True
        assert msg.stt_config.provider == "deepgram"

    def test_config_message_control_only(self) -> None:
        """Config should allow control-only sessions without audio configs."""
        msg = ConfigMessage(audio=False)
        assert msg.type == "config"
        assert msg.audio is False
        assert msg.stt_config is None
        assert msg.tts_config is None

    def test_speak_message(self) -> None:
        """Test creating a speak message."""
        msg = SpeakMessage(
            text="Hello world",
            flush=True,
            allow_interruption=False,
        )
        assert msg.type == "speak"
        assert msg.text == "Hello world"
        assert msg.flush is True

    def test_clear_message(self) -> None:
        """Test creating a clear message."""
        msg = ClearMessage()
        assert msg.type == "clear"

    def test_send_message_message(self) -> None:
        """Test creating a send message."""
        msg = SendMessageMessage(
            message="Test message",
            role="assistant",
            topic="chat",
            debug={"key": "value"},
        )
        assert msg.type == "send_message"
        assert msg.message == "Test message"
        assert msg.role == "assistant"

    def test_ready_message(self) -> None:
        """Test parsing a ready message."""
        msg = ReadyMessage(
            livekit_room_name="test-room",
            livekit_url="wss://livekit.example.com",
            sayna_participant_identity="sayna-ai",
            sayna_participant_name="Sayna AI",
        )
        assert msg.type == "ready"
        assert msg.livekit_room_name == "test-room"
        assert msg.livekit_url == "wss://livekit.example.com"
        assert msg.sayna_participant_identity == "sayna-ai"
        assert msg.sayna_participant_name == "Sayna AI"

    def test_stt_result_message(self) -> None:
        """Test parsing an STT result message."""
        msg = STTResultMessage(
            transcript="Hello world",
            is_final=True,
            is_speech_final=True,
            confidence=0.95,
        )
        assert msg.type == "stt_result"
        assert msg.transcript == "Hello world"
        assert msg.confidence == 0.95

    def test_error_message(self) -> None:
        """Test parsing an error message."""
        msg = ErrorMessage(message="Something went wrong")
        assert msg.type == "error"
        assert msg.message == "Something went wrong"

    def test_ready_message_without_livekit_fields(self) -> None:
        """Ready message should allow missing LiveKit details when not configured."""
        msg = ReadyMessage()
        assert msg.type == "ready"
        assert msg.livekit_room_name is None
        assert msg.livekit_url is None

    def test_sip_transfer_message(self) -> None:
        """Test creating a SIP transfer message."""
        msg = SipTransferMessage(transfer_to="+1234567890")
        assert msg.type == "sip_transfer"
        assert msg.transfer_to == "+1234567890"

    def test_sip_transfer_error_message(self) -> None:
        """Test parsing a SIP transfer error message."""
        msg = SipTransferErrorMessage(message="No SIP participant found")
        assert msg.type == "sip_transfer_error"
        assert msg.message == "No SIP participant found"


class TestLiveKitRoomsTypes:
    """Tests for LiveKit rooms REST API types."""

    def test_livekit_room_summary(self) -> None:
        """Test creating a LiveKitRoomSummary with sample data."""
        room = LiveKitRoomSummary(
            name="project1_conversation-room-123",
            num_participants=2,
            creation_time=1703123456,
        )
        assert room.name == "project1_conversation-room-123"
        assert room.num_participants == 2
        assert room.creation_time == 1703123456

    def test_livekit_room_summary_zero_participants(self) -> None:
        """Test LiveKitRoomSummary with zero participants."""
        room = LiveKitRoomSummary(
            name="project1_room-2",
            num_participants=0,
            creation_time=1703123789,
        )
        assert room.name == "project1_room-2"
        assert room.num_participants == 0
        assert room.creation_time == 1703123789

    def test_livekit_rooms_response(self) -> None:
        """Test creating LiveKitRoomsResponse from API payload."""
        response = LiveKitRoomsResponse(
            rooms=[
                LiveKitRoomSummary(
                    name="project1_conversation-room-123",
                    num_participants=2,
                    creation_time=1703123456,
                ),
                LiveKitRoomSummary(
                    name="project1_room-2",
                    num_participants=0,
                    creation_time=1703123789,
                ),
            ]
        )
        assert len(response.rooms) == 2
        assert response.rooms[0].name == "project1_conversation-room-123"
        assert response.rooms[0].num_participants == 2
        assert response.rooms[1].name == "project1_room-2"
        assert response.rooms[1].creation_time == 1703123789

    def test_livekit_rooms_response_empty(self) -> None:
        """Test LiveKitRoomsResponse with empty rooms list."""
        response = LiveKitRoomsResponse(rooms=[])
        assert response.rooms == []
        assert len(response.rooms) == 0

    def test_livekit_rooms_response_from_dict(self) -> None:
        """Test parsing LiveKitRoomsResponse from dict (as returned by API)."""
        data = {
            "rooms": [
                {
                    "name": "project1_conversation-room-123",
                    "num_participants": 2,
                    "creation_time": 1703123456,
                },
                {
                    "name": "project1_room-2",
                    "num_participants": 0,
                    "creation_time": 1703123789,
                },
            ]
        }
        response = LiveKitRoomsResponse(**data)
        assert len(response.rooms) == 2
        assert response.rooms[0].name == "project1_conversation-room-123"
        assert response.rooms[0].num_participants == 2
        assert response.rooms[0].creation_time == 1703123456
        assert response.rooms[1].name == "project1_room-2"
        assert response.rooms[1].num_participants == 0
        assert response.rooms[1].creation_time == 1703123789

    def test_livekit_room_summary_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            LiveKitRoomSummary(name="test-room")  # type: ignore[call-arg]

    def test_livekit_rooms_response_missing_rooms(self) -> None:
        """Test that missing rooms field raises validation error."""
        with pytest.raises(ValidationError):
            LiveKitRoomsResponse()  # type: ignore[call-arg]


class TestLiveKitRoomDetailsTypes:
    """Tests for LiveKit room details REST API types."""

    def test_livekit_participant_info(self) -> None:
        """Test creating a LiveKitParticipantInfo with sample data from api-updates.md."""
        participant = LiveKitParticipantInfo(
            sid="PA_abc123",
            identity="user-alice-456",
            name="Alice Smith",
            state="ACTIVE",
            kind="STANDARD",
            joined_at=1703123456,
            metadata='{"role": "host"}',
            attributes={},
            is_publisher=True,
        )
        assert participant.sid == "PA_abc123"
        assert participant.identity == "user-alice-456"
        assert participant.name == "Alice Smith"
        assert participant.state == "ACTIVE"
        assert participant.kind == "STANDARD"
        assert participant.joined_at == 1703123456
        assert participant.metadata == '{"role": "host"}'
        assert participant.attributes == {}
        assert participant.is_publisher is True

    def test_livekit_participant_info_with_attributes(self) -> None:
        """Test LiveKitParticipantInfo with non-empty attributes."""
        participant = LiveKitParticipantInfo(
            sid="PA_xyz789",
            identity="agent-1",
            name="AI Agent",
            state="JOINED",
            kind="AGENT",
            joined_at=1703123500,
            metadata="",
            attributes={"role": "assistant", "version": "1.0"},
            is_publisher=False,
        )
        assert participant.kind == "AGENT"
        assert participant.attributes == {"role": "assistant", "version": "1.0"}
        assert participant.is_publisher is False

    def test_livekit_participant_info_all_states(self) -> None:
        """Test that all participant states are accepted."""
        for state in ["JOINING", "JOINED", "ACTIVE", "DISCONNECTED", "UNKNOWN"]:
            participant = LiveKitParticipantInfo(
                sid="PA_test",
                identity="test-user",
                name="Test",
                state=state,  # type: ignore[arg-type]
                kind="STANDARD",
                joined_at=1703123456,
                metadata="",
                attributes={},
                is_publisher=False,
            )
            assert participant.state == state

    def test_livekit_participant_info_all_kinds(self) -> None:
        """Test that all participant kinds are accepted."""
        for kind in ["STANDARD", "AGENT", "SIP", "EGRESS", "INGRESS", "UNKNOWN"]:
            participant = LiveKitParticipantInfo(
                sid="PA_test",
                identity="test-user",
                name="Test",
                state="ACTIVE",
                kind=kind,  # type: ignore[arg-type]
                joined_at=1703123456,
                metadata="",
                attributes={},
                is_publisher=False,
            )
            assert participant.kind == kind

    def test_livekit_room_details(self) -> None:
        """Test creating a LiveKitRoomDetails with sample data from api-updates.md."""
        room = LiveKitRoomDetails(
            sid="RM_xyz789",
            name="project1_conversation-room-123",
            num_participants=2,
            max_participants=10,
            creation_time=1703123456,
            metadata="",
            active_recording=False,
            participants=[
                LiveKitParticipantInfo(
                    sid="PA_abc123",
                    identity="user-alice-456",
                    name="Alice Smith",
                    state="ACTIVE",
                    kind="STANDARD",
                    joined_at=1703123456,
                    metadata='{"role": "host"}',
                    attributes={},
                    is_publisher=True,
                )
            ],
        )
        assert room.sid == "RM_xyz789"
        assert room.name == "project1_conversation-room-123"
        assert room.num_participants == 2
        assert room.max_participants == 10
        assert room.creation_time == 1703123456
        assert room.metadata == ""
        assert room.active_recording is False
        assert len(room.participants) == 1
        assert room.participants[0].identity == "user-alice-456"

    def test_livekit_room_details_empty_participants(self) -> None:
        """Test LiveKitRoomDetails with no participants."""
        room = LiveKitRoomDetails(
            sid="RM_empty",
            name="project1_empty-room",
            num_participants=0,
            max_participants=0,
            creation_time=1703123456,
            metadata="test metadata",
            active_recording=True,
            participants=[],
        )
        assert room.num_participants == 0
        assert room.max_participants == 0
        assert room.metadata == "test metadata"
        assert room.active_recording is True
        assert room.participants == []

    def test_livekit_room_details_from_dict(self) -> None:
        """Test parsing LiveKitRoomDetails from dict (as returned by API)."""
        data = {
            "sid": "RM_xyz789",
            "name": "project1_conversation-room-123",
            "num_participants": 2,
            "max_participants": 10,
            "creation_time": 1703123456,
            "metadata": "",
            "active_recording": False,
            "participants": [
                {
                    "sid": "PA_abc123",
                    "identity": "user-alice-456",
                    "name": "Alice Smith",
                    "state": "ACTIVE",
                    "kind": "STANDARD",
                    "joined_at": 1703123456,
                    "metadata": '{"role": "host"}',
                    "attributes": {},
                    "is_publisher": True,
                }
            ],
        }
        room = LiveKitRoomDetails(**data)
        assert room.sid == "RM_xyz789"
        assert room.name == "project1_conversation-room-123"
        assert len(room.participants) == 1
        assert room.participants[0].sid == "PA_abc123"
        assert room.participants[0].state == "ACTIVE"
        assert room.participants[0].kind == "STANDARD"

    def test_livekit_participant_info_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            LiveKitParticipantInfo(sid="PA_test", identity="test")  # type: ignore[call-arg]

    def test_livekit_room_details_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            LiveKitRoomDetails(sid="RM_test", name="test")  # type: ignore[call-arg]


class TestRemoveLiveKitParticipantTypes:
    """Tests for RemoveLiveKitParticipant request/response types."""

    def test_remove_livekit_participant_request(self) -> None:
        """Test creating a RemoveLiveKitParticipantRequest with sample data."""
        request = RemoveLiveKitParticipantRequest(
            room_name="conversation-room-123",
            participant_identity="user-alice-456",
        )
        assert request.room_name == "conversation-room-123"
        assert request.participant_identity == "user-alice-456"

    def test_remove_livekit_participant_response(self) -> None:
        """Test creating a RemoveLiveKitParticipantResponse with sample data from api-updates.md."""
        response = RemoveLiveKitParticipantResponse(
            status="removed",
            room_name="project1_conversation-room-123",
            participant_identity="user-alice-456",
        )
        assert response.status == "removed"
        assert response.room_name == "project1_conversation-room-123"
        assert response.participant_identity == "user-alice-456"

    def test_remove_livekit_participant_request_from_dict(self) -> None:
        """Test parsing RemoveLiveKitParticipantRequest from dict."""
        data = {
            "room_name": "conversation-room-123",
            "participant_identity": "user-alice-456",
        }
        request = RemoveLiveKitParticipantRequest(**data)
        assert request.room_name == "conversation-room-123"
        assert request.participant_identity == "user-alice-456"

    def test_remove_livekit_participant_response_from_dict(self) -> None:
        """Test parsing RemoveLiveKitParticipantResponse from dict (as returned by API)."""
        data = {
            "status": "removed",
            "room_name": "project1_conversation-room-123",
            "participant_identity": "user-alice-456",
        }
        response = RemoveLiveKitParticipantResponse(**data)
        assert response.status == "removed"
        assert response.room_name == "project1_conversation-room-123"
        assert response.participant_identity == "user-alice-456"

    def test_remove_livekit_participant_request_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            RemoveLiveKitParticipantRequest(room_name="test-room")  # type: ignore[call-arg]

    def test_remove_livekit_participant_response_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            RemoveLiveKitParticipantResponse(status="removed")  # type: ignore[call-arg]


class TestMuteLiveKitParticipantTypes:
    """Tests for MuteLiveKitParticipant request/response types."""

    def test_mute_livekit_participant_request(self) -> None:
        """Test creating a MuteLiveKitParticipantRequest with sample data from api-updates.md."""
        request = MuteLiveKitParticipantRequest(
            room_name="conversation-room-123",
            participant_identity="user-alice-456",
            track_sid="TR_abc123",
            muted=True,
        )
        assert request.room_name == "conversation-room-123"
        assert request.participant_identity == "user-alice-456"
        assert request.track_sid == "TR_abc123"
        assert request.muted is True

    def test_mute_livekit_participant_request_unmute(self) -> None:
        """Test MuteLiveKitParticipantRequest for unmuting (muted=False)."""
        request = MuteLiveKitParticipantRequest(
            room_name="test-room",
            participant_identity="user-bob",
            track_sid="TR_xyz789",
            muted=False,
        )
        assert request.muted is False

    def test_mute_livekit_participant_response(self) -> None:
        """Test creating a MuteLiveKitParticipantResponse with sample data from api-updates.md."""
        response = MuteLiveKitParticipantResponse(
            room_name="project1_conversation-room-123",
            participant_identity="user-alice-456",
            track_sid="TR_abc123",
            muted=True,
        )
        assert response.room_name == "project1_conversation-room-123"
        assert response.participant_identity == "user-alice-456"
        assert response.track_sid == "TR_abc123"
        assert response.muted is True

    def test_mute_livekit_participant_response_unmuted(self) -> None:
        """Test MuteLiveKitParticipantResponse with muted=False."""
        response = MuteLiveKitParticipantResponse(
            room_name="project1_test-room",
            participant_identity="user-bob",
            track_sid="TR_xyz789",
            muted=False,
        )
        assert response.muted is False

    def test_mute_livekit_participant_request_from_dict(self) -> None:
        """Test parsing MuteLiveKitParticipantRequest from dict."""
        data = {
            "room_name": "conversation-room-123",
            "participant_identity": "user-alice-456",
            "track_sid": "TR_abc123",
            "muted": True,
        }
        request = MuteLiveKitParticipantRequest(**data)
        assert request.room_name == "conversation-room-123"
        assert request.participant_identity == "user-alice-456"
        assert request.track_sid == "TR_abc123"
        assert request.muted is True

    def test_mute_livekit_participant_response_from_dict(self) -> None:
        """Test parsing MuteLiveKitParticipantResponse from dict (as returned by API)."""
        data = {
            "room_name": "project1_conversation-room-123",
            "participant_identity": "user-alice-456",
            "track_sid": "TR_abc123",
            "muted": True,
        }
        response = MuteLiveKitParticipantResponse(**data)
        assert response.room_name == "project1_conversation-room-123"
        assert response.participant_identity == "user-alice-456"
        assert response.track_sid == "TR_abc123"
        assert response.muted is True

    def test_mute_livekit_participant_request_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            MuteLiveKitParticipantRequest(
                room_name="test-room",
                participant_identity="user-alice",
            )  # type: ignore[call-arg]

    def test_mute_livekit_participant_response_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            MuteLiveKitParticipantResponse(
                room_name="test-room",
                participant_identity="user-alice",
            )  # type: ignore[call-arg]


class TestSipTransferTypes:
    """Tests for SIP transfer REST API types."""

    def test_sip_transfer_request(self) -> None:
        """Test creating a SipTransferRequest with sample data from api-updates.md."""
        request = SipTransferRequest(
            room_name="call-room-123",
            participant_identity="sip_participant_456",
            transfer_to="+15551234567",
        )
        assert request.room_name == "call-room-123"
        assert request.participant_identity == "sip_participant_456"
        assert request.transfer_to == "+15551234567"

    def test_sip_transfer_request_national_format(self) -> None:
        """Test SipTransferRequest with national phone number format."""
        request = SipTransferRequest(
            room_name="my-room",
            participant_identity="sip-user-1",
            transfer_to="07123456789",
        )
        assert request.transfer_to == "07123456789"

    def test_sip_transfer_request_extension(self) -> None:
        """Test SipTransferRequest with internal extension."""
        request = SipTransferRequest(
            room_name="my-room",
            participant_identity="sip-user-1",
            transfer_to="1234",
        )
        assert request.transfer_to == "1234"

    def test_sip_transfer_response_initiated(self) -> None:
        """Test creating a SipTransferResponse with status 'initiated'."""
        response = SipTransferResponse(
            status="initiated",
            room_name="project1_call-room-123",
            participant_identity="sip_participant_456",
            transfer_to="tel:+15551234567",
        )
        assert response.status == "initiated"
        assert response.room_name == "project1_call-room-123"
        assert response.participant_identity == "sip_participant_456"
        assert response.transfer_to == "tel:+15551234567"

    def test_sip_transfer_response_completed(self) -> None:
        """Test creating a SipTransferResponse with status 'completed'."""
        response = SipTransferResponse(
            status="completed",
            room_name="project1_call-room-123",
            participant_identity="sip_participant_456",
            transfer_to="tel:+15551234567",
        )
        assert response.status == "completed"
        assert response.room_name == "project1_call-room-123"
        assert response.participant_identity == "sip_participant_456"
        assert response.transfer_to == "tel:+15551234567"

    def test_sip_transfer_request_from_dict(self) -> None:
        """Test parsing SipTransferRequest from dict."""
        data = {
            "room_name": "call-room-123",
            "participant_identity": "sip_participant_456",
            "transfer_to": "+15551234567",
        }
        request = SipTransferRequest(**data)
        assert request.room_name == "call-room-123"
        assert request.participant_identity == "sip_participant_456"
        assert request.transfer_to == "+15551234567"

    def test_sip_transfer_response_from_dict(self) -> None:
        """Test parsing SipTransferResponse from dict (as returned by API)."""
        data = {
            "status": "completed",
            "room_name": "project1_call-room-123",
            "participant_identity": "sip_participant_456",
            "transfer_to": "tel:+15551234567",
        }
        response = SipTransferResponse(**data)
        assert response.status == "completed"
        assert response.room_name == "project1_call-room-123"
        assert response.participant_identity == "sip_participant_456"
        assert response.transfer_to == "tel:+15551234567"

    def test_sip_transfer_request_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            SipTransferRequest(room_name="test-room")  # type: ignore[call-arg]

    def test_sip_transfer_response_missing_field(self) -> None:
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            SipTransferResponse(status="initiated")  # type: ignore[call-arg]

    def test_sip_transfer_response_invalid_status(self) -> None:
        """Test that invalid status values raise validation error."""
        with pytest.raises(ValidationError):
            SipTransferResponse(
                status="pending",  # type: ignore[arg-type]
                room_name="project1_call-room-123",
                participant_identity="sip_participant_456",
                transfer_to="tel:+15551234567",
            )


class TestSipHookTypes:
    """Tests for SipHook type including auth_id field."""

    def test_sip_hook_with_auth_id(self) -> None:
        """Test creating a SipHook with auth_id."""
        hook = SipHook(
            host="example.com",
            url="https://webhook.example.com/events",
            auth_id="tenant-123",
        )
        assert hook.host == "example.com"
        assert hook.url == "https://webhook.example.com/events"
        assert hook.auth_id == "tenant-123"

    def test_sip_hook_with_empty_auth_id(self) -> None:
        """Test SipHook accepts empty string for auth_id (when AUTH_REQUIRED=false)."""
        hook = SipHook(
            host="example.com",
            url="https://webhook.example.com/events",
            auth_id="",
        )
        assert hook.auth_id == ""

    def test_sip_hook_requires_auth_id(self) -> None:
        """Test that missing auth_id raises validation error."""
        with pytest.raises(ValidationError):
            SipHook(
                host="example.com",
                url="https://webhook.example.com/events",
            )  # type: ignore[call-arg]

    def test_sip_hook_from_dict(self) -> None:
        """Test parsing SipHook from dict (as returned by API)."""
        data = {
            "host": "example.com",
            "url": "https://webhook.example.com/events",
            "auth_id": "tenant-456",
        }
        hook = SipHook(**data)
        assert hook.host == "example.com"
        assert hook.url == "https://webhook.example.com/events"
        assert hook.auth_id == "tenant-456"

    def test_sip_hook_model_dump_includes_auth_id(self) -> None:
        """Test that model_dump() includes auth_id."""
        hook = SipHook(
            host="example.com",
            url="https://webhook.example.com/events",
            auth_id="tenant-789",
        )
        dump = hook.model_dump()
        assert dump == {
            "host": "example.com",
            "url": "https://webhook.example.com/events",
            "auth_id": "tenant-789",
        }
