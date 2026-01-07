# Sayna SDK

**Client and server SDKs for real-time voice streaming in AI agents**

This repository contains the official Sayna SDKs for adding voice capabilities to existing AI agents. Sayna provides a unified voice streaming layer that handles speech-to-text (STT) and text-to-speech (TTS) interactions, abstracting the complexity of managing real-time voice pipelines.

## What is Sayna?

Sayna enables AI agents to support natural voice conversations by providing:

- Real-time audio streaming over WebSockets
- Multi-provider support for STT (Deepgram, Google) and TTS (ElevenLabs, Google, Deepgram)
- Optional LiveKit integration for multi-participant voice rooms
- Low-latency voice pipeline management
- Type-safe client libraries

## Available SDKs

This monorepo contains three SDKs:

- **[JavaScript SDK](./js-sdk)** - Browser-based client for connecting to Sayna voice rooms
- **[Node.js SDK](./node-sdk)** - Server-side SDK for Node.js applications
- **[Python SDK](./python-sdk)** - Async Python SDK for server-side voice streaming

Each SDK has its own README with detailed installation instructions and API documentation.

## Repository Structure

```
saysdk/
├── js-sdk/              # Browser JavaScript SDK
├── node-sdk/            # Node.js server SDK
├── python-sdk/          # Python server SDK
├── api-reference.md     # Complete API documentation
└── README.md            # This file
```

## Documentation

- [API Reference](./api-reference.md) - Complete REST and WebSocket API documentation
- [JavaScript SDK](./js-sdk/README.md) - Browser client documentation
- [Node.js SDK](./node-sdk/README.md) - Node.js SDK documentation
- [Python SDK](./python-sdk/README.md) - Python SDK documentation

## Use Cases

- Voice-enabled chatbots and conversational AI
- AI-powered phone systems and telephony applications
- Multi-participant voice rooms with AI agents
- Real-time transcription services
- Voice synthesis and speech generation

## License

Apache License 2.0 - see [LICENSE](./LICENSE) for details
