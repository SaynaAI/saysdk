"""Generic HTTP client for Sayna REST API calls."""

import json
from typing import Any, Optional

import aiohttp

from sayna_client.errors import SaynaServerError, SaynaValidationError


# HTTP status code constants
_HTTP_CLIENT_ERROR = 400
_HTTP_SERVER_ERROR = 500


class SaynaHttpClient:
    """Generic HTTP client for making REST API requests to Sayna server."""

    def __init__(self, base_url: str, api_key: Optional[str] = None) -> None:
        """Initialize the HTTP client.

        Args:
            base_url: Base URL for the Sayna API (e.g., 'https://api.sayna.com')
            api_key: Optional API key for authentication
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self) -> aiohttp.ClientSession:
        """Ensure an HTTP session exists."""
        if self._session is None or self._session.closed:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            self._session = aiohttp.ClientSession(headers=headers)

        return self._session

    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def get(
        self,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make a GET request.

        Args:
            endpoint: API endpoint path (e.g., '/voices')
            params: Optional query parameters

        Returns:
            JSON response as a dictionary

        Raises:
            SaynaServerError: If the server returns an error
            SaynaValidationError: If the request is invalid
        """
        session = await self._ensure_session()
        url = f"{self.base_url}{endpoint}"

        async with session.get(url, params=params) as response:
            return await self._handle_response(response)

    async def post(
        self,
        endpoint: str,
        data: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make a POST request.

        Args:
            endpoint: API endpoint path (e.g., '/speak')
            data: Optional form data
            json_data: Optional JSON payload

        Returns:
            JSON response as a dictionary

        Raises:
            SaynaServerError: If the server returns an error
            SaynaValidationError: If the request is invalid
        """
        session = await self._ensure_session()
        url = f"{self.base_url}{endpoint}"

        async with session.post(url, data=data, json=json_data) as response:
            return await self._handle_response(response)

    async def delete(
        self,
        endpoint: str,
        json_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make a DELETE request.

        Args:
            endpoint: API endpoint path (e.g., '/sip/hooks')
            json_data: Optional JSON payload

        Returns:
            JSON response as a dictionary

        Raises:
            SaynaServerError: If the server returns an error
            SaynaValidationError: If the request is invalid
        """
        session = await self._ensure_session()
        url = f"{self.base_url}{endpoint}"

        async with session.delete(url, json=json_data) as response:
            return await self._handle_response(response)

    async def get_binary(
        self,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
    ) -> tuple[bytes, dict[str, str]]:
        """Make a GET request expecting binary response.

        Args:
            endpoint: API endpoint path (e.g., '/recording/abc123')
            params: Optional query parameters

        Returns:
            Tuple of (binary_data, response_headers)

        Raises:
            SaynaServerError: If the server returns an error
            SaynaValidationError: If the request is invalid
        """
        session = await self._ensure_session()
        url = f"{self.base_url}{endpoint}"

        async with session.get(url, params=params) as response:
            if response.status >= _HTTP_CLIENT_ERROR:
                # Try to parse error message
                try:
                    error_data = await response.json()
                    error_msg = error_data.get("error", f"HTTP {response.status}")
                except Exception:
                    error_msg = f"HTTP {response.status}: {response.reason}"

                if response.status >= _HTTP_SERVER_ERROR:
                    raise SaynaServerError(error_msg)
                raise SaynaValidationError(error_msg)

            binary_data = await response.read()
            headers = dict(response.headers)
            return binary_data, headers

    async def post_binary(
        self,
        endpoint: str,
        json_data: Optional[dict[str, Any]] = None,
    ) -> tuple[bytes, dict[str, str]]:
        """Make a POST request expecting binary response.

        Args:
            endpoint: API endpoint path (e.g., '/speak')
            json_data: Optional JSON payload

        Returns:
            Tuple of (binary_data, response_headers)

        Raises:
            SaynaServerError: If the server returns an error
            SaynaValidationError: If the request is invalid
        """
        session = await self._ensure_session()
        url = f"{self.base_url}{endpoint}"

        async with session.post(url, json=json_data) as response:
            if response.status >= _HTTP_CLIENT_ERROR:
                # Try to parse error message
                try:
                    error_data = await response.json()
                    error_msg = error_data.get("error", f"HTTP {response.status}")
                except Exception:
                    error_msg = f"HTTP {response.status}: {response.reason}"

                if response.status >= _HTTP_SERVER_ERROR:
                    raise SaynaServerError(error_msg)
                raise SaynaValidationError(error_msg)

            binary_data = await response.read()
            headers = dict(response.headers)
            return binary_data, headers

    async def _handle_response(self, response: aiohttp.ClientResponse) -> dict[str, Any]:
        """Handle HTTP response and raise appropriate errors.

        Args:
            response: aiohttp response object

        Returns:
            Parsed JSON response

        Raises:
            SaynaServerError: If the server returns a 5xx error
            SaynaValidationError: If the request is invalid (4xx error)
        """
        if response.status >= _HTTP_CLIENT_ERROR:
            try:
                error_data = await response.json()
                error_msg = error_data.get("error", f"HTTP {response.status}")
            except Exception:
                error_msg = f"HTTP {response.status}: {response.reason}"

            if response.status >= _HTTP_SERVER_ERROR:
                raise SaynaServerError(error_msg)
            raise SaynaValidationError(error_msg)

        try:
            json_response: dict[str, Any] = await response.json()
            return json_response
        except json.JSONDecodeError as e:
            msg = f"Failed to decode JSON response: {e}"
            raise SaynaServerError(msg) from e

    async def __aenter__(self) -> "SaynaHttpClient":
        """Async context manager entry."""
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.close()
