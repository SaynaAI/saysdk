"""Tests for SaynaHttpClient class."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sayna_client.errors import SaynaServerError, SaynaValidationError
from sayna_client.http_client import SaynaHttpClient


class TestSaynaHttpClientInit:
    """Tests for SaynaHttpClient initialization."""

    def test_initialization_with_base_url(self) -> None:
        """Test client initializes with base URL."""
        client = SaynaHttpClient("https://api.example.com")
        assert client.base_url == "https://api.example.com"
        assert client.api_key is None

    def test_initialization_strips_trailing_slash(self) -> None:
        """Test that trailing slash is removed from base URL."""
        client = SaynaHttpClient("https://api.example.com/")
        assert client.base_url == "https://api.example.com"

    def test_initialization_with_api_key(self) -> None:
        """Test client initializes with API key."""
        client = SaynaHttpClient("https://api.example.com", api_key="test-key")
        assert client.api_key == "test-key"


class TestSaynaHttpClientSessionManagement:
    """Tests for session management."""

    @pytest.mark.asyncio
    async def test_ensure_session_creates_new_session(self) -> None:
        """Test that ensure_session creates a new session."""
        client = SaynaHttpClient("https://api.example.com")

        with patch("sayna_client.http_client.aiohttp.ClientSession") as mock_session_cls:
            mock_session = AsyncMock()
            mock_session_cls.return_value = mock_session

            session = await client._ensure_session()

            assert session == mock_session
            mock_session_cls.assert_called_once_with(headers={"Content-Type": "application/json"})

    @pytest.mark.asyncio
    async def test_ensure_session_includes_api_key(self) -> None:
        """Test that ensure_session includes API key in headers."""
        client = SaynaHttpClient("https://api.example.com", api_key="test-key")

        with patch("sayna_client.http_client.aiohttp.ClientSession") as mock_session_cls:
            mock_session = AsyncMock()
            mock_session_cls.return_value = mock_session

            await client._ensure_session()

            mock_session_cls.assert_called_once_with(
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer test-key",
                }
            )

    @pytest.mark.asyncio
    async def test_ensure_session_reuses_existing_session(self) -> None:
        """Test that ensure_session reuses existing session."""
        client = SaynaHttpClient("https://api.example.com")

        with patch("sayna_client.http_client.aiohttp.ClientSession") as mock_session_cls:
            mock_session = AsyncMock()
            mock_session.closed = False
            mock_session_cls.return_value = mock_session

            session1 = await client._ensure_session()
            session2 = await client._ensure_session()

            assert session1 == session2
            mock_session_cls.assert_called_once()

    @pytest.mark.asyncio
    async def test_ensure_session_recreates_closed_session(self) -> None:
        """Test that ensure_session recreates a closed session."""
        client = SaynaHttpClient("https://api.example.com")

        with patch("sayna_client.http_client.aiohttp.ClientSession") as mock_session_cls:
            mock_session1 = AsyncMock()
            mock_session1.closed = True
            mock_session2 = AsyncMock()
            mock_session2.closed = False
            mock_session_cls.return_value = mock_session2

            client._session = mock_session1
            session = await client._ensure_session()

            assert session == mock_session2
            mock_session_cls.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_closes_active_session(self) -> None:
        """Test that close closes an active session."""
        client = SaynaHttpClient("https://api.example.com")
        mock_session = AsyncMock()
        mock_session.closed = False
        client._session = mock_session

        await client.close()

        mock_session.close.assert_called_once()
        assert client._session is None

    @pytest.mark.asyncio
    async def test_close_handles_already_closed_session(self) -> None:
        """Test that close handles an already closed session."""
        client = SaynaHttpClient("https://api.example.com")
        mock_session = AsyncMock()
        mock_session.closed = True
        client._session = mock_session

        await client.close()

        mock_session.close.assert_not_called()

    @pytest.mark.asyncio
    async def test_close_handles_no_session(self) -> None:
        """Test that close handles no session gracefully."""
        client = SaynaHttpClient("https://api.example.com")
        await client.close()
        assert client._session is None


class TestSaynaHttpClientGet:
    """Tests for GET requests."""

    @pytest.mark.asyncio
    async def test_get_success(self) -> None:
        """Test successful GET request."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"status": "OK"})

        mock_session = AsyncMock()
        mock_session.get = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with patch.object(client, "_ensure_session", return_value=mock_session):
            result = await client.get("/health")

            assert result == {"status": "OK"}
            mock_session.get.assert_called_once_with("https://api.example.com/health", params=None)

    @pytest.mark.asyncio
    async def test_get_with_params(self) -> None:
        """Test GET request with query parameters."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"data": []})

        mock_session = AsyncMock()
        mock_session.get = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with patch.object(client, "_ensure_session", return_value=mock_session):
            result = await client.get("/search", params={"q": "test"})

            assert result == {"data": []}
            mock_session.get.assert_called_once_with(
                "https://api.example.com/search", params={"q": "test"}
            )

    @pytest.mark.asyncio
    async def test_get_server_error(self) -> None:
        """Test GET request with server error."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 500
        mock_response.reason = "Internal Server Error"
        mock_response.json = AsyncMock(return_value={"error": "Server error"})

        mock_session = AsyncMock()
        mock_session.get = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with (
            patch.object(client, "_ensure_session", return_value=mock_session),
            pytest.raises(SaynaServerError, match="Server error"),
        ):
            await client.get("/health")

    @pytest.mark.asyncio
    async def test_get_client_error(self) -> None:
        """Test GET request with client error."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 400
        mock_response.reason = "Bad Request"
        mock_response.json = AsyncMock(return_value={"error": "Invalid request"})

        mock_session = AsyncMock()
        mock_session.get = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with (
            patch.object(client, "_ensure_session", return_value=mock_session),
            pytest.raises(SaynaValidationError, match="Invalid request"),
        ):
            await client.get("/health")


class TestSaynaHttpClientPost:
    """Tests for POST requests."""

    @pytest.mark.asyncio
    async def test_post_success(self) -> None:
        """Test successful POST request."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"success": True})

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with patch.object(client, "_ensure_session", return_value=mock_session):
            result = await client.post("/action", json_data={"key": "value"})

            assert result == {"success": True}
            mock_session.post.assert_called_once_with(
                "https://api.example.com/action", data=None, json={"key": "value"}
            )

    @pytest.mark.asyncio
    async def test_post_with_form_data(self) -> None:
        """Test POST request with form data."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"success": True})

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with patch.object(client, "_ensure_session", return_value=mock_session):
            result = await client.post("/form", data={"field": "value"})

            assert result == {"success": True}
            mock_session.post.assert_called_once_with(
                "https://api.example.com/form", data={"field": "value"}, json=None
            )

    @pytest.mark.asyncio
    async def test_post_server_error(self) -> None:
        """Test POST request with server error."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 503
        mock_response.reason = "Service Unavailable"
        mock_response.json = AsyncMock(return_value={"error": "Service down"})

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with (
            patch.object(client, "_ensure_session", return_value=mock_session),
            pytest.raises(SaynaServerError, match="Service down"),
        ):
            await client.post("/action")


class TestSaynaHttpClientPostBinary:
    """Tests for binary POST requests."""

    @pytest.mark.asyncio
    async def test_post_binary_success(self) -> None:
        """Test successful binary POST request."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.read = AsyncMock(return_value=b"binary data")
        mock_response.headers = {"Content-Type": "audio/mp3"}

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with patch.object(client, "_ensure_session", return_value=mock_session):
            binary_data, headers = await client.post_binary("/speak", json_data={"text": "Hello"})

            assert binary_data == b"binary data"
            assert headers["Content-Type"] == "audio/mp3"
            mock_session.post.assert_called_once_with(
                "https://api.example.com/speak", json={"text": "Hello"}
            )

    @pytest.mark.asyncio
    async def test_post_binary_server_error_with_json(self) -> None:
        """Test binary POST with server error and JSON response."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 500
        mock_response.reason = "Internal Server Error"
        mock_response.json = AsyncMock(return_value={"error": "Processing failed"})

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with (
            patch.object(client, "_ensure_session", return_value=mock_session),
            pytest.raises(SaynaServerError, match="Processing failed"),
        ):
            await client.post_binary("/speak")

    @pytest.mark.asyncio
    async def test_post_binary_server_error_without_json(self) -> None:
        """Test binary POST with server error and no JSON response."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 500
        mock_response.reason = "Internal Server Error"
        mock_response.json = AsyncMock(side_effect=Exception("Not JSON"))

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with (
            patch.object(client, "_ensure_session", return_value=mock_session),
            pytest.raises(SaynaServerError, match="HTTP 500"),
        ):
            await client.post_binary("/speak")

    @pytest.mark.asyncio
    async def test_post_binary_client_error(self) -> None:
        """Test binary POST with client error."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 400
        mock_response.reason = "Bad Request"
        mock_response.json = AsyncMock(return_value={"error": "Invalid text"})

        mock_session = AsyncMock()
        mock_session.post = MagicMock(
            return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_response))
        )

        with (
            patch.object(client, "_ensure_session", return_value=mock_session),
            pytest.raises(SaynaValidationError, match="Invalid text"),
        ):
            await client.post_binary("/speak")


class TestSaynaHttpClientResponseHandling:
    """Tests for response handling."""

    @pytest.mark.asyncio
    async def test_handle_response_success(self) -> None:
        """Test handling successful response."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"data": "value"})

        result = await client._handle_response(mock_response)
        assert result == {"data": "value"}

    @pytest.mark.asyncio
    async def test_handle_response_server_error_with_json(self) -> None:
        """Test handling server error with JSON error message."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 500
        mock_response.reason = "Internal Server Error"
        mock_response.json = AsyncMock(return_value={"error": "Database error"})

        with pytest.raises(SaynaServerError, match="Database error"):
            await client._handle_response(mock_response)

    @pytest.mark.asyncio
    async def test_handle_response_server_error_without_json(self) -> None:
        """Test handling server error without JSON response."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 502
        mock_response.reason = "Bad Gateway"
        mock_response.json = AsyncMock(side_effect=Exception("Not JSON"))

        with pytest.raises(SaynaServerError, match="HTTP 502: Bad Gateway"):
            await client._handle_response(mock_response)

    @pytest.mark.asyncio
    async def test_handle_response_client_error_with_json(self) -> None:
        """Test handling client error with JSON error message."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 404
        mock_response.reason = "Not Found"
        mock_response.json = AsyncMock(return_value={"error": "Resource not found"})

        with pytest.raises(SaynaValidationError, match="Resource not found"):
            await client._handle_response(mock_response)

    @pytest.mark.asyncio
    async def test_handle_response_client_error_without_json(self) -> None:
        """Test handling client error without JSON response."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 401
        mock_response.reason = "Unauthorized"
        mock_response.json = AsyncMock(side_effect=Exception("Not JSON"))

        with pytest.raises(SaynaValidationError, match="HTTP 401: Unauthorized"):
            await client._handle_response(mock_response)

    @pytest.mark.asyncio
    async def test_handle_response_invalid_json(self) -> None:
        """Test handling response with invalid JSON."""
        client = SaynaHttpClient("https://api.example.com")

        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(side_effect=json.JSONDecodeError("Invalid", "", 0))

        with pytest.raises(SaynaServerError, match="Failed to decode JSON response"):
            await client._handle_response(mock_response)


class TestSaynaHttpClientContextManager:
    """Tests for async context manager."""

    @pytest.mark.asyncio
    async def test_context_manager_enter_creates_session(self) -> None:
        """Test that context manager entry creates session."""
        client = SaynaHttpClient("https://api.example.com")

        with patch("sayna_client.http_client.aiohttp.ClientSession") as mock_session_cls:
            mock_session = AsyncMock()
            mock_session_cls.return_value = mock_session

            async with client as ctx_client:
                assert ctx_client == client
                mock_session_cls.assert_called_once()

    @pytest.mark.asyncio
    async def test_context_manager_exit_closes_session(self) -> None:
        """Test that context manager exit closes session."""
        client = SaynaHttpClient("https://api.example.com")

        mock_session = AsyncMock()
        mock_session.closed = False

        with patch("sayna_client.http_client.aiohttp.ClientSession", return_value=mock_session):
            async with client:
                pass

            mock_session.close.assert_called_once()
            assert client._session is None
