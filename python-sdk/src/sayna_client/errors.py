"""Custom exceptions for the Sayna SDK."""

from typing import Any


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
    """Error raised when the server returns an error."""

    def __init__(self, message: str) -> None:
        """Initialize the error.

        Args:
            message: Error description
        """
        super().__init__(message)
