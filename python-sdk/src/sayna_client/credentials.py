"""Resolve GoogleAuth credentials from strings or file paths."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, overload

from sayna_client.errors import SaynaValidationError
from sayna_client.types import (
    GoogleAuth,
    ProviderAuth,
    STTConfig,
    TTSConfig,
)


def resolve_google_credentials(
    credentials: str | dict[str, Any],
) -> dict[str, Any]:
    """Resolve Google credentials from a string to a parsed dict.

    If the value is already a dict it is returned as-is.
    If it is a string, the function first tries ``json.loads``.
    When parsing fails, the string is treated as a file path
    and the file is read and parsed.

    Raises:
        SaynaValidationError: When the string is neither valid JSON
            nor a readable JSON file.
    """
    if isinstance(credentials, dict):
        return credentials

    # Try parsing as inline JSON string
    try:
        parsed = json.loads(credentials)
        if isinstance(parsed, dict):
            return parsed
        raise SaynaValidationError(
            f"GoogleAuth credentials JSON string must parse to an object, got {type(parsed).__name__}"
        )
    except json.JSONDecodeError:
        pass  # Not valid JSON — fall through to file path handling

    # Treat as file path
    path = Path(credentials)
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        msg = (
            "GoogleAuth credentials string is not valid JSON "
            f"and could not be read as a file: {credentials}"
        )
        raise SaynaValidationError(msg) from exc

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise SaynaValidationError(
            f"GoogleAuth credentials file does not contain valid JSON: {credentials}"
        ) from exc

    if not isinstance(parsed, dict):
        raise SaynaValidationError(
            f"GoogleAuth credentials file must contain a JSON object: {credentials}"
        )

    return parsed


def resolve_provider_auth(auth: ProviderAuth) -> ProviderAuth:
    """Resolve provider auth credentials.

    For :class:`GoogleAuth` with string credentials the value is resolved
    via :func:`resolve_google_credentials`. All other auth types pass through
    unchanged.
    """
    if not isinstance(auth, GoogleAuth) or not isinstance(auth.credentials, str):
        return auth
    return GoogleAuth(credentials=resolve_google_credentials(auth.credentials))


@overload
def resolve_config_auth(config: STTConfig) -> STTConfig: ...


@overload
def resolve_config_auth(config: TTSConfig) -> TTSConfig: ...


@overload
def resolve_config_auth(config: None) -> None: ...


def resolve_config_auth(
    config: STTConfig | TTSConfig | None,
) -> STTConfig | TTSConfig | None:
    """Resolve provider auth inside an STT or TTS config object.

    Returns the original config when no resolution is needed,
    or a copy with the resolved auth otherwise.
    Accepts ``None`` for convenience and returns it unchanged.
    """
    if config is None or config.auth is None:
        return config
    resolved = resolve_provider_auth(config.auth)
    if resolved is config.auth:
        return config
    return config.model_copy(update={"auth": resolved})
