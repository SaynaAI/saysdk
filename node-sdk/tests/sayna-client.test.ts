import { describe, expect, test } from "bun:test";
import { SaynaClient } from "../src/sayna-client";
import { SaynaValidationError, SaynaNotConnectedError } from "../src/errors";
import type { STTConfig, TTSConfig } from "../src/types";

function getTestSTTConfig(): STTConfig {
  return {
    provider: "deepgram",
    model: "nova-2",
    language: "en-US",
    sample_rate: 16000,
    channels: 1,
    encoding: "linear16",
    punctuation: true,
  };
}

function getTestTTSConfig(): TTSConfig {
  return {
    provider: "cartesia",
    voice_id: "test-voice",
    model: "sonic",
    audio_format: "pcm_s16le",
    sample_rate: 16000,
    speaking_rate: 1.0,
    connection_timeout: 5000,
    request_timeout: 10000,
    pronunciations: [],
  };
}

describe("SaynaClient Initialization", () => {
  test("should initialize with URL, configs, and API key", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "test-api-key"
    );

    expect(client.connected).toBe(false);
    expect(client.ready).toBe(false);
  });

  test("should initialize with custom WebSocket URL", () => {
    const client = new SaynaClient(
      "wss://custom.sayna.com/ws",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(client.connected).toBe(false);
  });

  test("should validate URL format", () => {
    expect(() => {
      new SaynaClient("invalid-url", getTestSTTConfig(), getTestTTSConfig());
    }).toThrow(SaynaValidationError);

    expect(() => {
      new SaynaClient("invalid-url", getTestSTTConfig(), getTestTTSConfig());
    }).toThrow("URL must start with");
  });

  test("should require audio configs when withoutAudio is false", () => {
    expect(() => {
      new SaynaClient(
        "https://api.example.com",
        undefined,
        undefined,
        undefined,
        false
      );
    }).toThrow(SaynaValidationError);

    expect(() => {
      new SaynaClient(
        "https://api.example.com",
        undefined,
        undefined,
        undefined,
        false
      );
    }).toThrow("sttConfig and ttsConfig are required");
  });

  test("should allow missing audio configs when withoutAudio is true", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      undefined,
      undefined,
      undefined,
      true
    );

    expect(client.connected).toBe(false);
    expect(client.ready).toBe(false);
  });

  test("should use SAYNA_API_KEY from environment", () => {
    process.env.SAYNA_API_KEY = "env-api-key";
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );
    expect(client).toBeDefined();
    delete process.env.SAYNA_API_KEY;
  });
});

describe("SaynaClient Properties", () => {
  test("should have correct initial state", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(client.connected).toBe(false);
    expect(client.ready).toBe(false);
    expect(client.livekitRoomName).toBeUndefined();
    expect(client.livekitUrl).toBeUndefined();
    expect(client.saynaParticipantIdentity).toBeUndefined();
    expect(client.saynaParticipantName).toBeUndefined();
  });
});

describe("SaynaClient Validation", () => {
  test("should throw error when sending audio without connection", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const audioData = new ArrayBuffer(1024);

    expect(() => client.onAudioInput(audioData)).toThrow(
      SaynaNotConnectedError
    );
  });

  test("should throw error when speaking without connection", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.speak("Hello")).toThrow(SaynaNotConnectedError);
  });

  test("should throw error when clearing without connection", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.clear()).toThrow(SaynaNotConnectedError);
  });

  test("should throw error when sending message without connection", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.sendMessage("Test", "assistant")).toThrow(
      SaynaNotConnectedError
    );
  });

  test("should validate audio data is ArrayBuffer", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    // Even though not connected, should validate input type first
    expect(() => client.onAudioInput("not an ArrayBuffer" as any)).toThrow();
  });

  test("should validate audio data is not empty", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const emptyBuffer = new ArrayBuffer(0);

    expect(() => client.onAudioInput(emptyBuffer)).toThrow();
  });

  test("should validate speak text is string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.speak(123 as any)).toThrow();
  });

  test("should validate sendMessage parameters", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.sendMessage(123 as any, "role")).toThrow();
    expect(() => client.sendMessage("msg", 123 as any)).toThrow();
  });

  test("should allow disconnect when not connected", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "test-key"
    );

    // Should not throw an error
    client.disconnect();
  });
});

describe("SaynaClient Event Handlers", () => {
  test("should register STT result handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (result: any) => {
      console.log(result);
    };

    client.registerOnSttResult(handler);
    expect(client).toBeDefined();
  });

  test("should register TTS audio handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (audio: ArrayBuffer) => {
      console.log(audio);
    };

    client.registerOnTtsAudio(handler);
    expect(client).toBeDefined();
  });

  test("should register error handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (error: any) => {
      console.log(error);
    };

    client.registerOnError(handler);
    expect(client).toBeDefined();
  });

  test("should register message handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (message: any) => {
      console.log(message);
    };

    client.registerOnMessage(handler);
    expect(client).toBeDefined();
  });

  test("should register participant disconnected handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (participant: any) => {
      console.log(participant);
    };

    client.registerOnParticipantDisconnected(handler);
    expect(client).toBeDefined();
  });

  test("should register TTS playback complete handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (timestamp: number) => {
      console.log(timestamp);
    };

    client.registerOnTtsPlaybackComplete(handler);
    expect(client).toBeDefined();
  });
});

describe("SaynaClient REST API Methods", () => {
  test("should validate speakRest parameters", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.speakRest("", getTestTTSConfig())).toThrow(
      SaynaValidationError
    );

    expect(async () => client.speakRest("   ", getTestTTSConfig())).toThrow(
      "Text cannot be empty"
    );
  });

  test("should validate getLiveKitToken parameters", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.getLiveKitToken("", "name", "identity")).toThrow(
      "room_name cannot be empty"
    );

    expect(async () => client.getLiveKitToken("room", "", "identity")).toThrow(
      "participant_name cannot be empty"
    );

    expect(async () => client.getLiveKitToken("room", "name", "")).toThrow(
      "participant_identity cannot be empty"
    );
  });
});

describe("SaynaClient SIP Hooks Methods", () => {
  test("should validate setSipHooks hooks is an array", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.setSipHooks("not-an-array" as any)).toThrow(
      SaynaValidationError
    );
    expect(async () => client.setSipHooks("not-an-array" as any)).toThrow(
      "hooks must be an array"
    );
  });

  test("should validate setSipHooks hooks array is not empty", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.setSipHooks([])).toThrow(SaynaValidationError);
    expect(async () => client.setSipHooks([])).toThrow(
      "hooks array cannot be empty"
    );
  });

  test("should validate setSipHooks hook host is non-empty string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () =>
      client.setSipHooks([{ host: "", url: "https://example.com" }])
    ).toThrow("hooks[0].host must be a non-empty string");

    expect(async () =>
      client.setSipHooks([{ host: "   ", url: "https://example.com" }])
    ).toThrow("hooks[0].host must be a non-empty string");

    expect(async () =>
      client.setSipHooks([{ host: 123 as any, url: "https://example.com" }])
    ).toThrow("hooks[0].host must be a non-empty string");
  });

  test("should validate setSipHooks hook url is non-empty string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () =>
      client.setSipHooks([{ host: "example.com", url: "" }])
    ).toThrow("hooks[0].url must be a non-empty string");

    expect(async () =>
      client.setSipHooks([{ host: "example.com", url: "   " }])
    ).toThrow("hooks[0].url must be a non-empty string");

    expect(async () =>
      client.setSipHooks([{ host: "example.com", url: 123 as any }])
    ).toThrow("hooks[0].url must be a non-empty string");
  });

  test("should validate deleteSipHooks hosts is an array", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.deleteSipHooks("not-an-array" as any)).toThrow(
      SaynaValidationError
    );
    expect(async () => client.deleteSipHooks("not-an-array" as any)).toThrow(
      "hosts must be an array"
    );
  });

  test("should validate deleteSipHooks hosts array is not empty", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.deleteSipHooks([])).toThrow(SaynaValidationError);
    expect(async () => client.deleteSipHooks([])).toThrow(
      "hosts array cannot be empty"
    );
  });

  test("should validate deleteSipHooks each host is non-empty string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () => client.deleteSipHooks([""])).toThrow(
      "hosts[0] must be a non-empty string"
    );

    expect(async () => client.deleteSipHooks(["   "])).toThrow(
      "hosts[0] must be a non-empty string"
    );

    expect(async () => client.deleteSipHooks([123 as any])).toThrow(
      "hosts[0] must be a non-empty string"
    );

    expect(async () => client.deleteSipHooks(["valid.com", ""])).toThrow(
      "hosts[1] must be a non-empty string"
    );
  });
});

// Note: Full integration tests with mock WebSocket server would be added here
// These tests cover:
// - WebSocket connection with valid config
// - WebSocket message sending (speak, clear, tts_flush, send_message, on_audio_input)
// - Message receiving (ready, stt_result, error, etc.)
// - Event callbacks (register_on_tts_audio, register_on_stt_result, etc.)
// - Error handling and reconnection
// - Proper cleanup on disconnect
// - REST API methods (health, get_voices, speak_rest, get_livekit_token, sip_hooks)
