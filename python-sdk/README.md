# Sayna Python SDK

Python SDK for Sayna's real-time voice interaction API. Send audio for speech recognition, receive synthesized speech, and manage voice sessions from your Python applications.

## Features

- 🎤 **Speech-to-Text**: Real-time transcription with support for multiple providers (Deepgram, Google, etc.)
- 🔊 **Text-to-Speech**: High-quality voice synthesis with various TTS providers (ElevenLabs, Google, etc.)
- 🔌 **WebSocket Connection**: Async/await support with aiohttp
- 🌐 **REST API**: Standalone endpoints for health checks, voice catalog, and TTS synthesis
- ✅ **Type Safety**: Full type hints with Pydantic models
- 🚀 **Easy to Use**: Simple, intuitive API
- 📦 **Modern Python**: Built for Python 3.9+

## Installation

```bash
pip install sayna-client
```

## Quick Start

```python
import asyncio
from sayna_client import SaynaClient, STTConfig, TTSConfig

async def main():
    # Initialize the client with configs
    client = SaynaClient(
        url="https://api.sayna.ai",
        stt_config=STTConfig(
            provider="deepgram",
            model="nova-2"
        ),
        tts_config=TTSConfig(
            provider="cartesia",
            voice_id="example-voice"
        ),
        api_key="your-api-key"
    )

    # Register callbacks
    client.register_on_stt_result(lambda result: print(f"Transcription: {result.transcript}"))
    client.register_on_tts_audio(lambda audio: print(f"Received {len(audio)} bytes of audio"))

    # Connect and interact
    await client.connect()
    await client.speak("Hello, world!")
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
```

## API

### REST API Methods

These methods use HTTP endpoints and don't require an active WebSocket connection:

#### `await client.health()`

Performs a health check on the Sayna server.

**Returns**: `HealthResponse` - Response object with `status` field ("OK" when healthy).

**Example**:
```python
health = await client.health()
print(health.status)  # "OK"
```

---

#### `await client.get_voices()`

Retrieves the catalogue of text-to-speech voices grouped by provider.

**Returns**: `dict[str, list[VoiceDescriptor]]` - Dictionary where keys are provider names and values are lists of voice descriptors.

**Example**:
```python
voices = await client.get_voices()
for provider, voice_list in voices.items():
    print(f"{provider}:", [v.name for v in voice_list])
```

---

#### `await client.speak_rest(text, tts_config)`

Synthesizes text into audio using the REST API. This is a standalone method that doesn't require an active WebSocket connection.

| Parameter | Type | Purpose |
| --- | --- | --- |
| `text` | `str` | Text to synthesize (must be non-empty). |
| `tts_config` | `TTSConfig` | Text-to-speech provider configuration. |

**Returns**: `tuple[bytes, dict[str, str]]` - Tuple of (audio_data, response_headers). Headers include: Content-Type, Content-Length, x-audio-format, x-sample-rate.

**Example**:
```python
audio_data, headers = await client.speak_rest("Hello, world!", TTSConfig(
    provider="elevenlabs",
    voice_id="21m00Tcm4TlvDq8ikWAM",
    model="eleven_turbo_v2",
    speaking_rate=1.0,
    audio_format="mp3",
    sample_rate=24000,
    connection_timeout=30,
    request_timeout=60,
    pronunciations=[]
))
print(f"Received {len(audio_data)} bytes of {headers['Content-Type']}")
```

---

#### `await client.get_livekit_token(room_name, participant_name, participant_identity)`

Issues a LiveKit access token for a participant.

| Parameter | Type | Purpose |
| --- | --- | --- |
| `room_name` | `str` | LiveKit room to join or create. |
| `participant_name` | `str` | Display name for the participant. |
| `participant_identity` | `str` | Unique identifier for the participant. |

**Returns**: `LiveKitTokenResponse` - Object containing token, room name, participant identity, and LiveKit URL.

**Example**:
```python
token_info = await client.get_livekit_token(
    "my-room",
    "John Doe",
    "user-123"
)
print("Token:", token_info.token)
print("LiveKit URL:", token_info.livekit_url)
```

---

### WebSocket API Methods

These methods require an active WebSocket connection:

#### `SaynaClient(url, stt_config, tts_config, livekit_config=None, without_audio=False, api_key=None)`

Creates a new SaynaClient instance.

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `url` | `str` | - | Sayna server URL (http://, https://, ws://, or wss://). |
| `stt_config` | `STTConfig` | - | Speech-to-text provider configuration. |
| `tts_config` | `TTSConfig` | - | Text-to-speech provider configuration. |
| `livekit_config` | `LiveKitConfig` (optional) | `None` | Optional LiveKit room configuration. |
| `without_audio` | `bool` | `False` | Disable audio streaming. |
| `api_key` | `str` (optional) | `None` | API key for authentication. |

---

#### `await client.connect()`

Establishes WebSocket connection and sends initial configuration. Resolves when server sends ready message.

---

#### `client.register_on_stt_result(callback)`

Registers a callback for speech-to-text transcription results.

**Example**:
```python
def handle_stt(result):
    print(f"Transcription: {result.transcript}")

client.register_on_stt_result(handle_stt)
```

---

#### `client.register_on_tts_audio(callback)`

Registers a callback for text-to-speech audio data.

**Example**:
```python
def handle_audio(audio_data: bytes):
    print(f"Received {len(audio_data)} bytes of audio")

client.register_on_tts_audio(handle_audio)
```

---

#### `client.register_on_error(callback)`

Registers a callback for error messages.

---

#### `client.register_on_message(callback)`

Registers a callback for participant messages.

---

#### `client.register_on_participant_disconnected(callback)`

Registers a callback for participant disconnection events.

---

#### `client.register_on_tts_playback_complete(callback)`

Registers a callback for TTS playback completion events.

---

#### `await client.speak(text, flush=True, allow_interruption=True)`

Sends text to be synthesized as speech.

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `text` | `str` | - | Text to synthesize. |
| `flush` | `bool` | `True` | Clear TTS queue before speaking. |
| `allow_interruption` | `bool` | `True` | Allow speech to be interrupted. |

**Example**:
```python
await client.speak("Hello, world!")
await client.speak("Important message", flush=True, allow_interruption=False)
```

---

#### `await client.on_audio_input(audio_data)`

Sends raw audio data (bytes) to the server for speech recognition.

**Example**:
```python
await client.on_audio_input(audio_bytes)
```

---

#### `await client.send_message(message, role, topic="messages", debug=None)`

Sends a message to the Sayna session with role and optional metadata.

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `message` | `str` | - | Message content. |
| `role` | `str` | - | Sender role (e.g., 'user', 'assistant'). |
| `topic` | `str` | `"messages"` | LiveKit topic/channel. |
| `debug` | `dict` (optional) | `None` | Optional debug metadata. |

---

#### `await client.clear()`

Clears the text-to-speech queue.

---

#### `await client.tts_flush(allow_interruption=True)`

Flushes the TTS queue by sending an empty speak command.

---

#### `await client.disconnect()`

Disconnects from the WebSocket server and cleans up resources.

---

#### Properties

- **`client.ready`**: Boolean indicating whether the connection is ready (received ready message).
- **`client.connected`**: Boolean indicating whether the WebSocket is connected.
- **`client.livekit_room_name`**: LiveKit room name (available after ready when LiveKit is enabled).
- **`client.livekit_url`**: LiveKit URL (available after ready).
- **`client.sayna_participant_identity`**: Sayna participant identity (available after ready when LiveKit is enabled).
- **`client.sayna_participant_name`**: Sayna participant name (available after ready when LiveKit is enabled).

---

## Development

### Setup

```bash
# Create a virtual environment
python -m venv .venv

# Activate it
source .venv/bin/activate  # On Linux/macOS
# .venv\Scripts\activate  # On Windows

# Install development dependencies
pip install -e ".[dev]"
```

> **Tip**: For faster dependency installation, you can use [uv](https://github.com/astral-sh/uv):
> ```bash
> pip install uv
> uv pip install -e ".[dev]"
> ```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=sayna_client --cov-report=html

# Run specific test file
pytest tests/test_client.py
```

### Type Checking

```bash
mypy src/sayna_client
```

### Linting and Formatting

This project uses [Ruff](https://github.com/astral-sh/ruff) for linting and formatting:

```bash
# Check code
ruff check .

# Format code
ruff format .

# Fix auto-fixable issues
ruff check --fix .
```

## Requirements

- Python 3.9 or higher
- aiohttp >= 3.9.0
- pydantic >= 2.0.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please visit the [GitHub Issues](https://github.com/sayna/saysdk/issues) page.
