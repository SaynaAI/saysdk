# Sayna FastAPI Example Server

A production-ready FastAPI server demonstrating integration with the Sayna Python SDK. This example mirrors the functionality of the Node.js example but uses FastAPI with background tasks for session management.

## Features

- **REST API Endpoint** for LiveKit token generation
- **Background Task Management** for Sayna WebSocket sessions
- **Session Lifecycle Management** with automatic cleanup
- **Event-Driven Architecture** with registered callbacks
- **Production-Ready** with proper logging and error handling

## Architecture

```
Client Request → FastAPI Endpoint → Get LiveKit Token → Return to Client
                                  ↓
                         Background Task → Establish Sayna Session
                                          → Register Event Handlers
                                          → Manage WebSocket Connection
```

## Installation

### Option 1: Using pip (Traditional)

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Linux/macOS:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# Install dependencies
pip install -e .
```

### Option 2: Using uv (Faster)

```bash
# Install uv if you haven't already
pip install uv

# Create virtual environment
uv venv

# Activate virtual environment
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate on Windows

# Install dependencies
uv pip install -e .
```

### Option 3: Using the Setup Script

```bash
# Make the script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

## Running the Server

### Development Mode (with auto-reload)

```bash
# Make sure virtual environment is activated
source .venv/bin/activate

# Run with uvicorn
uvicorn src.server:app --reload --host 0.0.0.0 --port 8000
```

Or use the Python module directly:

```bash
python -m src.server
```

### Production Mode

```bash
uvicorn src.server:app --host 0.0.0.0 --port 8000 --workers 4
```

The server will start on `http://localhost:8000`

## API Endpoints

### `GET /`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "sayna-fastapi-example"
}
```

### `POST /sayna/token`

Get LiveKit token and establish Sayna agent session.

**Query Parameters:**
- `sayna_url` (required): Sayna server base URL (e.g., `http://localhost:3000`)
- `room` (optional): LiveKit room name (generates UUID if not provided)
- `participant_name` (optional): Display name for the participant
- `participant_identity` (optional): Unique identity for the participant

**Example Request:**
```bash
curl -X POST "http://localhost:8000/sayna/token?sayna_url=http://localhost:3000&room=test-room&participant_name=John&participant_identity=user-123"
```

**Response:**
```json
{
  "token": "eyJhbGci...",
  "liveUrl": "wss://livekit.example.com",
  "roomName": "test-room",
  "participantIdentity": "user-123"
}
```

### `GET /sessions`

List active Sayna sessions (for debugging).

**Response:**
```json
{
  "count": 2,
  "sessions": [
    {
      "key": "http://localhost:3000::test-room",
      "connected": true,
      "ready": true,
      "room": "test-room"
    }
  ]
}
```

## How It Works

### 1. Token Request Flow

When a client requests a LiveKit token:

1. **Validation**: The server validates the Sayna URL
2. **Temporary Client**: Creates a temporary Sayna client
3. **REST API Call**: Uses the client's `get_livekit_token()` method
4. **Background Task**: Schedules a background task to establish the WebSocket session
5. **Response**: Returns the LiveKit token immediately to the client

### 2. Background Session Establishment

The background task:

1. **Creates Client**: Initializes a new `SaynaClient` instance
2. **Registers Callbacks**: Sets up event handlers for STT, errors, disconnections, etc.
3. **Connects**: Establishes WebSocket connection with config
4. **Stores Session**: Saves the client in the session map for reuse

### 3. Event Handling

The server registers callbacks for:

- **`on_stt_result`**: Echoes back transcribed speech
- **`on_participant_disconnected`**: Cleans up session when participant leaves
- **`on_tts_playback_complete`**: Logs TTS completion
- **`on_error`**: Logs error messages

### 4. Session Management

- **Session Key**: Combines Sayna URL and room name for unique identification
- **Reuse**: Checks for existing sessions before creating new ones
- **Cleanup**: Automatically disconnects on participant disconnect or server shutdown

## Configuration

Edit the constants in `src/server.py`:

```python
# STT Configuration
STT_CONFIG = STTConfig(
    provider="deepgram",
    language="en-US",
    sample_rate=16000,
    channels=1,
    punctuation=True,
    encoding="linear16",
    model="nova-3",
)

# TTS Configuration
TTS_CONFIG = TTSConfig(
    provider="elevenlabs",
    voice_id="21m00Tcm4TlvDq8ikWAM",
    speaking_rate=1.0,
    audio_format="linear16",
    sample_rate=16000,
    connection_timeout=30,
    request_timeout=60,
    model="eleven_turbo_v2_5",
    pronunciations=[],
)
```

## Development

### Code Quality

The project uses **Ruff** for linting and formatting, and **MyPy** for type checking.

```bash
# Check code
ruff check src/

# Format code
ruff format src/

# Type check
mypy src/
```

### Project Structure

```
python-server/
├── src/
│   └── server.py          # Main FastAPI application
├── pyproject.toml         # Project configuration
├── setup.sh               # Setup script
├── README.md              # This file
└── .gitignore            # Git ignore patterns
```

## Logging

The server uses Python's built-in logging with INFO level by default. Logs include:

- Session creation and lifecycle
- STT transcription results
- TTS playback events
- Participant connections/disconnections
- Errors and warnings

Example log output:
```
2025-01-18 12:00:00 - __main__ - INFO - [API] Token request - URL: http://localhost:3000, Room: test-room, Participant: user-123
2025-01-18 12:00:00 - __main__ - INFO - [Sayna] Creating session for: http://localhost:3000, room: test-room
2025-01-18 12:00:01 - __main__ - INFO - [Sayna] Connected to room: test-room
2025-01-18 12:00:05 - __main__ - INFO - [Sayna] STT Final: Hello world
2025-01-18 12:00:06 - __main__ - INFO - [Sayna] TTS playback complete at: 2025-01-18T12:00:06
```

## Comparison with Node.js Example

| Feature | Node.js | Python (This Example) |
|---------|---------|----------------------|
| Framework | Express/Bun | FastAPI |
| Session Storage | Map | Dict |
| Background Tasks | Promise | FastAPI BackgroundTasks |
| Type Safety | TypeScript | Python + MyPy |
| Callbacks | Arrow functions | Async functions |
| Error Handling | try/catch | try/except |

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 8000
lsof -i :8000

# Use a different port
uvicorn src.server:app --port 8001
```

### Connection Errors

- Ensure the Sayna server URL is correct and accessible
- Check that the Sayna server is running
- Verify network connectivity

### Import Errors

```bash
# Reinstall dependencies
pip install -e .

# Or with uv
uv pip install -e .
```

## License

MIT License - see the main repository for details.
