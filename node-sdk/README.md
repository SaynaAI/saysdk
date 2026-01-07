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

### `await client.getSipHooks()`

Retrieves all configured SIP webhook hooks from the runtime cache.

**Returns**: `Promise<SipHooksResponse>` - Object containing an array of configured hooks.

**Example**:

```typescript
const response = await client.getSipHooks();
for (const hook of response.hooks) {
  console.log(`Host: ${hook.host}, URL: ${hook.url}, Auth ID: ${hook.auth_id}`);
}
```

### `await client.setSipHooks(hooks)`

Sets or updates SIP webhook hooks in the runtime cache. Hooks with matching hosts will be replaced; new hosts will be added.

| parameter | type        | purpose                                  |
| --------- | ----------- | ---------------------------------------- |
| `hooks`   | `SipHook[]` | Array of SIP hook configurations to set. |

Each `SipHook` object contains:

| field     | type     | description                                                                                                            |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `host`    | `string` | SIP domain pattern (case-insensitive).                                                                                 |
| `url`     | `string` | HTTPS URL to forward webhook events to.                                                                                |
| `auth_id` | `string` | Tenant identifier for this hook. Required but may be empty for unauthenticated mode. Treat as opaque; pass unchanged. |

**Returns**: `Promise<SipHooksResponse>` - Object containing the merged list of all configured hooks.

**Example**:

```typescript
const response = await client.setSipHooks([
  { host: "example.com", url: "https://webhook.example.com/events", auth_id: "tenant-123" },
  { host: "another.com", url: "https://webhook.another.com/events", auth_id: "" },  // Empty for unauthenticated mode
]);
console.log("Total hooks configured:", response.hooks.length);
```

---

### Room Ownership and Access

When authentication is enabled, the server enforces room-level access control:

- **Room names are clean**: The SDK does not rewrite or prefix room names. Pass room names as-is.
- **Room listings are scoped**: `getLiveKitRooms()` returns only rooms accessible to your authenticated context.
- **403 on token requests**: `getLiveKitToken()` returns a 403 error if the room exists but is owned by another tenant. Do not retry with a modified room name.
- **404 masks access denial**: For room-scoped operations (`getLiveKitRoom()`, `removeLiveKitParticipant()`, `muteLiveKitParticipantTrack()`, `sipTransferRest()`), a 404 response can mean "not found" or "not accessible."
- **Inbound SIP rooms**: Rooms created by inbound SIP calls are owned by the routing configuration's `auth_id`. Access depends on your authentication context.
- **WebSocket errors**: Ownership/access errors during WebSocket configuration are surfaced via the error callback. Retry with the correct room name if needed.

Errors include HTTP status and endpoint information for easier debugging:

```typescript
try {
  await client.getLiveKitToken("some-room", "user", "user-123");
} catch (error) {
  if (error instanceof SaynaServerError) {
    console.log(`Status: ${error.status}, Endpoint: ${error.endpoint}`);
    // Status: 403, Endpoint: livekit/token
  }
}
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

---

## Webhook Receiver

The SDK includes a `WebhookReceiver` class for securely receiving and verifying cryptographically signed webhooks from Sayna's SIP service.

### Security Features

- **HMAC-SHA256 Signature Verification**: Ensures webhook authenticity
- **Constant-Time Comparison**: Prevents timing attack vulnerabilities
- **Replay Protection**: 5-minute timestamp window prevents replay attacks
- **Strict Validation**: Comprehensive checks on all required fields

### `new WebhookReceiver(secret?)`

Creates a new webhook receiver instance.

| parameter | type     | purpose                                                                     |
| --------- | -------- | --------------------------------------------------------------------------- |
| `secret`  | `string` | HMAC signing secret (min 16 chars). Defaults to `SAYNA_WEBHOOK_SECRET` env. |

**Example**:

```typescript
import { WebhookReceiver } from "@sayna/node-sdk";

// Explicit secret
const receiver = new WebhookReceiver("your-secret-key-min-16-chars");

// Or use environment variable
process.env.SAYNA_WEBHOOK_SECRET = "your-secret-key";
const receiver = new WebhookReceiver();
```

### `receiver.receive(headers, body)`

Verifies and parses an incoming SIP webhook.

| parameter | type                                              | purpose                                       |
| --------- | ------------------------------------------------- | --------------------------------------------- |
| `headers` | `Record<string, string \| string[] \| undefined>` | HTTP request headers (case-insensitive).      |
| `body`    | `string`                                          | Raw request body as string (not parsed JSON). |

**Returns**: `WebhookSIPOutput` - Parsed and validated webhook payload.

**Throws**: `SaynaValidationError` if signature verification fails or payload is invalid.

### Express Example

```typescript
import express from "express";
import { WebhookReceiver } from "@sayna/node-sdk";

const app = express();
const receiver = new WebhookReceiver("your-secret-key-min-16-chars");

app.post(
  "/webhook",
  express.json({
    verify: (req, res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }),
  (req, res) => {
    try {
      const webhook = receiver.receive(req.headers, (req as any).rawBody);

      console.log("Valid webhook received:");
      console.log("  From:", webhook.from_phone_number);
      console.log("  To:", webhook.to_phone_number);
      console.log("  Room:", webhook.room.name);
      console.log("  SIP Host:", webhook.sip_host);
      console.log("  Participant:", webhook.participant.identity);

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Webhook verification failed:", error.message);
      res.status(401).json({ error: "Invalid signature" });
    }
  }
);
```

### Fastify Example

```typescript
import Fastify from "fastify";
import { WebhookReceiver } from "@sayna/node-sdk";

const fastify = Fastify();
const receiver = new WebhookReceiver();

fastify.post(
  "/webhook",
  {
    config: { rawBody: true },
  },
  async (request, reply) => {
    try {
      const webhook = receiver.receive(request.headers, request.rawBody);
      return { received: true };
    } catch (error) {
      reply.code(401);
      return { error: error.message };
    }
  }
);
```

### WebhookSIPOutput Type

The `receive` method returns a `WebhookSIPOutput` object with the following structure:

| field                  | type                    | description                                  |
| ---------------------- | ----------------------- | -------------------------------------------- |
| `participant`          | `WebhookSIPParticipant` | SIP participant information.                 |
| `participant.identity` | `string`                | Unique identity assigned to the participant. |
| `participant.sid`      | `string`                | Participant session ID from LiveKit.         |
| `participant.name`     | `string?`               | Display name (optional).                     |
| `room`                 | `WebhookSIPRoom`        | LiveKit room information.                    |
| `room.name`            | `string`                | Name of the LiveKit room.                    |
| `room.sid`             | `string`                | Room session ID from LiveKit.                |
| `from_phone_number`    | `string`                | Caller's phone number (E.164 format).        |
| `to_phone_number`      | `string`                | Called phone number (E.164 format).          |
| `room_prefix`          | `string`                | Room name prefix configured in Sayna.        |
| `sip_host`             | `string`                | SIP domain extracted from the To header.     |

## Development

```bash
bun install
bun run typecheck
bun run build
```

The repository uses Bun for dependency management and builds. The `build` script emits ready-to-publish JavaScript and type definitions in `dist/`.
