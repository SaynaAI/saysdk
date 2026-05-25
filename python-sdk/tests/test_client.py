"""Tests for SaynaClient class."""

import logging
from typing import Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest
from pydantic import ValidationError

from sayna_client import (
    ErrorMessage,
    LiveKitConfig,
    LoadingAudioConfig,
    ParticipantConnectedMessage,
    SaynaClient,
    SaynaConnectionError,
    SaynaNotConnectedError,
    SaynaNotReadyError,
    SaynaValidationError,
    SipTransferErrorMessage,
    STTConfig,
    TrackSubscribedMessage,
    TTSConfig,
)


def _get_test_stt_config() -> STTConfig:
    """Helper to create a test STT config."""
    return STTConfig(
        provider="deepgram",
        model="nova-2",
        language="en-US",
        sample_rate=16000,
        channels=1,
        encoding="linear16",
        punctuation=True,
    )


def _get_test_tts_config() -> TTSConfig:
    """Helper to create a test TTS config."""
    return TTSConfig(
        provider="cartesia",
        voice_id="test-voice",
        model="sonic",
        audio_format="pcm_s16le",
        sample_rate=16000,
        speaking_rate=1.0,
        connection_timeout=5000,
        request_timeout=10000,
        pronunciations=[],
    )


class TestSaynaClientInit:
    """Tests for SaynaClient initialization."""

    def test_client_initialization(self) -> None:
        """Test that client can be initialized with URL, configs, and API key."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
            api_key="test-api-key",
        )
        assert client.url == "https://api.example.com"
        assert client.api_key == "test-api-key"
        assert client.stt_config.provider == "deepgram"
        assert client.tts_config.provider == "cartesia"
        assert not client.connected
        assert not client.ready

    def test_client_with_custom_url(self) -> None:
        """Test client with custom WebSocket URL."""
        client = SaynaClient(
            url="wss://custom.sayna.com/ws",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
            api_key="key-123",
        )
        assert client.url == "wss://custom.sayna.com/ws"

    def test_client_base_url_extraction_wss(self) -> None:
        """Test that base URL is correctly extracted from WebSocket URL."""
        client = SaynaClient(
            url="wss://api.example.com/ws",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        assert client.base_url == "https://api.example.com"

    def test_client_base_url_extraction_ws(self) -> None:
        """Test that base URL is correctly extracted from insecure WebSocket URL."""
        client = SaynaClient(
            url="ws://localhost:3000/ws",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        assert client.base_url == "http://localhost:3000"

    def test_client_validates_url(self) -> None:
        """Test that client validates URL format."""
        with pytest.raises(SaynaValidationError, match="URL must start with"):
            SaynaClient(
                url="invalid-url",
                stt_config=_get_test_stt_config(),
                tts_config=_get_test_tts_config(),
            )


class TestSaynaClientValidation:
    """Tests for SaynaClient validation."""

    @pytest.mark.asyncio
    async def test_disconnect_when_not_connected(self) -> None:
        """Test that disconnect handles not being connected gracefully."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
            api_key="test-key",
        )

        # Should not raise an error, just log a warning
        await client.disconnect()


class TestSaynaClientProperties:
    """Tests for SaynaClient properties."""

    def test_initial_state(self) -> None:
        """Test initial state of client properties."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        assert not client.connected
        assert not client.ready
        assert client.livekit_room_name is None
        assert client.livekit_url is None
        assert client.sayna_participant_identity is None
        assert client.sayna_participant_name is None

    def test_control_only_session_allows_missing_audio_configs(self) -> None:
        """Control-only sessions (audio=False) should not require STT/TTS configs."""
        client = SaynaClient(url="https://api.example.com", without_audio=True)
        assert not client.audio_enabled
        assert client.stt_config is None
        assert client.tts_config is None

    def test_audio_enabled_requires_configs(self) -> None:
        """Audio-enabled sessions must include STT and TTS configs."""
        with pytest.raises(SaynaValidationError, match="stt_config and tts_config are required"):
            SaynaClient(url="https://api.example.com")


class TestSipTransfer:
    """Tests for SIP transfer support."""

    @pytest.mark.asyncio
    async def test_sip_transfer_sends_payload(self) -> None:
        """sip_transfer should emit the correct message payload."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        client._ready = True

        sent: dict[str, Any] = {}

        async def fake_send_json(data: dict[str, Any]) -> None:
            sent.update(data)

        client._send_json = fake_send_json  # type: ignore[assignment]

        await client.sip_transfer("+1234567890")

        assert sent == {"type": "sip_transfer", "transfer_to": "+1234567890"}

    @pytest.mark.asyncio
    async def test_sip_transfer_validates_transfer_to(self) -> None:
        """Empty transfer targets are rejected."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        client._ready = True

        with pytest.raises(SaynaValidationError, match="transfer_to must be a non-empty string"):
            await client.sip_transfer(" ")

    @pytest.mark.asyncio
    async def test_sip_transfer_error_callback(self) -> None:
        """sip_transfer_error messages should trigger the specific callback."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        received: list[SipTransferErrorMessage] = []

        async def on_transfer_error(message: SipTransferErrorMessage) -> None:
            received.append(message)

        client.register_on_sip_transfer_error(on_transfer_error)

        await client._handle_text_message(
            '{"type": "sip_transfer_error", "message": "No SIP participant found"}'
        )

        assert len(received) == 1
        assert received[0].message == "No SIP participant found"

    @pytest.mark.asyncio
    async def test_participant_connected_callback(self) -> None:
        """participant_connected messages should trigger the specific callback."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        received: list[ParticipantConnectedMessage] = []

        async def on_connected(message: ParticipantConnectedMessage) -> None:
            received.append(message)

        client.register_on_participant_connected(on_connected)

        await client._handle_text_message(
            '{"type": "participant_connected", "participant": {"identity": "user-123", '
            '"name": "Jane Doe", "room": "conversation-room-123", '
            '"timestamp": 1700000000000}}'
        )

        assert len(received) == 1
        assert received[0].participant.identity == "user-123"

    @pytest.mark.asyncio
    async def test_track_subscribed_callback(self) -> None:
        """track_subscribed messages should trigger the specific callback."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        received: list[TrackSubscribedMessage] = []

        async def on_track_subscribed(message: TrackSubscribedMessage) -> None:
            received.append(message)

        client.register_on_track_subscribed(on_track_subscribed)

        await client._handle_text_message(
            '{"type": "track_subscribed", "track": {"identity": "user-456", '
            '"name": "Jane Smith", "track_kind": "audio", "track_sid": "TR_abc123", '
            '"room": "conversation-room-123", "timestamp": 1700000000000}}'
        )

        assert len(received) == 1
        assert received[0].track.track_sid == "TR_abc123"

    @pytest.mark.asyncio
    async def test_unknown_message_type_is_logged_and_ignored(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Unknown websocket messages should be logged and ignored."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with caplog.at_level(logging.WARNING):
            await client._handle_text_message('{"type": "unknown"}')

        assert "Unknown message type: unknown" in caplog.text

    @pytest.mark.asyncio
    async def test_malformed_known_message_is_logged_and_ignored(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Malformed known websocket messages should be logged and ignored."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        received: list[ParticipantConnectedMessage] = []
        client.register_on_participant_connected(received.append)

        with caplog.at_level(logging.WARNING):
            await client._handle_text_message(
                '{"type": "participant_connected", "participant": {"identity": 123, '
                '"room": "conversation-room-123", "timestamp": 1700000000000}}'
            )

        assert not received
        assert "Ignoring malformed websocket message type participant_connected" in caplog.text


class TestSendMessage:
    """Tests for send_message websocket behavior."""

    @pytest.mark.asyncio
    async def test_send_message_omits_default_topic(self) -> None:
        """send_message should omit topic when the caller does not provide one."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        client._ready = True

        sent: dict[str, Any] = {}

        async def fake_send_json(data: dict[str, Any]) -> None:
            sent.update(data)

        client._send_json = fake_send_json  # type: ignore[assignment]

        await client.send_message("Hello from AI", "assistant")

        assert sent == {
            "type": "send_message",
            "message": "Hello from AI",
            "role": "assistant",
        }


class TestGetLiveKitRoom:
    """Tests for get_livekit_room method validation."""

    @pytest.mark.asyncio
    async def test_get_livekit_room_validates_empty_room_name(self) -> None:
        """Empty room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.get_livekit_room("")

    @pytest.mark.asyncio
    async def test_get_livekit_room_validates_whitespace_room_name(self) -> None:
        """Whitespace-only room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.get_livekit_room("   ")


class TestRemoveLiveKitParticipant:
    """Tests for remove_livekit_participant method validation."""

    @pytest.mark.asyncio
    async def test_remove_livekit_participant_validates_empty_room_name(self) -> None:
        """Empty room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.remove_livekit_participant("", "user-alice-456")

    @pytest.mark.asyncio
    async def test_remove_livekit_participant_validates_whitespace_room_name(self) -> None:
        """Whitespace-only room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.remove_livekit_participant("   ", "user-alice-456")

    @pytest.mark.asyncio
    async def test_remove_livekit_participant_validates_empty_participant_identity(self) -> None:
        """Empty participant_identity should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(
            SaynaValidationError, match="participant_identity must be a non-empty string"
        ):
            await client.remove_livekit_participant("conversation-room-123", "")

    @pytest.mark.asyncio
    async def test_remove_livekit_participant_validates_whitespace_participant_identity(
        self,
    ) -> None:
        """Whitespace-only participant_identity should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(
            SaynaValidationError, match="participant_identity must be a non-empty string"
        ):
            await client.remove_livekit_participant("conversation-room-123", "   ")


class TestMuteLiveKitParticipantTrack:
    """Tests for mute_livekit_participant_track method validation."""

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_empty_room_name(self) -> None:
        """Empty room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.mute_livekit_participant_track(
                "", "user-alice-456", "TR_abc123", muted=True
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_whitespace_room_name(self) -> None:
        """Whitespace-only room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.mute_livekit_participant_track(
                "   ", "user-alice-456", "TR_abc123", muted=True
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_empty_participant_identity(
        self,
    ) -> None:
        """Empty participant_identity should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(
            SaynaValidationError, match="participant_identity must be a non-empty string"
        ):
            await client.mute_livekit_participant_track(
                "conversation-room-123", "", "TR_abc123", muted=True
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_whitespace_participant_identity(
        self,
    ) -> None:
        """Whitespace-only participant_identity should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(
            SaynaValidationError, match="participant_identity must be a non-empty string"
        ):
            await client.mute_livekit_participant_track(
                "conversation-room-123", "   ", "TR_abc123", muted=True
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_empty_track_sid(self) -> None:
        """Empty track_sid should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="track_sid must be a non-empty string"):
            await client.mute_livekit_participant_track(
                "conversation-room-123", "user-alice-456", "", muted=True
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_whitespace_track_sid(self) -> None:
        """Whitespace-only track_sid should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="track_sid must be a non-empty string"):
            await client.mute_livekit_participant_track(
                "conversation-room-123", "user-alice-456", "   ", muted=True
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_muted_not_boolean_string(
        self,
    ) -> None:
        """Non-boolean muted value (string) should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="muted must be a boolean"):
            await client.mute_livekit_participant_track(
                "conversation-room-123",
                "user-alice-456",
                "TR_abc123",
                muted="true",  # type: ignore[arg-type]
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_muted_not_boolean_int(self) -> None:
        """Non-boolean muted value (int) should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="muted must be a boolean"):
            await client.mute_livekit_participant_track(
                "conversation-room-123",
                "user-alice-456",
                "TR_abc123",
                muted=1,  # type: ignore[arg-type]
            )

    @pytest.mark.asyncio
    async def test_mute_livekit_participant_track_validates_muted_not_boolean_none(self) -> None:
        """Non-boolean muted value (None) should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="muted must be a boolean"):
            await client.mute_livekit_participant_track(
                "conversation-room-123",
                "user-alice-456",
                "TR_abc123",
                muted=None,  # type: ignore[arg-type]
            )


class TestSipTransferRest:
    """Tests for sip_transfer_rest method validation."""

    @pytest.mark.asyncio
    async def test_sip_transfer_rest_validates_empty_room_name(self) -> None:
        """Empty room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.sip_transfer_rest("", "sip_participant_456", "+15551234567")

    @pytest.mark.asyncio
    async def test_sip_transfer_rest_validates_whitespace_room_name(self) -> None:
        """Whitespace-only room_name should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="room_name must be a non-empty string"):
            await client.sip_transfer_rest("   ", "sip_participant_456", "+15551234567")

    @pytest.mark.asyncio
    async def test_sip_transfer_rest_validates_empty_participant_identity(self) -> None:
        """Empty participant_identity should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(
            SaynaValidationError, match="participant_identity must be a non-empty string"
        ):
            await client.sip_transfer_rest("call-room-123", "", "+15551234567")

    @pytest.mark.asyncio
    async def test_sip_transfer_rest_validates_whitespace_participant_identity(self) -> None:
        """Whitespace-only participant_identity should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(
            SaynaValidationError, match="participant_identity must be a non-empty string"
        ):
            await client.sip_transfer_rest("call-room-123", "   ", "+15551234567")

    @pytest.mark.asyncio
    async def test_sip_transfer_rest_validates_empty_transfer_to(self) -> None:
        """Empty transfer_to should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="transfer_to must be a non-empty string"):
            await client.sip_transfer_rest("call-room-123", "sip_participant_456", "")

    @pytest.mark.asyncio
    async def test_sip_transfer_rest_validates_whitespace_transfer_to(self) -> None:
        """Whitespace-only transfer_to should raise SaynaValidationError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )

        with pytest.raises(SaynaValidationError, match="transfer_to must be a non-empty string"):
            await client.sip_transfer_rest("call-room-123", "sip_participant_456", "   ")


class _EmptyAsyncIterator:
    """Async iterator that yields nothing, used to keep the WebSocket receive loop quiet in tests."""

    def __aiter__(self) -> "_EmptyAsyncIterator":
        return self

    async def __anext__(self) -> Any:
        raise StopAsyncIteration


async def _capture_connect_config_frame(
    *,
    loading_audio: Optional[LoadingAudioConfig],
) -> dict[str, Any]:
    """Drive ``SaynaClient.connect()`` against a mocked aiohttp stack and capture the config frame.

    Returns the first JSON payload sent to the WebSocket (the ``config`` message). The mocked
    WebSocket exposes an immediately-exhausted async iterator so the receive loop completes
    without performing any real I/O.
    """
    sent_frames: list[dict[str, Any]] = []

    async def capture(data: dict[str, Any]) -> None:
        sent_frames.append(data)

    mock_ws = MagicMock(spec=aiohttp.ClientWebSocketResponse)
    mock_ws.closed = False
    mock_ws.send_json = AsyncMock(side_effect=capture)
    mock_ws.close = AsyncMock()
    mock_ws.__aiter__ = lambda _self: _EmptyAsyncIterator()

    mock_session = MagicMock(spec=aiohttp.ClientSession)
    mock_session.closed = False
    mock_session.ws_connect = AsyncMock(return_value=mock_ws)
    mock_session.close = AsyncMock()

    with patch("sayna_client.client.aiohttp.ClientSession", return_value=mock_session):
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
            livekit_config=LiveKitConfig(room_name="test-room"),
            loading_audio=loading_audio,
        )
        await client.connect()
        try:
            assert sent_frames, "connect() did not send a config frame"
            return sent_frames[0]
        finally:
            await client.disconnect()


class TestLoadingAudioConstructor:
    """Tests for the constructor's ``loading_audio`` argument and config-payload wiring."""

    def test_valid_loading_audio_config_accepted(self) -> None:
        """A LoadingAudioConfig with non-empty data must construct without raising."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
            loading_audio=LoadingAudioConfig(data="abc"),
        )
        assert isinstance(client.loading_audio, LoadingAudioConfig)
        assert client.loading_audio.data == "abc"

    def test_empty_data_rejected_by_constructor(self) -> None:
        """An empty data string must fail in the constructor with a clear message."""
        with pytest.raises(SaynaValidationError, match=r"loading_audio\.data"):
            SaynaClient(
                url="https://api.example.com",
                stt_config=_get_test_stt_config(),
                tts_config=_get_test_tts_config(),
                loading_audio=LoadingAudioConfig(data=""),
            )

    def test_pydantic_rejects_non_literal_format_before_client(self) -> None:
        """Pydantic rejects an invalid format literal at model-build, before SaynaClient runs."""
        with pytest.raises(ValidationError):
            LoadingAudioConfig(data="abc", format="mp3")  # type: ignore[arg-type]

    def test_raw_dict_rejected_by_instance_guard(self) -> None:
        """A raw dict must trip the strict isinstance guard with the documented message."""
        with pytest.raises(
            SaynaValidationError,
            match="loading_audio must be a LoadingAudioConfig instance",
        ):
            SaynaClient(
                url="https://api.example.com",
                stt_config=_get_test_stt_config(),
                tts_config=_get_test_tts_config(),
                loading_audio={"data": "abc"},  # type: ignore[arg-type]
            )

    @pytest.mark.asyncio
    async def test_no_loading_audio_omitted_from_connect_frame(self) -> None:
        """connect() must not include loading_audio in its config frame when unset."""
        frame = await _capture_connect_config_frame(loading_audio=None)
        assert frame["type"] == "config"
        assert "loading_audio" not in frame

    @pytest.mark.asyncio
    async def test_loading_audio_included_in_connect_frame(self) -> None:
        """connect() must include the full loading_audio block when supplied."""
        loading = LoadingAudioConfig(
            data="QkFTRTY0",
            format="wav",
            sample_rate=24000,
            channels=2,
            volume=0.6,
        )
        frame = await _capture_connect_config_frame(loading_audio=loading)
        assert frame["type"] == "config"
        assert frame["loading_audio"] == {
            "data": "QkFTRTY0",
            "format": "wav",
            "sample_rate": 24000,
            "channels": 2,
            "volume": 0.6,
        }


def _ready_client_with_capture() -> tuple[SaynaClient, list[dict[str, Any]]]:
    """Build a connected+ready client whose _send_json appends payloads to a list."""
    client = SaynaClient(
        url="https://api.example.com",
        stt_config=_get_test_stt_config(),
        tts_config=_get_test_tts_config(),
    )
    client._connected = True
    client._ready = True

    sent: list[dict[str, Any]] = []

    async def fake_send_json(data: dict[str, Any]) -> None:
        sent.append(data)

    client._send_json = fake_send_json  # type: ignore[assignment]
    return client, sent


class TestLoadingStart:
    """Tests for the loading_start WebSocket command."""

    @pytest.mark.asyncio
    async def test_loading_start_requires_connection(self) -> None:
        """Calling loading_start before connect raises SaynaNotConnectedError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        with pytest.raises(SaynaNotConnectedError):
            await client.loading_start()

    @pytest.mark.asyncio
    async def test_loading_start_requires_ready(self) -> None:
        """Calling loading_start after connect but before ready raises SaynaNotReadyError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        with pytest.raises(SaynaNotReadyError):
            await client.loading_start()

    @pytest.mark.asyncio
    async def test_loading_start_sends_single_payload(self) -> None:
        """After ready, loading_start writes exactly one frame with the wire shape."""
        client, sent = _ready_client_with_capture()
        await client.loading_start()
        assert sent == [{"type": "loading_start"}]

    @pytest.mark.asyncio
    async def test_loading_start_wraps_send_failure(self) -> None:
        """A transport-level aiohttp.ClientError is wrapped as SaynaConnectionError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        client._ready = True

        underlying = aiohttp.ClientError("socket broke")

        async def failing_send_json(_data: dict[str, Any]) -> None:
            raise underlying

        client._send_json = failing_send_json  # type: ignore[assignment]

        with pytest.raises(SaynaConnectionError) as exc_info:
            await client.loading_start()

        assert "Failed to send loading_start message" in str(exc_info.value)
        assert exc_info.value.cause is underlying


class TestLoadingStop:
    """Tests for the loading_stop WebSocket command."""

    @pytest.mark.asyncio
    async def test_loading_stop_requires_connection(self) -> None:
        """Calling loading_stop before connect raises SaynaNotConnectedError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        with pytest.raises(SaynaNotConnectedError):
            await client.loading_stop()

    @pytest.mark.asyncio
    async def test_loading_stop_requires_ready(self) -> None:
        """Calling loading_stop after connect but before ready raises SaynaNotReadyError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        with pytest.raises(SaynaNotReadyError):
            await client.loading_stop()

    @pytest.mark.asyncio
    async def test_loading_stop_sends_single_payload(self) -> None:
        """After ready, loading_stop writes exactly one frame with the wire shape."""
        client, sent = _ready_client_with_capture()
        await client.loading_stop()
        assert sent == [{"type": "loading_stop"}]

    @pytest.mark.asyncio
    async def test_loading_stop_wraps_send_failure(self) -> None:
        """A transport-level aiohttp.ClientError is wrapped as SaynaConnectionError."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        client._connected = True
        client._ready = True

        underlying = aiohttp.ClientError("socket broke")

        async def failing_send_json(_data: dict[str, Any]) -> None:
            raise underlying

        client._send_json = failing_send_json  # type: ignore[assignment]

        with pytest.raises(SaynaConnectionError) as exc_info:
            await client.loading_stop()

        assert "Failed to send loading_stop message" in str(exc_info.value)
        assert exc_info.value.cause is underlying


class TestLoadingErrorPropagation:
    """Tests that loading-indicator errors reuse the existing error channel."""

    @pytest.mark.asyncio
    async def test_loading_decode_error_invokes_on_error(self) -> None:
        """A server error frame for a loading-decode failure reaches the on_error callback."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        received: list[ErrorMessage] = []

        def on_error(message: ErrorMessage) -> None:
            received.append(message)

        client.register_on_error(on_error)

        await client._handle_text_message(
            '{"type": "error", "message": "loading_audio.data is not valid base64"}'
        )

        assert len(received) == 1
        assert received[0].type == "error"
        assert received[0].message == "loading_audio.data is not valid base64"

    @pytest.mark.asyncio
    async def test_async_on_error_callback_is_awaited(self) -> None:
        """An ``async def`` on_error must be awaited (not just called) for loading error frames."""
        client = SaynaClient(
            url="https://api.example.com",
            stt_config=_get_test_stt_config(),
            tts_config=_get_test_tts_config(),
        )
        awaited_with: list[ErrorMessage] = []

        async def on_error(message: ErrorMessage) -> None:
            # If the callback is only *called*, the coroutine never reaches this line.
            awaited_with.append(message)

        client.register_on_error(on_error)

        await client._handle_text_message(
            '{"type": "error", "message": "loading_audio.data is not valid base64"}'
        )

        assert len(awaited_with) == 1
        assert awaited_with[0].message == "loading_audio.data is not valid base64"


class TestSpeakAndClearDoNotStopLoadingLoop:
    """speak() and clear() must remain single-frame; they never emit loading_stop."""

    @pytest.mark.asyncio
    async def test_speak_emits_only_speak_frame(self) -> None:
        """Calling speak after ready writes a single speak frame and nothing else."""
        client, sent = _ready_client_with_capture()
        await client.speak("hi")
        assert len(sent) == 1
        assert sent[0]["type"] == "speak"
        assert sent[0]["text"] == "hi"
        assert all(frame["type"] != "loading_stop" for frame in sent)

    @pytest.mark.asyncio
    async def test_clear_emits_only_clear_frame(self) -> None:
        """Calling clear after ready writes a single clear frame and nothing else."""
        client, sent = _ready_client_with_capture()
        await client.clear()
        assert sent == [{"type": "clear"}]


# TODO: Add integration tests with mock WebSocket server:
# - Test WebSocket message sending (tts_flush, send_message, on_audio_input)
# - Test message receiving (ready, stt_result, etc.)
# - Test event callbacks (register_on_tts_audio, register_on_stt_result, etc.)
# - Test reconnection
# - Test proper cleanup on disconnect
# - Test REST API methods (health, get_voices, speak_rest, get_livekit_token)
