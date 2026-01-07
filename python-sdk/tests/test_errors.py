"""Tests for custom exception classes."""

import pytest

from sayna_client.errors import (
    SaynaConnectionError,
    SaynaError,
    SaynaHttpError,
    SaynaNotConnectedError,
    SaynaNotReadyError,
    SaynaServerError,
    SaynaValidationError,
)


class TestSaynaError:
    """Tests for base SaynaError class."""

    def test_basic_error(self) -> None:
        """Test creating and raising a basic error."""
        with pytest.raises(SaynaError) as exc_info:
            raise SaynaError("Test error")

        assert str(exc_info.value) == "Test error"
        assert exc_info.value.message == "Test error"

    def test_error_inheritance(self) -> None:
        """Test that SaynaError inherits from Exception."""
        error = SaynaError("Test")
        assert isinstance(error, Exception)


class TestSaynaNotConnectedError:
    """Tests for SaynaNotConnectedError."""

    def test_default_message(self) -> None:
        """Test error with default message."""
        error = SaynaNotConnectedError()
        assert "Not connected" in str(error)

    def test_custom_message(self) -> None:
        """Test error with custom message."""
        error = SaynaNotConnectedError("Custom connection error")
        assert str(error) == "Custom connection error"

    def test_inheritance(self) -> None:
        """Test that error inherits from SaynaError."""
        error = SaynaNotConnectedError()
        assert isinstance(error, SaynaError)


class TestSaynaNotReadyError:
    """Tests for SaynaNotReadyError."""

    def test_default_message(self) -> None:
        """Test error with default message."""
        error = SaynaNotReadyError()
        assert "not ready" in str(error)

    def test_custom_message(self) -> None:
        """Test error with custom message."""
        error = SaynaNotReadyError("Not ready yet")
        assert str(error) == "Not ready yet"


class TestSaynaConnectionError:
    """Tests for SaynaConnectionError."""

    def test_basic_connection_error(self) -> None:
        """Test error without cause."""
        error = SaynaConnectionError("Connection failed")
        assert str(error) == "Connection failed"
        assert error.cause is None

    def test_connection_error_with_cause(self) -> None:
        """Test error with underlying cause."""
        original = ValueError("Original error")
        error = SaynaConnectionError("Connection failed", cause=original)
        assert str(error) == "Connection failed"
        assert error.cause == original


class TestSaynaValidationError:
    """Tests for SaynaValidationError."""

    def test_validation_error(self) -> None:
        """Test validation error."""
        error = SaynaValidationError("Invalid parameter")
        assert str(error) == "Invalid parameter"
        assert isinstance(error, SaynaError)


class TestSaynaServerError:
    """Tests for SaynaServerError."""

    def test_server_error(self) -> None:
        """Test server error."""
        error = SaynaServerError("Server error occurred")
        assert str(error) == "Server error occurred"
        assert isinstance(error, SaynaError)

    def test_server_error_with_status_code(self) -> None:
        """Test server error with status code."""
        error = SaynaServerError("Database unavailable", status_code=500)
        assert error.message == "Database unavailable"
        assert error.status_code == 500
        assert error.endpoint is None

    def test_server_error_with_endpoint(self) -> None:
        """Test server error with endpoint."""
        error = SaynaServerError("Not found", endpoint="/livekit/rooms/test")
        assert error.message == "Not found"
        assert error.status_code is None
        assert error.endpoint == "/livekit/rooms/test"

    def test_server_error_with_all_fields(self) -> None:
        """Test server error with status code and endpoint."""
        error = SaynaServerError(
            "Internal error",
            status_code=503,
            endpoint="/health",
        )
        assert error.message == "Internal error"
        assert error.status_code == 503
        assert error.endpoint == "/health"


class TestSaynaHttpError:
    """Tests for SaynaHttpError."""

    def test_http_error_basic(self) -> None:
        """Test HTTP error with required status code."""
        error = SaynaHttpError("Forbidden", status_code=403)
        assert str(error) == "Forbidden"
        assert error.status_code == 403
        assert error.endpoint is None
        assert isinstance(error, SaynaServerError)

    def test_http_error_with_endpoint(self) -> None:
        """Test HTTP error with endpoint."""
        error = SaynaHttpError(
            "Room not found",
            status_code=404,
            endpoint="/livekit/rooms/test-room",
        )
        assert error.message == "Room not found"
        assert error.status_code == 404
        assert error.endpoint == "/livekit/rooms/test-room"

    def test_http_error_403_ownership_conflict(self) -> None:
        """Test HTTP error for 403 ownership conflict."""
        error = SaynaHttpError(
            "Room exists but belongs to different tenant",
            status_code=403,
            endpoint="/livekit/token",
        )
        assert error.status_code == 403
        assert "different tenant" in error.message

    def test_http_error_404_not_accessible(self) -> None:
        """Test HTTP error for 404 not found or not accessible."""
        error = SaynaHttpError(
            "Room not found or not accessible",
            status_code=404,
            endpoint="/livekit/rooms/my-room",
        )
        assert error.status_code == 404
        assert "not accessible" in error.message

    def test_http_error_inherits_from_server_error(self) -> None:
        """Test that SaynaHttpError inherits from SaynaServerError."""
        error = SaynaHttpError("Test", status_code=400)
        assert isinstance(error, SaynaServerError)
        assert isinstance(error, SaynaError)

    def test_http_error_can_be_caught_as_server_error(self) -> None:
        """Test that SaynaHttpError can be caught as SaynaServerError."""
        with pytest.raises(SaynaServerError):
            raise SaynaHttpError("Test", status_code=404)


class TestErrorHierarchy:
    """Tests for error class hierarchy."""

    def test_all_errors_inherit_from_base(self) -> None:
        """Test that all custom errors inherit from SaynaError."""
        errors = [
            SaynaNotConnectedError(),
            SaynaNotReadyError(),
            SaynaConnectionError("test"),
            SaynaValidationError("test"),
            SaynaServerError("test"),
            SaynaHttpError("test", status_code=404),
        ]

        for error in errors:
            assert isinstance(error, SaynaError)
            assert isinstance(error, Exception)

    def test_catching_base_error(self) -> None:
        """Test that SaynaError can catch all subclasses."""
        errors_to_test = [
            SaynaNotConnectedError(),
            SaynaNotReadyError(),
            SaynaConnectionError("test"),
            SaynaValidationError("test"),
            SaynaServerError("test"),
            SaynaHttpError("test", status_code=403),
        ]

        for error in errors_to_test:
            with pytest.raises(SaynaError):
                raise error
