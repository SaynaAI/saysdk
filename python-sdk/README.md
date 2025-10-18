# Sayna Python SDK

Python SDK for Sayna server-side WebSocket connections, enabling real-time voice interactions with speech-to-text (STT) and text-to-speech (TTS) capabilities.

## Features

- 🎤 **Speech-to-Text**: Real-time transcription with support for multiple providers (Deepgram, Google, etc.)
- 🔊 **Text-to-Speech**: High-quality voice synthesis with various TTS providers (ElevenLabs, Google, etc.)
- 🔌 **WebSocket Connection**: Async/await support with aiohttp
- ✅ **Type Safety**: Full type hints with Pydantic models
- 🚀 **Easy to Use**: Simple, intuitive API
- 📦 **Modern Python**: Built for Python 3.9+

## Installation

### Using pip

```bash
pip install sayna-client
```

### Using uv (recommended for faster installation)

```bash
uv pip install sayna-client
```

### From source

```bash
git clone https://github.com/sayna/saysdk.git
cd saysdk/python-sdk
pip install -e .
```

## Development Setup

This project supports both traditional pip and modern uv package managers.

### Option 1: Traditional Setup with pip

```bash
# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# On Linux/macOS:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# Install development dependencies
pip install -e ".[dev]"
```

### Option 2: Modern Setup with uv (Faster)

```bash
# Install uv if you haven't already
pip install uv

# Create a virtual environment with uv
uv venv

# Activate the virtual environment
source .venv/bin/activate  # On Linux/macOS
# .venv\Scripts\activate on Windows

# Install development dependencies with uv
uv pip install -e ".[dev]"
```

## Quick Start

```python
import asyncio
from sayna_client import SaynaClient, STTConfig, TTSConfig

async def main():
    # Initialize the client
    client = SaynaClient(
        url="wss://api.sayna.com/ws",
        api_key="your-api-key"
    )

    # Configure STT and TTS
    stt_config = STTConfig(
        provider="deepgram",
        language="en-US",
        sample_rate=16000,
        channels=1,
        punctuation=True,
        encoding="linear16",
        model="nova-2"
    )

    tts_config = TTSConfig(
        provider="elevenlabs",
        voice_id="your-voice-id",
        speaking_rate=1.0,
        audio_format="mp3",
        sample_rate=24000,
        connection_timeout=5000,
        request_timeout=10000,
        model="eleven_multilingual_v2",
        pronunciations=[]
    )

    # Connect to Sayna
    await client.connect()

    # Your application logic here

    # Disconnect when done
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
```

## Development

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

### Project Structure

```
python-sdk/
├── src/
│   └── sayna_client/          # Main package
│       ├── __init__.py        # Package exports
│       ├── client.py          # SaynaClient implementation
│       ├── types.py           # Pydantic models
│       ├── errors.py          # Custom exceptions
│       └── py.typed           # PEP 561 marker
├── tests/                     # Test suite
├── examples/                  # Usage examples
├── pyproject.toml            # Package configuration
├── requirements.txt          # Runtime dependencies
├── requirements-dev.txt      # Development dependencies
└── README.md                 # This file
```

## Requirements

- Python 3.9 or higher
- aiohttp >= 3.9.0
- pydantic >= 2.0.0

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please visit the [GitHub Issues](https://github.com/sayna/saysdk/issues) page.
