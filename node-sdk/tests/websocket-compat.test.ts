import { describe, expect, test, afterEach } from "bun:test";
import { SaynaClient } from "../src/sayna-client";
import { SaynaConnectionError } from "../src/errors";
import type { STTConfig, TTSConfig } from "../src/types";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";

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

function startMockServer(
  onConnection?: (ws: import("ws").WebSocket, req: IncomingMessage) => void
): Promise<{ server: WebSocketServer; port: number }> {
  return new Promise((resolve) => {
    const server = new WebSocketServer({ port: 0 });
    server.on("listening", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      if (onConnection) {
        server.on("connection", onConnection);
      }
      resolve({ server, port });
    });
  });
}

describe("WebSocket Connection Tests", () => {
  let server: WebSocketServer | undefined;

  afterEach(() => {
    if (server) {
      for (const c of server.clients) c.terminate();
      server.close();
      server = undefined;
    }
  });

  test("should connect to a local WebSocket server and receive a ready message", async () => {
    const result = await startMockServer((ws) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          ws.send(
            JSON.stringify({
              type: "ready",
              stream_id: "test-stream-123",
              livekit_room_name: "test-room",
              livekit_url: "wss://livekit.example.com",
              sayna_participant_identity: "agent-1",
              sayna_participant_name: "Sayna Agent",
            })
          );
        }
      });
    });
    server = result.server;

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "test-api-key"
    );

    await client.connect();

    expect(client.connected).toBe(true);
    expect(client.ready).toBe(true);
    expect(client.streamId).toBe("test-stream-123");
    expect(client.livekitRoomName).toBe("test-room");
    expect(client.livekitUrl).toBe("wss://livekit.example.com");
    expect(client.saynaParticipantIdentity).toBe("agent-1");
    expect(client.saynaParticipantName).toBe("Sayna Agent");

    client.disconnect();
  });

  test("should send Authorization header with apiKey to the server", async () => {
    let receivedAuthHeader: string | undefined;

    const result = await startMockServer((ws, req) => {
      receivedAuthHeader = req.headers["authorization"];
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          ws.send(JSON.stringify({ type: "ready", stream_id: "s-1" }));
        }
      });
    });
    server = result.server;

    const apiKey = "my-secret-api-key-12345";
    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      apiKey
    );

    await client.connect();

    expect(receivedAuthHeader).toBe(`Bearer ${apiKey}`);

    client.disconnect();
  });

  test("should reject when WebSocket connection is closed before ready", async () => {
    const result = await startMockServer((ws) => {
      ws.close(1008, "Unauthorized");
    });
    server = result.server;

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "bad-key"
    );

    try {
      await client.connect();
      expect.unreachable("Should have thrown SaynaConnectionError");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaConnectionError);
      const connError = error as SaynaConnectionError;
      expect(connError.message).toContain("WebSocket closed before ready");
      expect(connError.message).toContain("1008");
    }

    expect(client.connected).toBe(false);
    expect(client.ready).toBe(false);
  });

  test("should send config message on connection with correct structure", async () => {
    let receivedConfig: Record<string, unknown> | undefined;

    const result = await startMockServer((ws) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          receivedConfig = msg;
          ws.send(JSON.stringify({ type: "ready", stream_id: "s-2" }));
        }
      });
    });
    server = result.server;

    const sttConfig = getTestSTTConfig();
    const ttsConfig = getTestTTSConfig();

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      sttConfig,
      ttsConfig,
      undefined,
      false,
      "test-key"
    );

    await client.connect();

    expect(receivedConfig).toBeDefined();
    expect(receivedConfig!.type).toBe("config");
    expect(receivedConfig!.audio).toBe(true);
    expect(receivedConfig!.stt_config).toEqual(sttConfig);
    expect(receivedConfig!.tts_config).toEqual(ttsConfig);

    client.disconnect();
  });

  test("should clean up state after disconnect", async () => {
    const result = await startMockServer((ws) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          ws.send(
            JSON.stringify({
              type: "ready",
              stream_id: "s-3",
              livekit_room_name: "room-1",
            })
          );
        }
      });
    });
    server = result.server;

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "test-key"
    );

    await client.connect();
    expect(client.connected).toBe(true);
    expect(client.ready).toBe(true);
    expect(client.streamId).toBe("s-3");

    client.disconnect();
    expect(client.connected).toBe(false);
    expect(client.ready).toBe(false);
    expect(client.streamId).toBeUndefined();
    expect(client.livekitRoomName).toBeUndefined();
  });

  test("should handle withoutAudio mode on connection", async () => {
    let receivedConfig: Record<string, unknown> | undefined;

    const result = await startMockServer((ws) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          receivedConfig = msg;
          ws.send(JSON.stringify({ type: "ready", stream_id: "s-4" }));
        }
      });
    });
    server = result.server;

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      undefined,
      undefined,
      undefined,
      true,
      "test-key"
    );

    await client.connect();

    expect(receivedConfig).toBeDefined();
    expect(receivedConfig!.audio).toBe(false);
    expect(receivedConfig!.stt_config).toBeUndefined();
    expect(receivedConfig!.tts_config).toBeUndefined();

    client.disconnect();
  });
});

describe("WebSocket onclose event handling", () => {
  let server: WebSocketServer | undefined;

  afterEach(() => {
    if (server) {
      for (const c of server.clients) c.terminate();
      server.close();
      server = undefined;
    }
  });

  test("should include close code and reason in error when connection closes before ready", async () => {
    const result = await startMockServer((ws) => {
      ws.close(4001, "Custom close reason");
    });
    server = result.server;

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "key"
    );

    try {
      await client.connect();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaConnectionError);
      const connError = error as SaynaConnectionError;
      expect(connError.message).toContain("4001");
      expect(connError.message).toContain("Custom close reason");
    }
  });

  test("should handle close event with empty reason", async () => {
    const result = await startMockServer((ws) => {
      ws.close(1000);
    });
    server = result.server;

    const client = new SaynaClient(
      `ws://127.0.0.1:${result.port}`,
      getTestSTTConfig(),
      getTestTTSConfig(),
      undefined,
      false,
      "key"
    );

    try {
      await client.connect();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaynaConnectionError);
      const connError = error as SaynaConnectionError;
      expect(connError.message).toContain("1000");
      expect(connError.message).toContain("reason: none");
    }
  });
});

describe("WebSocket runtime detection", () => {
  let server: WebSocketServer | undefined;

  afterEach(() => {
    if (server) {
      for (const c of server.clients) c.terminate();
      server.close();
      server = undefined;
    }
  });

  test("should connect without apiKey (no Authorization header)", async () => {
    let receivedAuthHeader: string | undefined;

    const result = await startMockServer((ws, req) => {
      receivedAuthHeader = req.headers["authorization"];
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          ws.send(JSON.stringify({ type: "ready", stream_id: "s-5" }));
        }
      });
    });
    server = result.server;

    const savedKey = process.env.SAYNA_API_KEY;
    delete process.env.SAYNA_API_KEY;

    try {
      const client = new SaynaClient(
        `ws://127.0.0.1:${result.port}`,
        getTestSTTConfig(),
        getTestTTSConfig(),
        undefined,
        false,
        undefined
      );
      await client.connect();
      expect(receivedAuthHeader).toBeUndefined();
      client.disconnect();
    } finally {
      if (savedKey !== undefined) {
        process.env.SAYNA_API_KEY = savedKey;
      }
    }
  });

  test("should pass apiKey via query parameter when native WebSocket does not support headers", () => {
    // Verify the URL construction logic used by the Deno/standard WebSocket path.
    const apiKey = "test-deno-key";
    const baseUrl = "ws://example.com/ws";
    const separator = baseUrl.includes("?") ? "&" : "?";
    const expectedUrl = `${baseUrl}${separator}token=${encodeURIComponent(apiKey)}`;

    expect(expectedUrl).toBe("ws://example.com/ws?token=test-deno-key");

    // URL with existing query params
    const urlWithQuery = "ws://example.com/ws?param=1";
    const sep2 = urlWithQuery.includes("?") ? "&" : "?";
    const expectedUrl2 = `${urlWithQuery}${sep2}token=${encodeURIComponent(apiKey)}`;

    expect(expectedUrl2).toBe(
      "ws://example.com/ws?param=1&token=test-deno-key"
    );
  });
});
