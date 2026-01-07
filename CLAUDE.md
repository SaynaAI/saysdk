# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sayna SDK is a monorepo containing official SDKs for real-time voice streaming in AI agents. It provides client libraries for connecting to the Sayna voice API, which handles speech-to-text (STT), text-to-speech (TTS), and LiveKit integration.

## Repository Structure

- `js-sdk/` - Browser JavaScript SDK (uses LiveKit client directly)
- `node-sdk/` - Node.js server SDK (WebSocket-based)
- `python-sdk/` - Python async SDK (aiohttp + pydantic)

## SDK-Specific Rules

Detailed development rules, build commands, and architecture patterns for each SDK are in `.cursor/rules/`:

- **`node-sdk.mdc`** - Node.js SDK: build commands, event callbacks, REST/WebSocket methods, error handling
- **`js-sdk.mdc`** - Browser JS SDK: LiveKit client wrapper, token configuration, audio playback
- **`python-sdk.mdc`** - Python SDK: async patterns, Pydantic models, webhook receiver
- **`documentation.mdc`** - Full documentation reference with API contracts and sync guidelines

## Quick Reference

### Build All SDKs
```bash
# Node.js SDK
cd node-sdk && bun install && bun run build

# JavaScript SDK
cd js-sdk && bun install && bun run build

# Python SDK
cd python-sdk && pip install -e ".[dev]"
```

### Run Tests
```bash
cd node-sdk && bun run test
cd python-sdk && pytest
```

## Key Patterns

- **Dual API**: Both WebSocket (real-time streaming) and REST endpoints
- **Callback-based events**: `registerOnSttResult()`, `registerOnTtsAudio()`, etc.
- **Connection flow**: Create client → `connect()` → wait for `ready` → use API → `disconnect()`

## Documentation References

### Server Documentation (`../sayna/docs/`)
- `openapi.yaml` - OpenAPI 3.1 spec (authoritative for REST endpoints)
- `websocket.md` - WebSocket protocol documentation
- `api-reference.md` - Human-readable API guide

### Public Documentation (`../docs/`)
- `quickstart.mdx` - Getting started guide
- `guides/` - Architecture, authentication, operations

## Package Publishing

- npm: `@sayna-ai/node-sdk`, `@sayna-ai/js-sdk`
- PyPI: `sayna-client`
