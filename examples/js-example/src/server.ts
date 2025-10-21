import { randomUUID } from "crypto";
import {
  SaynaClient,
  type LiveKitConfig,
  type STTConfig,
  type STTResultMessage,
  type TTSConfig,
} from "@sayna-ai/node-sdk";

const sttConfig: STTConfig = {
  provider: "deepgram",
  language: "en-US",
  sample_rate: 16000,
  channels: 1,
  punctuation: true,
  encoding: "linear16",
  model: "nova-3",
};

const ttsConfig: TTSConfig = {
  provider: "elevenlabs",
  voice_id: "21m00Tcm4TlvDq8ikWAM",
  speaking_rate: 1,
  audio_format: "linear16",
  sample_rate: 16000,
  connection_timeout: 30,
  request_timeout: 60,
  model: "eleven_turbo_v2_5",
  pronunciations: [],
};

const sessions = new Map<string, SaynaClient>();

function sessionKey(saynaUrl: string, roomName: string): string {
  return `${saynaUrl}::${roomName}`;
}

async function createSaynaSession(
  saynaUrl: string,
  roomName: string,
  participantIdentity: string
): Promise<SaynaClient> {
  const livekitConfig: LiveKitConfig = {
    room_name: roomName,
    sayna_participant_identity: participantIdentity,
    sayna_participant_name: "Sayna AI Assistant",
  };

  const key = sessionKey(saynaUrl, roomName);
  console.log("[Sayna] Creating session for:", saynaUrl, "room:", roomName);

  const client = new SaynaClient(saynaUrl, sttConfig, ttsConfig, livekitConfig);
  await client.connect();

  // Verify connection is ready
  if (!client.ready) {
    await client.disconnect();
    throw new Error("Sayna connection failed to become ready");
  }

  console.log("[Sayna] Connected to room:", client.livekitRoomName);
  console.log("[Sayna] Sayna participant:", client.saynaParticipantIdentity);

  client.registerOnSttResult(async (result: STTResultMessage) => {
    if (!result.is_speech_final) {
      return;
    }

    const text = result.transcript.trim();
    if (!text) {
      return;
    }

    try {
      await client.speak(text);
    } catch (error) {
      console.error("[Sayna] Failed to echo transcript:", error);
    }
  });

  client.registerOnParticipantDisconnected(async participant => {
    console.log("[Sayna] Participant disconnected:", participant.identity);
    sessions.delete(key);
    try {
      await client.disconnect();
    } catch (error) {
      console.error("[Sayna] Failed to disconnect after participant left:", error);
    }
  });

  client.registerOnTtsPlaybackComplete(async timestamp => {
    console.log("[Sayna] TTS playback complete at:", new Date(timestamp).toISOString());
  });

  client.registerOnError(error => {
    console.error("[Sayna] Error:", error.message);
  });

  sessions.set(key, client);
  return client;
}

async function ensureSaynaSession(
  saynaUrl: string,
  roomName: string,
  participantIdentity: string
): Promise<SaynaClient> {
  const key = sessionKey(saynaUrl, roomName);
  const existing = sessions.get(key);
  if (existing && existing.connected) {
    return existing;
  }

  // Clean up stale session if it exists but is disconnected
  if (existing) {
    sessions.delete(key);
  }

  return createSaynaSession(saynaUrl, roomName, participantIdentity);
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleSaynaTokenRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const saynaUrl = url.searchParams.get("saynaUrl");
    if (!saynaUrl) {
      return badRequest("Missing query parameter: saynaUrl");
    }

    let parsed: URL;
    try {
      parsed = new URL(saynaUrl);
    } catch {
      return badRequest("saynaUrl must be a valid absolute URL");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return badRequest("saynaUrl must use http or https");
    }

    const roomName = url.searchParams.get("room") ?? `sayna-room-${randomUUID()}`;
    const participantName = url.searchParams.get("participantName") ?? "Web User";
    const participantIdentity = url.searchParams.get("participantIdentity") ?? `user-${randomUUID()}`;

    // Create a temporary client just to get the LiveKit token
    const tempClient = new SaynaClient(parsed.toString(), sttConfig, ttsConfig);

    try {
      // Use the REST API to get LiveKit token for the user
      const tokenResponse = await tempClient.getLiveKitToken(
        roomName,
        participantName,
        participantIdentity
      );

      // Now establish the Sayna session with the agent's identity
      const agentIdentity = `sayna-agent-${randomUUID()}`;
      await ensureSaynaSession(parsed.toString(), roomName, agentIdentity);

      return new Response(
        JSON.stringify({
          token: tokenResponse.token,
          liveUrl: tokenResponse.livekit_url,
          roomName: tokenResponse.room_name,
          participantIdentity: tokenResponse.participant_identity,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("[Sayna] Failed to get LiveKit token:", error);
      throw error;
    }
  } catch (error) {
    console.error("[Sayna] Failed to handle token request:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
