"""Tests for custom exception classes."""

import pytest

from sayna_client.errors import (
    SaynaConnectionError,
    SaynaError,
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
        ]

        for error in errors_to_test:
            with pytest.raises(SaynaError):
                raise error
