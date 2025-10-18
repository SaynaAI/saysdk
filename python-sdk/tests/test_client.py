"""Tests for SaynaClient class."""

import pytest

from sayna_client import (
    SaynaClient,
    SaynaValidationError,
    STTConfig,
    TTSConfig,
)


class TestSaynaClientInit:
    """Tests for SaynaClient initialization."""

    def test_client_initialization(self) -> None:
        """Test that client can be initialized with URL and API key."""
        client = SaynaClient(
            url="wss://api.example.com",
            api_key="test-api-key",
        )
        assert client.url == "wss://api.example.com"
        assert client.api_key == "test-api-key"
        assert not client.connected
        assert not client.ready

    def test_client_with_custom_url(self) -> None:
        """Test client with custom WebSocket URL."""
        client = SaynaClient(
            url="wss://custom.sayna.com/ws",
            api_key="key-123",
        )
        assert client.url == "wss://custom.sayna.com/ws"

    def test_client_base_url_extraction_wss(self) -> None:
        """Test that base URL is correctly extracted from WebSocket URL."""
        client = SaynaClient(url="wss://api.example.com/ws")
        assert client.base_url == "https://api.example.com"

    def test_client_base_url_extraction_ws(self) -> None:
        """Test that base URL is correctly extracted from insecure WebSocket URL."""
        client = SaynaClient(url="ws://localhost:3000/ws")
        assert client.base_url == "http://localhost:3000"


class TestSaynaClientValidation:
    """Tests for SaynaClient validation."""

    @pytest.mark.asyncio
    async def test_connect_requires_stt_tts_when_audio_enabled(self) -> None:
        """Test that connect raises ValidationError when audio=True but configs missing."""
        client = SaynaClient(
            url="wss://api.example.com",
            api_key="test-key",
        )

        # Should raise validation error when audio=True but configs are missing
        with pytest.raises(SaynaValidationError) as exc_info:
            await client.connect()

        assert "stt_config and tts_config are required" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_disconnect_when_not_connected(self) -> None:
        """Test that disconnect handles not being connected gracefully."""
        client = SaynaClient(
            url="wss://api.example.com",
            api_key="test-key",
        )

        # Should not raise an error, just log a warning
        await client.disconnect()


class TestSaynaClientProperties:
    """Tests for SaynaClient properties."""

    def test_initial_state(self) -> None:
        """Test initial state of client properties."""
        client = SaynaClient(url="wss://api.example.com")

        assert not client.connected
        assert not client.ready
        assert client.livekit_room_name is None
        assert client.livekit_url is None
        assert client.sayna_participant_identity is None
        assert client.sayna_participant_name is None


# TODO: Add integration tests with mock WebSocket server:
# - Test WebSocket connection with valid config
# - Test message sending (speak, clear, send_message)
# - Test message receiving (ready, stt_result, error, etc.)
# - Test event callbacks
# - Test error handling and reconnection
# - Test proper cleanup on disconnect
# - Test REST API methods (health_check, get_voices, speak, get_livekit_token)
