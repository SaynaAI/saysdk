"""Tests for Pydantic type models."""

import pytest
from pydantic import ValidationError

from sayna_client.types import (
    ClearMessage,
    ConfigMessage,
    ErrorMessage,
    LiveKitConfig,
    Pronunciation,
    ReadyMessage,
    SendMessageMessage,
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
