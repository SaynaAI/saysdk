import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { SaynaClient } from "../src/sayna-client";
import {
  SaynaValidationError,
  SaynaNotConnectedError,
  SaynaNotReadyError,
  SaynaConnectionError,
  SaynaServerError,
} from "../src/errors";
import type {
  STTConfig,
  TTSConfig,
  LiveKitConfig,
  LoadingAudioConfig,
} from "../src/types";

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

  test("should allow minimal TTS config without optional fields", () => {
    const minimalTtsConfig: TTSConfig = {
      provider: "deepgram",
      model: "aura-asteria-en",
    };

    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      minimalTtsConfig
    );

    expect(client).toBeDefined();
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

  test("should register participant connected handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (participant: any) => {
      console.log(participant);
    };

    client.registerOnParticipantConnected(handler);
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

  test("should register track subscribed handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (track: any) => {
      console.log(track);
    };

    client.registerOnTrackSubscribed(handler);
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

  test("should register SIP transfer error handler", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const handler = (error: any) => {
      console.log(error);
    };

    client.registerOnSipTransferError(handler);
    expect(client).toBeDefined();
  });
});

/* eslint-disable @typescript-eslint/await-thenable */
// Note: ESLint incorrectly flags await expect().rejects.toThrow() as awaiting non-thenable,
// but this is the correct pattern for testing async function rejections in Bun/Jest.
describe("SaynaClient REST API Methods", () => {
  test("should validate speakRest parameters", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(client.speakRest("", getTestTTSConfig())).rejects.toThrow(
      SaynaValidationError
    );

    await expect(client.speakRest("   ", getTestTTSConfig())).rejects.toThrow(
      "Text cannot be empty"
    );
  });

  test("should validate getLiveKitToken parameters", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.getLiveKitToken("", "name", "identity")
    ).rejects.toThrow("room_name cannot be empty");

    await expect(
      client.getLiveKitToken("room", "", "identity")
    ).rejects.toThrow("participant_name cannot be empty");

    await expect(client.getLiveKitToken("room", "name", "")).rejects.toThrow(
      "participant_identity cannot be empty"
    );
  });

  test("should validate getLiveKitRoom roomName is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(client.getLiveKitRoom("")).rejects.toThrow(
      SaynaValidationError
    );
    await expect(client.getLiveKitRoom("")).rejects.toThrow(
      "room_name cannot be empty"
    );

    await expect(client.getLiveKitRoom("   ")).rejects.toThrow(
      SaynaValidationError
    );
    await expect(client.getLiveKitRoom("   ")).rejects.toThrow(
      "room_name cannot be empty"
    );
  });

  test("should validate removeLiveKitParticipant roomName is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.removeLiveKitParticipant("", "user-alice-456")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.removeLiveKitParticipant("", "user-alice-456")
    ).rejects.toThrow("room_name cannot be empty");

    await expect(
      client.removeLiveKitParticipant("   ", "user-alice-456")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.removeLiveKitParticipant("   ", "user-alice-456")
    ).rejects.toThrow("room_name cannot be empty");
  });

  test("should validate removeLiveKitParticipant participantIdentity is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.removeLiveKitParticipant("my-room", "")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.removeLiveKitParticipant("my-room", "")
    ).rejects.toThrow("participant_identity cannot be empty");

    await expect(
      client.removeLiveKitParticipant("my-room", "   ")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.removeLiveKitParticipant("my-room", "   ")
    ).rejects.toThrow("participant_identity cannot be empty");
  });

  test("should validate muteLiveKitParticipantTrack roomName is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.muteLiveKitParticipantTrack(
        "",
        "user-alice-456",
        "TR_abc123",
        true
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "",
        "user-alice-456",
        "TR_abc123",
        true
      )
    ).rejects.toThrow("room_name cannot be empty");

    await expect(
      client.muteLiveKitParticipantTrack(
        "   ",
        "user-alice-456",
        "TR_abc123",
        true
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "   ",
        "user-alice-456",
        "TR_abc123",
        true
      )
    ).rejects.toThrow("room_name cannot be empty");
  });

  test("should validate muteLiveKitParticipantTrack participantIdentity is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.muteLiveKitParticipantTrack("my-room", "", "TR_abc123", true)
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack("my-room", "", "TR_abc123", true)
    ).rejects.toThrow("participant_identity cannot be empty");

    await expect(
      client.muteLiveKitParticipantTrack("my-room", "   ", "TR_abc123", true)
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack("my-room", "   ", "TR_abc123", true)
    ).rejects.toThrow("participant_identity cannot be empty");
  });

  test("should validate muteLiveKitParticipantTrack trackSid is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.muteLiveKitParticipantTrack("my-room", "user-alice-456", "", true)
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack("my-room", "user-alice-456", "", true)
    ).rejects.toThrow("track_sid cannot be empty");

    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "   ",
        true
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "   ",
        true
      )
    ).rejects.toThrow("track_sid cannot be empty");
  });

  test("should validate muteLiveKitParticipantTrack muted is a boolean", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        "true" as any
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        "true" as any
      )
    ).rejects.toThrow("muted must be a boolean");

    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        1 as any
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        1 as any
      )
    ).rejects.toThrow("muted must be a boolean");

    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        null as any
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        null as any
      )
    ).rejects.toThrow("muted must be a boolean");

    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        undefined as any
      )
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.muteLiveKitParticipantTrack(
        "my-room",
        "user-alice-456",
        "TR_abc123",
        undefined as any
      )
    ).rejects.toThrow("muted must be a boolean");
  });

  test("should validate sipTransferRest roomName is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.sipTransferRest("", "sip_participant_456", "+15551234567")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.sipTransferRest("", "sip_participant_456", "+15551234567")
    ).rejects.toThrow("room_name cannot be empty");

    await expect(
      client.sipTransferRest("   ", "sip_participant_456", "+15551234567")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.sipTransferRest("   ", "sip_participant_456", "+15551234567")
    ).rejects.toThrow("room_name cannot be empty");
  });

  test("should validate sipTransferRest participantIdentity is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.sipTransferRest("call-room-123", "", "+15551234567")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.sipTransferRest("call-room-123", "", "+15551234567")
    ).rejects.toThrow("participant_identity cannot be empty");

    await expect(
      client.sipTransferRest("call-room-123", "   ", "+15551234567")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.sipTransferRest("call-room-123", "   ", "+15551234567")
    ).rejects.toThrow("participant_identity cannot be empty");
  });

  test("should validate sipTransferRest transferTo is non-empty", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await expect(
      client.sipTransferRest("call-room-123", "sip_participant_456", "")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.sipTransferRest("call-room-123", "sip_participant_456", "")
    ).rejects.toThrow("transfer_to cannot be empty");

    await expect(
      client.sipTransferRest("call-room-123", "sip_participant_456", "   ")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      client.sipTransferRest("call-room-123", "sip_participant_456", "   ")
    ).rejects.toThrow("transfer_to cannot be empty");
  });
});
/* eslint-enable @typescript-eslint/await-thenable */

describe("SaynaClient Loading Indicator constructor validation", () => {
  test("should reject empty data string with a SaynaValidationError mentioning loadingAudio.data", () => {
    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          { data: "" }
        )
    ).toThrow(SaynaValidationError);

    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          { data: "" }
        )
    ).toThrow("loadingAudio.data");
  });

  test("should reject unknown format value with a SaynaValidationError mentioning format and the allowed values", () => {
    const bogus = { data: "abc", format: "mp3" } as unknown as LoadingAudioConfig;

    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          bogus
        )
    ).toThrow(SaynaValidationError);

    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          bogus
        )
    ).toThrow("loadingAudio.format");

    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          bogus
        )
    ).toThrow('"wav" or "pcm"');
  });

  test("should accept a minimal valid loadingAudio with only data", () => {
    expect(() => {
      new SaynaClient(
        "https://api.example.com",
        getTestSTTConfig(),
        getTestTTSConfig(),
        undefined,
        false,
        undefined,
        undefined,
        { data: "abc" }
      );
    }).not.toThrow();
  });

  test("should reject an empty object loadingAudio with a SaynaValidationError mentioning loadingAudio.data", () => {
    const bogus = {} as unknown as LoadingAudioConfig;

    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          bogus
        )
    ).toThrow(SaynaValidationError);

    expect(
      () =>
        new SaynaClient(
          "https://api.example.com",
          getTestSTTConfig(),
          getTestTTSConfig(),
          undefined,
          false,
          undefined,
          undefined,
          bogus
        )
    ).toThrow("loadingAudio.data");
  });

  test("should reject non-object loadingAudio inputs with a SaynaValidationError", () => {
    const nonObjects: unknown[] = ["AAA=", 42, true, null, ["data"]];

    for (const bogus of nonObjects) {
      expect(
        () =>
          new SaynaClient(
            "https://api.example.com",
            getTestSTTConfig(),
            getTestTTSConfig(),
            undefined,
            false,
            undefined,
            undefined,
            bogus as LoadingAudioConfig
          )
      ).toThrow(SaynaValidationError);
    }
  });
});

describe("SaynaClient Loading Indicator config frame emission", () => {
  /**
   * Drives `SaynaClient.connect()` against an in-memory fake WebSocket and returns the
   * payloads the SDK actually sends. The fake intercepts `createWebSocket`, captures the
   * `onopen` and `onmessage` hooks the SDK installs, fires `onopen` so `connect()` emits
   * the `config` frame, then fires a `ready` message so the Promise resolves cleanly.
   */
  async function captureConfigFrames(
    loadingAudio?: LoadingAudioConfig
  ): Promise<{ sent: string[] }> {
    const sent: string[] = [];
    const livekitConfig: LiveKitConfig = { room_name: "test-room" };

    interface FakeWs {
      binaryType: string;
      readyState: number;
      send: (payload: string) => void;
      close: () => void;
      onopen: ((event?: unknown) => void) | null;
      onmessage: ((event: { data: string }) => void) | null;
      onerror: ((event?: unknown) => void) | null;
      onclose: ((event: { code: number; reason: string }) => void) | null;
    }

    const fakeWs: FakeWs = {
      binaryType: "arraybuffer",
      readyState: 1,
      send: (payload: string) => sent.push(payload),
      close: () => {},
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };

    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig(),
      livekitConfig,
      false,
      undefined,
      undefined,
      loadingAudio
    );

    // Replace the runtime WebSocket constructor with a factory that returns the fake.
    // Stub installation must happen before connect() reaches `createWebSocket`, which it
    // does after two `await resolveConfigAuth(...)` microtask hops.
    (client as any).createWebSocket = () => fakeWs;

    const connected = client.connect();

    // Wait for `connect()` to clear its two `await resolveConfigAuth(...)` points before
    // the SDK assigns the `onopen`/`onmessage` handlers on the fake WebSocket. We drain
    // up to a handful of microtasks; in practice both awaits resolve in the first.
    for (let i = 0; i < 8 && !(fakeWs.onopen && fakeWs.onmessage); i += 1) {
      await Promise.resolve();
    }

    // Fire the open handler so connect() emits the config frame, then deliver a ready
    // message so the Promise resolves and the test completes deterministically.
    if (fakeWs.onopen) {
      fakeWs.onopen();
    }
    if (fakeWs.onmessage) {
      fakeWs.onmessage({
        data: JSON.stringify({ type: "ready", stream_id: "test-stream" }),
      });
    }

    await connected;
    client.disconnect();

    return { sent };
  }

  test("config frame includes loading_audio when supplied at construction", async () => {
    const audio: LoadingAudioConfig = {
      data: "AAA=",
      format: "wav",
      sample_rate: 16000,
      channels: 1,
      volume: 0.75,
    };

    const { sent } = await captureConfigFrames(audio);

    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0] ?? "{}");
    expect(payload.type).toBe("config");
    expect(payload.loading_audio).toEqual(audio);
  });

  test("config frame omits loading_audio when not supplied", async () => {
    const { sent } = await captureConfigFrames();

    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0] ?? "{}");
    expect(payload.type).toBe("config");
    expect(Object.prototype.hasOwnProperty.call(payload, "loading_audio")).toBe(
      false
    );
  });
});

describe("SaynaClient loadingStart", () => {
  test("should throw SaynaNotConnectedError when called before connect", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.loadingStart()).toThrow(SaynaNotConnectedError);
  });

  test("should throw SaynaNotReadyError when called after connect but before ready", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    (client as any).websocket = { send: () => {} } as unknown as WebSocket;
    (client as any).isConnected = true;

    expect(() => client.loadingStart()).toThrow(SaynaNotReadyError);
  });

  test("should emit a single loading_start frame when ready", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const sent: string[] = [];
    (client as any).websocket = {
      send: (payload: string) => sent.push(payload),
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    client.loadingStart();

    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0] ?? "{}");
    expect(payload).toEqual({ type: "loading_start" });
  });

  test("should wrap synchronous send failures in SaynaConnectionError with cause", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const underlying = new Error("socket gone");
    (client as any).websocket = {
      send: () => {
        throw underlying;
      },
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    let captured: unknown;
    try {
      client.loadingStart();
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(SaynaConnectionError);
    const connectionError = captured as SaynaConnectionError;
    expect(connectionError.message).toContain(
      "Failed to send loading_start command"
    );
    expect(connectionError.cause).toBe(underlying);
  });
});

describe("SaynaClient loadingStop", () => {
  test("should throw SaynaNotConnectedError when called before connect", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(() => client.loadingStop()).toThrow(SaynaNotConnectedError);
  });

  test("should throw SaynaNotReadyError when called after connect but before ready", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    (client as any).websocket = { send: () => {} } as unknown as WebSocket;
    (client as any).isConnected = true;

    expect(() => client.loadingStop()).toThrow(SaynaNotReadyError);
  });

  test("should emit a single loading_stop frame when ready", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const sent: string[] = [];
    (client as any).websocket = {
      send: (payload: string) => sent.push(payload),
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    client.loadingStop();

    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0] ?? "{}");
    expect(payload).toEqual({ type: "loading_stop" });
  });

  test("should wrap synchronous send failures in SaynaConnectionError with cause", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const underlying = new Error("socket gone");
    (client as any).websocket = {
      send: () => {
        throw underlying;
      },
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    let captured: unknown;
    try {
      client.loadingStop();
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(SaynaConnectionError);
    const connectionError = captured as SaynaConnectionError;
    expect(connectionError.message).toContain(
      "Failed to send loading_stop command"
    );
    expect(connectionError.cause).toBe(underlying);
  });
});

describe("SaynaClient Loading Indicator server error propagation", () => {
  test("should deliver server loading_audio error message to the registerOnError callback", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    let receivedMessage: string | undefined;
    client.registerOnError((error) => {
      receivedMessage = error.message;
    });

    await (client as any).handleJsonMessage({
      type: "error",
      message: "loading_audio.data is not valid base64",
    });

    expect(receivedMessage).toBe("loading_audio.data is not valid base64");
  });
});

describe("SaynaClient speak and clear do not send loading_stop", () => {
  test("speak emits exactly one speak frame (no implicit loading_stop) even when loadingAudio is configured", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig(),
      { room_name: "test-room" },
      false,
      undefined,
      undefined,
      { data: "AAA=" }
    );

    const sent: string[] = [];
    (client as any).websocket = {
      send: (payload: string) => sent.push(payload),
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    client.speak("hello");

    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0] ?? "{}");
    expect(payload.type).toBe("speak");
  });

  test("clear emits exactly one clear frame (no implicit loading_stop) even when loadingAudio is configured", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig(),
      { room_name: "test-room" },
      false,
      undefined,
      undefined,
      { data: "AAA=" }
    );

    const sent: string[] = [];
    (client as any).websocket = {
      send: (payload: string) => sent.push(payload),
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    client.clear();

    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0] ?? "{}");
    expect(payload.type).toBe("clear");
  });
});

describe("SaynaClient SIP Transfer", () => {
  test("should send sip_transfer payload", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const sentPayloads: string[] = [];
    (client as any).websocket = {
      send: (payload: string) => sentPayloads.push(payload),
    } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    client.sipTransfer(" 1001 ");

    expect(sentPayloads.length).toBe(1);
    const payload = JSON.parse(sentPayloads[0] ?? "{}");
    expect(payload.type).toBe("sip_transfer");
    expect(payload.transfer_to).toBe("1001");
  });

  test("should validate transferTo is non-empty string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );
    (client as any).websocket = { send: () => {} } as unknown as WebSocket;
    (client as any).isConnected = true;
    (client as any).isReady = true;

    expect(() => client.sipTransfer("   ")).toThrow(SaynaValidationError);
  });
});

describe("SaynaClient message handling", () => {
  test("should handle participant_connected with dedicated callback", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    let receivedIdentity: string | undefined;
    client.registerOnParticipantConnected((participant) => {
      receivedIdentity = participant.identity;
    });

    await (client as any).handleJsonMessage({
      type: "participant_connected",
      participant: {
        identity: "user-123",
        name: "Jane Doe",
        room: "conversation-room-123",
        timestamp: 1700000000000,
      },
    });

    expect(receivedIdentity).toBe("user-123");
  });

  test("should handle track_subscribed with dedicated callback", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    let receivedTrackId: string | undefined;
    client.registerOnTrackSubscribed((track) => {
      receivedTrackId = track.track_sid;
    });

    await (client as any).handleJsonMessage({
      type: "track_subscribed",
      track: {
        identity: "user-456",
        name: "Jane Smith",
        track_kind: "audio",
        track_sid: "TR_abc123",
        room: "conversation-room-123",
        timestamp: 1700000000000,
      },
    });

    expect(receivedTrackId).toBe("TR_abc123");
  });

  test("should handle sip_transfer_error with dedicated callback", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    let receivedMessage: string | undefined;
    client.registerOnSipTransferError((error) => {
      receivedMessage = error.message;
    });

    await (client as any).handleJsonMessage({
      type: "sip_transfer_error",
      message: "No SIP participant found",
    });

    expect(receivedMessage).toBe("No SIP participant found");
  });

  test("should mark ready even without LiveKit fields", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    await (client as any).handleJsonMessage({
      type: "ready",
      stream_id: "stream-123",
    });

    expect(client.ready).toBe(true);
    expect(client.livekitUrl).toBeUndefined();
    expect(client.livekitRoomName).toBeUndefined();
    expect(client.streamId).toBe("stream-123");
  });

  test("should ignore unknown message types and log a warning", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    await (client as any).handleJsonMessage({ type: "unknown" } as any);

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      'Ignoring unknown websocket message type "unknown"'
    );
    warnSpy.mockRestore();
  });

  test("should ignore malformed ready messages without marking ready", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    await (client as any).handleJsonMessage({
      type: "ready",
      livekit_url: 123,
    });

    expect(client.ready).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("should ignore malformed participant_connected messages", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    let receivedIdentity: string | undefined;
    client.registerOnParticipantConnected((participant) => {
      receivedIdentity = participant.identity;
    });

    await (client as any).handleJsonMessage({
      type: "participant_connected",
      participant: {
        identity: 123,
        room: "conversation-room-123",
        timestamp: 1700000000000,
      },
    });

    expect(receivedIdentity).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("should ignore malformed track_subscribed messages", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    let receivedTrackId: string | undefined;
    client.registerOnTrackSubscribed((track) => {
      receivedTrackId = track.track_sid;
    });

    await (client as any).handleJsonMessage({
      type: "track_subscribed",
      track: {
        identity: "user-456",
        track_kind: "unknown",
        track_sid: "TR_abc123",
        room: "conversation-room-123",
        timestamp: 1700000000000,
      },
    });

    expect(receivedTrackId).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("SaynaClient websocket URL normalization", () => {
  test("should append /ws for https urls without a websocket path", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect((client as any).getWebSocketUrl()).toBe("wss://api.example.com/ws");
  });

  test("should append /ws for https urls ending with slash", () => {
    const client = new SaynaClient(
      "https://api.example.com/",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect((client as any).getWebSocketUrl()).toBe("wss://api.example.com/ws");
  });

  test("should preserve explicit secure websocket urls", () => {
    const client = new SaynaClient(
      "wss://api.example.com/ws",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect((client as any).getWebSocketUrl()).toBe("wss://api.example.com/ws");
  });

  test("should preserve explicit insecure websocket urls", () => {
    const client = new SaynaClient(
      "ws://localhost:3000/ws",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect((client as any).getWebSocketUrl()).toBe("ws://localhost:3000/ws");
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
      client.setSipHooks([
        { host: "", url: "https://example.com", auth_id: "tenant-1" },
      ])
    ).toThrow("hooks[0].host must be a non-empty string");

    expect(async () =>
      client.setSipHooks([
        { host: "   ", url: "https://example.com", auth_id: "tenant-1" },
      ])
    ).toThrow("hooks[0].host must be a non-empty string");

    expect(async () =>
      client.setSipHooks([
        { host: 123 as any, url: "https://example.com", auth_id: "tenant-1" },
      ])
    ).toThrow("hooks[0].host must be a non-empty string");
  });

  test("should validate setSipHooks hook url is non-empty string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    expect(async () =>
      client.setSipHooks([
        { host: "example.com", url: "", auth_id: "tenant-1" },
      ])
    ).toThrow("hooks[0].url must be a non-empty string");

    expect(async () =>
      client.setSipHooks([
        { host: "example.com", url: "   ", auth_id: "tenant-1" },
      ])
    ).toThrow("hooks[0].url must be a non-empty string");

    expect(async () =>
      client.setSipHooks([
        { host: "example.com", url: 123 as any, auth_id: "tenant-1" },
      ])
    ).toThrow("hooks[0].url must be a non-empty string");
  });

  test("should validate setSipHooks hook auth_id is a string", () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    // Missing auth_id (undefined)
    expect(async () =>
      client.setSipHooks([
        { host: "example.com", url: "https://example.com" } as any,
      ])
    ).toThrow("hooks[0].auth_id must be a string");

    // null auth_id
    expect(async () =>
      client.setSipHooks([
        {
          host: "example.com",
          url: "https://example.com",
          auth_id: null as any,
        },
      ])
    ).toThrow("hooks[0].auth_id must be a string");

    // Number auth_id
    expect(async () =>
      client.setSipHooks([
        {
          host: "example.com",
          url: "https://example.com",
          auth_id: 123 as any,
        },
      ])
    ).toThrow("hooks[0].auth_id must be a string");
  });

  test("should allow empty string auth_id for unauthenticated mode", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    // This should pass validation (but will fail on network call)
    // We're just testing that empty string is allowed
    try {
      await client.setSipHooks([
        {
          host: "example.com",
          url: "https://example.com/webhook",
          auth_id: "",
        },
      ]);
    } catch (error) {
      // Should fail on network, not validation
      expect(error).not.toBeInstanceOf(SaynaValidationError);
    }
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

describe("SaynaClient REST Error Mapping", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * Helper to create a mock fetch response.
   */
  function createMockFetch(options: {
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
  }): typeof globalThis.fetch {
    return (async () =>
      Promise.resolve(options)) as unknown as typeof globalThis.fetch;
  }

  test("should throw SaynaServerError with 403 status on getLiveKitToken when room is owned by another tenant", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    // Mock fetch to return 403 Forbidden
    globalThis.fetch = createMockFetch({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () =>
        Promise.resolve({ error: "Room owned by another tenant" }),
    });

    try {
      await client.getLiveKitToken("my-room", "John Doe", "user-123");
      expect.unreachable("Should have thrown SaynaServerError");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaServerError);
      const serverError = error as SaynaServerError;
      expect(serverError.message).toMatch(/^Access denied:/);
      expect(serverError.message).toContain("Room owned by another tenant");
      expect(serverError.status).toBe(403);
      expect(serverError.endpoint).toBe("livekit/token");
    }
  });

  test("should throw SaynaServerError with 403 for generic 403 error response", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    // Mock fetch to return 403 without JSON body
    globalThis.fetch = (async () =>
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => Promise.reject(new Error("No JSON body")),
      })) as unknown as typeof globalThis.fetch;

    try {
      await client.getLiveKitToken("test-room", "Jane", "jane-1");
      expect.unreachable("Should have thrown SaynaServerError");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaServerError);
      const serverError = error as SaynaServerError;
      expect(serverError.message).toMatch(/^Access denied:/);
      expect(serverError.status).toBe(403);
      expect(serverError.endpoint).toBe("livekit/token");
    }
  });

  /**
   * Table-driven tests for 404 errors on room-scoped endpoints.
   * These endpoints return 404 when access is denied (masked as "not found").
   */
  const notFoundEndpointTests: Array<{
    name: string;
    callMethod: (client: SaynaClient) => Promise<unknown>;
    expectedEndpoint: string;
  }> = [
    {
      name: "getLiveKitRoom",
      callMethod: async (client) => client.getLiveKitRoom("test-room"),
      expectedEndpoint: `livekit/rooms/${encodeURIComponent("test-room")}`,
    },
    {
      name: "sipTransferRest",
      callMethod: async (client) =>
        client.sipTransferRest(
          "call-room-123",
          "sip_participant_456",
          "+15551234567"
        ),
      expectedEndpoint: "sip/transfer",
    },
    {
      name: "removeLiveKitParticipant",
      callMethod: async (client) =>
        client.removeLiveKitParticipant("my-room", "user-alice-456"),
      expectedEndpoint: "livekit/participant",
    },
    {
      name: "muteLiveKitParticipantTrack",
      callMethod: async (client) =>
        client.muteLiveKitParticipantTrack(
          "my-room",
          "user-alice-456",
          "TR_abc123",
          true
        ),
      expectedEndpoint: "livekit/participant/mute",
    },
  ];

  for (const { name, callMethod, expectedEndpoint } of notFoundEndpointTests) {
    test(`should throw SaynaServerError with 404 status on ${name} when room not found or not accessible`, async () => {
      const client = new SaynaClient(
        "https://api.example.com",
        getTestSTTConfig(),
        getTestTTSConfig()
      );

      // Mock fetch to return 404 Not Found
      globalThis.fetch = createMockFetch({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => Promise.resolve({ error: "Room not found" }),
      });

      try {
        await callMethod(client);
        expect.unreachable("Should have thrown SaynaServerError");
      } catch (error) {
        expect(error).toBeInstanceOf(SaynaServerError);
        const serverError = error as SaynaServerError;
        expect(serverError.message).toMatch(/^Not found or not accessible:/);
        expect(serverError.message).toContain("Room not found");
        expect(serverError.status).toBe(404);
        expect(serverError.endpoint).toBe(expectedEndpoint);
      }
    });
  }

  test("should handle 404 with room name containing special characters (URL encoding)", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    const specialRoomName = "room/with spaces&special=chars";
    const encodedRoomName = encodeURIComponent(specialRoomName);

    // Mock fetch to return 404
    globalThis.fetch = createMockFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => Promise.resolve({ error: "Room not found" }),
    });

    try {
      await client.getLiveKitRoom(specialRoomName);
      expect.unreachable("Should have thrown SaynaServerError");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaServerError);
      const serverError = error as SaynaServerError;
      expect(serverError.status).toBe(404);
      expect(serverError.endpoint).toBe(`livekit/rooms/${encodedRoomName}`);
    }
  });

  test("should preserve status 500 without modifying message prefix", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    // Mock fetch to return 500 Internal Server Error
    globalThis.fetch = createMockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => Promise.resolve({ error: "LiveKit not configured" }),
    });

    try {
      await client.getLiveKitRooms();
      expect.unreachable("Should have thrown SaynaServerError");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaServerError);
      const serverError = error as SaynaServerError;
      // 500 errors should not have "Access denied:" or "Not found or not accessible:" prefix
      expect(serverError.message).not.toMatch(/^Access denied:/);
      expect(serverError.message).not.toMatch(/^Not found or not accessible:/);
      expect(serverError.message).toBe("LiveKit not configured");
      expect(serverError.status).toBe(500);
      expect(serverError.endpoint).toBe("livekit/rooms");
    }
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
