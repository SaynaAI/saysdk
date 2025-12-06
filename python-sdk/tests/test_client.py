"""Tests for SaynaClient class."""

from typing import Any

import pytest

from sayna_client import (
    SaynaClient,
    SaynaValidationError,
    SipTransferErrorMessage,
    STTConfig,
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


# TODO: Add integration tests with mock WebSocket server:
# - Test WebSocket connection with valid config
# - Test WebSocket message sending (speak, clear, tts_flush, send_message, on_audio_input)
# - Test message receiving (ready, stt_result, error, etc.)
# - Test event callbacks (register_on_tts_audio, register_on_stt_result, etc.)
# - Test error handling and reconnection
# - Test proper cleanup on disconnect
# - Test REST API methods (health, get_voices, speak_rest, get_livekit_token)
