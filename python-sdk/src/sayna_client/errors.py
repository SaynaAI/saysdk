"""Custom exceptions for the Sayna SDK."""

from typing import Any, Optional


class SaynaError(Exception):
    """Base error class for all Sayna SDK errors."""

    def __init__(self, message: str) -> None:
        """Initialize the error.

        Args:
            message: Error description
        """
        super().__init__(message)
        self.message = message


class SaynaNotConnectedError(SaynaError):
    """Error raised when attempting to use the client before it's connected."""

    def __init__(self, message: str = "Not connected to Sayna WebSocket") -> None:
        """Initialize the error.

        Args:
            message: Error description
        """
        super().__init__(message)


class SaynaNotReadyError(SaynaError):
    """Error raised when attempting operations before the client is ready."""

    def __init__(
        self,
        message: str = "Sayna voice providers are not ready. Wait for the connection to be established.",
    ) -> None:
        """Initialize the error.

        Args:
            message: Error description
        """
        super().__init__(message)


class SaynaConnectionError(SaynaError):
    """Error raised when WebSocket connection fails."""

    def __init__(self, message: str, cause: Any = None) -> None:
        """Initialize the error.

        Args:
            message: Error description
            cause: The underlying exception that caused this error
        """
        super().__init__(message)
        self.cause = cause


class SaynaValidationError(SaynaError):
    """Error raised when invalid parameters are provided."""

    def __init__(self, message: str) -> None:
        """Initialize the error.

        Args:
            message: Error description
        """
        super().__init__(message)


class SaynaServerError(SaynaError):
    """Error raised when the server returns an error.

    This error includes optional HTTP status code and endpoint information
    to help diagnose server-side issues.

    Attributes:
        message: Error description
        status_code: HTTP status code (e.g., 403, 404, 500)
        endpoint: The API endpoint that returned the error
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        endpoint: Optional[str] = None,
    ) -> None:
        """Initialize the error.

        Args:
            message: Error description
            status_code: HTTP status code from the server response
            endpoint: API endpoint path that returned the error
        """
        super().__init__(message)
        self.status_code = status_code
        self.endpoint = endpoint


class SaynaHttpError(SaynaServerError):
    """Error raised for HTTP-specific failures with status code context.

    This is a specialized subclass of SaynaServerError that always includes
    the HTTP status code. Use this for HTTP 4xx/5xx errors where the status
    code is meaningful for error handling (e.g., 403 for ownership conflicts,
    404 for not found or not accessible).

    Attributes:
        message: Error description
        status_code: HTTP status code (always set)
        endpoint: The API endpoint that returned the error
    """

    def __init__(
        self,
        message: str,
        status_code: int,
        endpoint: Optional[str] = None,
    ) -> None:
        """Initialize the error.

        Args:
            message: Error description
            status_code: HTTP status code from the server response (required)
            endpoint: API endpoint path that returned the error
        """
        super().__init__(message, status_code=status_code, endpoint=endpoint)
