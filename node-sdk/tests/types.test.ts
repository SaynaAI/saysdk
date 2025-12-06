import { describe, expect, test } from "bun:test";
import type {
  STTConfig,
  TTSConfig,
  LiveKitConfig,
  ConfigMessage,
  SpeakMessage,
  ClearMessage,
  SendMessageMessage,
  ReadyMessage,
  STTResultMessage,
  ErrorMessage,
  Pronunciation,
  SipTransferMessage,
  SipTransferErrorMessage,
} from "../src/types";

describe("Type Validation", () => {
  test("STTConfig should have correct structure", () => {
    const config: STTConfig = {
      provider: "deepgram",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "nova-2",
    };

    expect(config.provider).toBe("deepgram");
    expect(config.language).toBe("en-US");
    expect(config.sample_rate).toBe(16000);
  });

  test("TTSConfig should have correct structure", () => {
    const config: TTSConfig = {
      provider: "elevenlabs",
      voice_id: "voice-123",
      speaking_rate: 1.0,
      audio_format: "mp3",
      sample_rate: 24000,
      connection_timeout: 5000,
      request_timeout: 10000,
      model: "eleven_multilingual_v2",
      pronunciations: [],
    };

    expect(config.provider).toBe("elevenlabs");
    expect(config.voice_id).toBe("voice-123");
    expect(config.pronunciations).toEqual([]);
  });

  test("TTSConfig should allow minimal configuration", () => {
    const config: TTSConfig = {
      provider: "deepgram",
      model: "aura-asteria-en",
    };

    expect(config.provider).toBe("deepgram");
    expect(config.model).toBe("aura-asteria-en");
    expect(config.connection_timeout).toBeUndefined();
    expect(config.pronunciations).toBeUndefined();
  });

  test("TTSConfig with pronunciations", () => {
    const pronunciations: Pronunciation[] = [
      { word: "Sayna", pronunciation: "say-nah" },
    ];

    const config: TTSConfig = {
      provider: "elevenlabs",
      voice_id: "voice-123",
      speaking_rate: 1.0,
      audio_format: "mp3",
      sample_rate: 24000,
      connection_timeout: 5000,
      request_timeout: 10000,
      model: "eleven_multilingual_v2",
      pronunciations,
    };

    expect(config.pronunciations?.length).toBe(1);
    expect(config.pronunciations?.[0]?.word).toBe("Sayna");
  });

  test("LiveKitConfig should have correct structure", () => {
    const config: LiveKitConfig = {
      room_name: "test-room",
      enable_recording: true,
    };

    expect(config.room_name).toBe("test-room");
    expect(config.enable_recording).toBe(true);
  });

  test("LiveKitConfig with defaults", () => {
    const config: LiveKitConfig = {
      room_name: "test-room",
    };

    expect(config.room_name).toBe("test-room");
    expect(config.enable_recording).toBeUndefined();
  });
});

describe("Message Types", () => {
  test("ConfigMessage should have correct structure", () => {
    const stt: STTConfig = {
      provider: "deepgram",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "nova-2",
    };

    const tts: TTSConfig = {
      provider: "elevenlabs",
      voice_id: "voice-123",
      speaking_rate: 1.0,
      audio_format: "mp3",
      sample_rate: 24000,
      connection_timeout: 5000,
      request_timeout: 10000,
      model: "eleven_multilingual_v2",
      pronunciations: [],
    };

    const msg: ConfigMessage = {
      type: "config",
      audio: true,
      stt_config: stt,
      tts_config: tts,
    };

    expect(msg.type).toBe("config");
    expect(msg.audio).toBe(true);
    expect(msg.stt_config?.provider).toBe("deepgram");
  });

  test("SpeakMessage should have correct structure", () => {
    const msg: SpeakMessage = {
      type: "speak",
      text: "Hello world",
      flush: true,
      allow_interruption: false,
    };

    expect(msg.type).toBe("speak");
    expect(msg.text).toBe("Hello world");
    expect(msg.flush).toBe(true);
  });

  test("ClearMessage should have correct structure", () => {
    const msg: ClearMessage = {
      type: "clear",
    };

    expect(msg.type).toBe("clear");
  });

  test("SendMessageMessage should have correct structure", () => {
    const msg: SendMessageMessage = {
      type: "send_message",
      message: "Test message",
      role: "assistant",
      topic: "chat",
      debug: { key: "value" },
    };

    expect(msg.type).toBe("send_message");
    expect(msg.message).toBe("Test message");
    expect(msg.role).toBe("assistant");
  });

  test("ReadyMessage should have correct structure", () => {
    const msg: ReadyMessage = {
      type: "ready",
      livekit_room_name: "test-room",
      livekit_url: "wss://livekit.example.com",
      sayna_participant_identity: "sayna-ai",
      sayna_participant_name: "Sayna AI",
    };

    expect(msg.type).toBe("ready");
    expect(msg.livekit_room_name).toBe("test-room");
    expect(msg.livekit_url).toBe("wss://livekit.example.com");
  });

  test("ReadyMessage should allow missing LiveKit fields when not configured", () => {
    const msg: ReadyMessage = {
      type: "ready",
      stream_id: "stream-123",
    };

    expect(msg.type).toBe("ready");
    expect(msg.livekit_room_name).toBeUndefined();
    expect(msg.livekit_url).toBeUndefined();
    expect(msg.stream_id).toBe("stream-123");
  });

  test("STTResultMessage should have correct structure", () => {
    const msg: STTResultMessage = {
      type: "stt_result",
      transcript: "Hello world",
      is_final: true,
      is_speech_final: true,
      confidence: 0.95,
    };

    expect(msg.type).toBe("stt_result");
    expect(msg.transcript).toBe("Hello world");
    expect(msg.confidence).toBe(0.95);
  });

  test("ErrorMessage should have correct structure", () => {
    const msg: ErrorMessage = {
      type: "error",
      message: "Something went wrong",
    };

    expect(msg.type).toBe("error");
    expect(msg.message).toBe("Something went wrong");
  });

  test("SipTransferMessage should have correct structure", () => {
    const msg: SipTransferMessage = {
      type: "sip_transfer",
      transfer_to: "+1234567890",
    };

    expect(msg.type).toBe("sip_transfer");
    expect(msg.transfer_to).toBe("+1234567890");
  });

  test("SipTransferErrorMessage should have correct structure", () => {
    const msg: SipTransferErrorMessage = {
      type: "sip_transfer_error",
      message: "No SIP participant found",
    };

    expect(msg.type).toBe("sip_transfer_error");
    expect(msg.message).toBe("No SIP participant found");
  });
});
