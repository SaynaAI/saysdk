# @sayna/node-sdk

Sayna's Node.js SDK enables real-time voice interactions through WebSocket connections. Send audio for speech recognition, receive synthesized speech, and manage voice sessions from your Node.js applications.

## Features

- WebSocket-based real-time voice communication
- Speech-to-text (STT) with configurable providers
- Text-to-speech (TTS) with audio streaming
- LiveKit integration support
- Type-safe message handling

## Installation

```bash
npm install @sayna/node-sdk
```

## Usage

```ts
import { SaynaClient } from "@sayna/node-sdk";

const client = new SaynaClient(
  "https://api.sayna.ai",
  { provider: "deepgram", model: "nova-2" },
  { provider: "cartesia", voice_id: "example-voice" }
);

client.registerOnSttResult((result) => {
  console.log("Transcription:", result.transcript);
});

client.registerOnTtsAudio((audio) => {
  // Handle audio buffer
});

await client.connect();
await client.speak("Hello, world!");
```

## API

### REST API Methods

These methods use HTTP endpoints and don't require an active WebSocket connection:

### `await client.health()`

Performs a health check on the Sayna server.

**Returns**: `Promise<{ status: string }>` - Status object with "OK" when healthy.

**Example**:

```typescript
const health = await client.health();
console.log(health.status); // "OK"
```

### `await client.getVoices()`

Retrieves the catalogue of text-to-speech voices grouped by provider.

**Returns**: `Promise<Record<string, Voice[]>>` - Object where keys are provider names and values are arrays of voice descriptors.

**Example**:

```typescript
const voices = await client.getVoices();
for (const [provider, voiceList] of Object.entries(voices)) {
  console.log(
    `${provider}:`,
    voiceList.map((v) => v.name)
  );
}
```

### `await client.speakRest(text, ttsConfig)`

Synthesizes text into audio using the REST API. This is a standalone method that doesn't require an active WebSocket connection.

| parameter   | type        | purpose                                 |
| ----------- | ----------- | --------------------------------------- |
| `text`      | `string`    | Text to synthesize (must be non-empty). |
| `ttsConfig` | `TTSConfig` | Text-to-speech provider configuration.  |

**Returns**: `Promise<ArrayBuffer>` - Raw audio data.

**Example**:

```typescript
const audioBuffer = await client.speakRest("Hello, world!", {
  provider: "elevenlabs",
  voice_id: "21m00Tcm4TlvDq8ikWAM",
  model: "eleven_turbo_v2",
  speaking_rate: 1.0,
  audio_format: "mp3",
  sample_rate: 24000,
  connection_timeout: 30,
  request_timeout: 60,
  pronunciations: [],
});
```

### `await client.getLiveKitToken(roomName, participantName, participantIdentity)`

Issues a LiveKit access token for a participant.

| parameter             | type     | purpose                                |
| --------------------- | -------- | -------------------------------------- |
| `roomName`            | `string` | LiveKit room to join or create.        |
| `participantName`     | `string` | Display name for the participant.      |
| `participantIdentity` | `string` | Unique identifier for the participant. |

**Returns**: `Promise<LiveKitTokenResponse>` - Object containing token, room name, participant identity, and LiveKit URL.

**Example**:

```typescript
const tokenInfo = await client.getLiveKitToken(
  "my-room",
  "John Doe",
  "user-123"
);
console.log("Token:", tokenInfo.token);
console.log("LiveKit URL:", tokenInfo.livekit_url);
```

---

### WebSocket API Methods

These methods require an active WebSocket connection:

### `new SaynaClient(url, sttConfig, ttsConfig, livekitConfig?, withoutAudio?)`

| parameter       | type            | purpose                                                 |
| --------------- | --------------- | ------------------------------------------------------- |
| `url`           | `string`        | Sayna server URL (http://, https://, ws://, or wss://). |
| `sttConfig`     | `STTConfig`     | Speech-to-text provider configuration.                  |
| `ttsConfig`     | `TTSConfig`     | Text-to-speech provider configuration.                  |
| `livekitConfig` | `LiveKitConfig` | Optional LiveKit room configuration.                    |
| `withoutAudio`  | `boolean`       | Disable audio streaming (defaults to `false`).          |

### `await client.connect()`

Establishes WebSocket connection and sends initial configuration. Resolves when server sends ready message.

### `client.registerOnSttResult(callback)`

Registers a callback for speech-to-text transcription results.

### `client.registerOnTtsAudio(callback)`

Registers a callback for text-to-speech audio data (ArrayBuffer).

### `client.registerOnError(callback)`

Registers a callback for error messages.

### `client.registerOnMessage(callback)`

Registers a callback for participant messages.

### `client.registerOnParticipantDisconnected(callback)`

Registers a callback for participant disconnection events.

### `client.registerOnTtsPlaybackComplete(callback)`

Registers a callback for TTS playback completion events.

### `await client.speak(text, flush?, allowInterruption?)`

Sends text to be synthesized as speech.

| parameter           | type      | default | purpose                          |
| ------------------- | --------- | ------- | -------------------------------- |
| `text`              | `string`  | -       | Text to synthesize.              |
| `flush`             | `boolean` | `true`  | Clear TTS queue before speaking. |
| `allowInterruption` | `boolean` | `true`  | Allow speech to be interrupted.  |

### `await client.onAudioInput(audioData)`

Sends raw audio data (ArrayBuffer) to the server for speech recognition.

### `await client.sendMessage(message, role, topic?, debug?)`

Sends a message to the Sayna session with role and optional metadata.

### `await client.clear()`

Clears the text-to-speech queue.

### `await client.ttsFlush(allowInterruption?)`

Flushes the TTS queue by sending an empty speak command.

### `await client.disconnect()`

Disconnects from the WebSocket server and cleans up resources.

### `client.ready`

Boolean indicating whether the client is ready to send/receive data.

### `client.connected`

Boolean indicating whether the WebSocket connection is active.

### `client.livekitRoomName`

LiveKit room name acknowledged by the server, if available (present when LiveKit is enabled).

### `client.livekitUrl`

LiveKit WebSocket URL configured on the server, if available.

### `client.saynaParticipantIdentity`

Identity assigned to the agent participant when LiveKit is enabled, if available.

### `client.saynaParticipantName`

Display name assigned to the agent participant when LiveKit is enabled, if available.

## Development

```bash
bun install
bun run typecheck
bun run build
```

The repository uses Bun for dependency management and builds. The `build` script emits ready-to-publish JavaScript and type definitions in `dist/`.
