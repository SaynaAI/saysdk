import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { SaynaClient } from "../src/sayna-client";
import {
  SaynaValidationError,
  SaynaNotConnectedError,
  SaynaServerError,
} from "../src/errors";
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

  test("should surface unknown message types via error callback", async () => {
    const client = new SaynaClient(
      "https://api.example.com",
      getTestSTTConfig(),
      getTestTTSConfig()
    );

    let errorMessage: string | undefined;
    client.registerOnError((error) => {
      errorMessage = error.message;
    });

    await (client as any).handleJsonMessage({ type: "unknown" } as any);

    expect(errorMessage).toContain("Unknown message type");
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
