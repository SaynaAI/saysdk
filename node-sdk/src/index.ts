import { SaynaClient } from "./sayna-client";
import type { STTConfig, TTSConfig, LiveKitConfig } from "./types";

export * from "./sayna-client";
export * from "./types";
export * from "./errors";
export * from "./webhook-receiver";

/**
 * Creates and connects a new SaynaClient instance.
 *
 * This is the recommended way to create a Sayna client. It handles both
 * instantiation and connection, returning a ready-to-use client.
 *
 * @param url - The Sayna server URL (e.g., "https://api.sayna.ai")
 * @param sttConfig - Speech-to-text configuration (required when withoutAudio=false)
 * @param ttsConfig - Text-to-speech configuration (required when withoutAudio=false)
 * @param livekitConfig - Optional LiveKit room configuration
 * @param withoutAudio - If true, disables audio streaming (default: false)
 * @param apiKey - Optional API key used to authorize HTTP and WebSocket calls (defaults to SAYNA_API_KEY env)
 *
 * @returns Promise that resolves to a connected SaynaClient
 *
 * @throws {SaynaValidationError} If parameters are invalid
 * @throws {SaynaConnectionError} If connection fails
 * @throws {SaynaServerError} If server returns an error during setup
 *
 * @example
 * ```typescript
 * import { saynaConnect } from "@sayna/node-sdk";
 *
 * const client = await saynaConnect(
 *   "https://api.sayna.ai",
 *   {
 *     provider: "deepgram",
 *     language: "en-US",
 *     sample_rate: 16000,
 *     channels: 1,
 *     punctuation: true,
 *     encoding: "linear16",
 *     model: "nova-2"
 *   },
 *   {
 *     provider: "elevenlabs",
 *     voice_id: "21m00Tcm4TlvDq8ikWAM",
 *     speaking_rate: 1.0,
 *     audio_format: "pcm",
 *     sample_rate: 16000,
 *     connection_timeout: 5000,
 *     request_timeout: 10000,
 *     model: "eleven_turbo_v2",
 *     pronunciations: []
 *   }
 * );
 *
 * // Register event handlers
 * client.registerOnSttResult((result) => {
 *   console.log("Transcription:", result.transcript);
 * });
 *
 * // Send text to be spoken
 * await client.speak("Hello, world!");
 *
 * // Clean up
 * await client.disconnect();
 * ```
 */
export async function saynaConnect(
  url: string,
  sttConfig?: STTConfig,
  ttsConfig?: TTSConfig,
  livekitConfig?: LiveKitConfig,
  withoutAudio: boolean = false,
  apiKey?: string
): Promise<SaynaClient> {
  const client = new SaynaClient(
    url,
    sttConfig,
    ttsConfig,
    livekitConfig,
    withoutAudio,
    apiKey
  );
  await client.connect();
  return client;
}
