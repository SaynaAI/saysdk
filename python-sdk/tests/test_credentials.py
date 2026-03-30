"""Tests for GoogleAuth credential resolution."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from sayna_client.credentials import (
    resolve_config_auth,
    resolve_google_credentials,
    resolve_provider_auth,
)
from sayna_client.errors import SaynaValidationError
from sayna_client.types import (
    ApiKeyAuth,
    AzureAuth,
    GoogleAuth,
    STTConfig,
    TTSConfig,
)

SERVICE_ACCOUNT: dict = {
    "type": "service_account",
    "project_id": "my-project",
    "private_key_id": "key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
    "client_email": "sa@my-project.iam.gserviceaccount.com",
    "client_id": "123456789",
}


# ---------------------------------------------------------------------------
# resolve_google_credentials
# ---------------------------------------------------------------------------
class TestResolveGoogleCredentials:
    def test_dict_passthrough(self) -> None:
        result = resolve_google_credentials(SERVICE_ACCOUNT)
        assert result is SERVICE_ACCOUNT

    def test_json_string_parsed(self) -> None:
        json_str = json.dumps(SERVICE_ACCOUNT)
        result = resolve_google_credentials(json_str)
        assert result == SERVICE_ACCOUNT

    def test_json_string_array_raises(self) -> None:
        with pytest.raises(SaynaValidationError, match="must parse to an object"):
            resolve_google_credentials("[1,2,3]")

    def test_json_string_number_raises(self) -> None:
        with pytest.raises(SaynaValidationError):
            resolve_google_credentials("42")

    def test_json_string_string_raises(self) -> None:
        with pytest.raises(SaynaValidationError):
            resolve_google_credentials('"hello"')

    def test_json_string_null_raises(self) -> None:
        with pytest.raises(SaynaValidationError):
            resolve_google_credentials("null")

    def test_file_path_resolved(self, tmp_path: Path) -> None:
        filepath = tmp_path / "creds.json"
        filepath.write_text(json.dumps(SERVICE_ACCOUNT), encoding="utf-8")
        result = resolve_google_credentials(str(filepath))
        assert result == SERVICE_ACCOUNT

    def test_nonexistent_file_raises(self) -> None:
        with pytest.raises(SaynaValidationError, match="could not be read as a file"):
            resolve_google_credentials("/no/such/file.json")

    def test_file_invalid_json_raises(self, tmp_path: Path) -> None:
        filepath = tmp_path / "bad.json"
        filepath.write_text("not json {{", encoding="utf-8")
        with pytest.raises(SaynaValidationError, match="does not contain valid JSON"):
            resolve_google_credentials(str(filepath))

    def test_file_json_array_raises(self, tmp_path: Path) -> None:
        filepath = tmp_path / "array.json"
        filepath.write_text("[1,2,3]", encoding="utf-8")
        with pytest.raises(SaynaValidationError, match="must contain a JSON object"):
            resolve_google_credentials(str(filepath))


# ---------------------------------------------------------------------------
# resolve_provider_auth
# ---------------------------------------------------------------------------
class TestResolveProviderAuth:
    def test_api_key_auth_unchanged(self) -> None:
        auth = ApiKeyAuth(api_key="test")
        result = resolve_provider_auth(auth)
        assert result is auth

    def test_azure_auth_unchanged(self) -> None:
        auth = AzureAuth(api_key="key", region="eastus")
        result = resolve_provider_auth(auth)
        assert result is auth

    def test_google_auth_dict_unchanged(self) -> None:
        auth = GoogleAuth(credentials=SERVICE_ACCOUNT)
        result = resolve_provider_auth(auth)
        assert result is auth

    def test_google_auth_json_string_resolved(self) -> None:
        auth = GoogleAuth(credentials=json.dumps(SERVICE_ACCOUNT))
        result = resolve_provider_auth(auth)
        assert isinstance(result, GoogleAuth)
        assert result.credentials == SERVICE_ACCOUNT

    def test_google_auth_file_path_resolved(self, tmp_path: Path) -> None:
        filepath = tmp_path / "pa.json"
        filepath.write_text(json.dumps(SERVICE_ACCOUNT), encoding="utf-8")
        auth = GoogleAuth(credentials=str(filepath))
        result = resolve_provider_auth(auth)
        assert isinstance(result, GoogleAuth)
        assert result.credentials == SERVICE_ACCOUNT


# ---------------------------------------------------------------------------
# resolve_config_auth
# ---------------------------------------------------------------------------
class TestResolveConfigAuth:
    def test_none_returns_none(self) -> None:
        assert resolve_config_auth(None) is None

    def test_config_without_auth_unchanged(self) -> None:
        config = STTConfig(
            provider="deepgram",
            language="en-US",
            sample_rate=16000,
            channels=1,
            punctuation=True,
            encoding="linear16",
            model="nova-3",
        )
        result = resolve_config_auth(config)
        assert result is config

    def test_config_with_api_key_auth_unchanged(self) -> None:
        config = STTConfig(
            provider="deepgram",
            language="en-US",
            sample_rate=16000,
            channels=1,
            punctuation=True,
            encoding="linear16",
            model="nova-3",
            auth=ApiKeyAuth(api_key="test"),
        )
        result = resolve_config_auth(config)
        assert result is config

    def test_stt_config_google_auth_json_string(self) -> None:
        config = STTConfig(
            provider="google",
            language="en-US",
            sample_rate=16000,
            channels=1,
            punctuation=True,
            encoding="linear16",
            model="latest_long",
            auth=GoogleAuth(credentials=json.dumps(SERVICE_ACCOUNT)),
        )
        result = resolve_config_auth(config)
        assert result is not config
        assert isinstance(result, STTConfig)
        assert isinstance(result.auth, GoogleAuth)
        assert result.auth.credentials == SERVICE_ACCOUNT
        assert result.provider == "google"
        assert result.model == "latest_long"

    def test_tts_config_google_auth_file(self, tmp_path: Path) -> None:
        filepath = tmp_path / "tts.json"
        filepath.write_text(json.dumps(SERVICE_ACCOUNT), encoding="utf-8")
        config = TTSConfig(
            provider="google",
            model="en-US-Wavenet-D",
            auth=GoogleAuth(credentials=str(filepath)),
        )
        result = resolve_config_auth(config)
        assert result is not config
        assert isinstance(result, TTSConfig)
        assert isinstance(result.auth, GoogleAuth)
        assert result.auth.credentials == SERVICE_ACCOUNT
        assert result.provider == "google"

    def test_tts_config_google_auth_dict_unchanged(self) -> None:
        config = TTSConfig(
            provider="google",
            model="en-US-Wavenet-D",
            auth=GoogleAuth(credentials=SERVICE_ACCOUNT),
        )
        result = resolve_config_auth(config)
        assert result is config
