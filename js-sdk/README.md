# @sayna/js-sdk

[Sayna AI](https://sayna.ai) JavaScript SDK makes it easy to request access tokens, join voice rooms, and manage microphone publishing directly from the browser. It hides the low-level wiring so product teams can focus on interface and experience.

## Features

- Automatic token retrieval with simple configuration
- Room lifecycle helpers to connect, publish audio, and disconnect
- Built-in remote audio playback via a provided or auto-created `<audio>` element
- Works with any framework (or none); no JSX or React dependencies

## Installation

```bash
# npm, yarn, pnpm, bun, deno
npm install @sayna-ai/js-sdk
```

The package is delivered as an ES module for modern browsers.

## Usage

```ts
import { SaynaClient } from "@sayna-ai/js-sdk";

const client = new SaynaClient({
  tokenUrl: "/sayna/token",
  enableAudioPlayback: true,
});

await client.connect();
await client.publishMicrophone();

// when finished
await client.disconnect();
```

If you already have custom token logic, provide a `tokenFetchHandler` instead of `tokenUrl`:

```ts
const client = new SaynaClient({
  tokenFetchHandler: async () => {
    const response = await fetch("/sayna/token", { method: "POST" });
    return response.json();
  },
});
```

## API

### `new SaynaClient(options)`

| option | type | purpose |
| --- | --- | --- |
| `tokenUrl` | `string \| URL` | Endpoint used to retrieve access tokens; relative paths resolve against `window.location`. |
| `tokenFetchHandler` | `() => Promise<TokenResponse>` | Custom function used to fetch tokens. Overrides `tokenUrl` when provided. |
| `audioElement` | `HTMLAudioElement` | Existing element to attach remote audio playback. |
| `enableAudioPlayback` | `boolean` | Toggle automatic playback support (defaults to `true`). |

`TokenResponse` must include a `token` string and a `liveUrl` string provided by your backend.

Either `tokenUrl` or `tokenFetchHandler` is required when creating a client.

### `await client.connect(options?)`

Connects to the voice room using the token response from `tokenUrl`. Resolves to the underlying room instance.

### `await client.publishMicrophone(audioOptions?)`

Enables the microphone and publishes audio to the active room. Throws if called before `connect()`.

### `await client.disconnect()`

Cleans up listeners, detaches remote tracks, and leaves the room. Safe to call multiple times.

### `client.currentRoom`

Reference to the currently connected room, or `null` while disconnected.

### `client.isConnected`

Boolean that reflects whether the room is connected.

### `client.playbackElement`

Returns the `HTMLAudioElement` used for remote audio playback (auto-created when needed).

## Development

```bash
bun install
bun run typecheck
bun run build
```

The repository uses Bun for dependency management and type-checking. The `build` script emits ready-to-publish JavaScript and type definitions in `dist/`.
