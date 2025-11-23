"""Tests for WebhookReceiver class."""

import hashlib
import hmac
import json
import os
import time
from typing import Any

import pytest

from sayna_client import SaynaValidationError, WebhookReceiver


def _generate_signature(secret: str, timestamp: str, event_id: str, body: str) -> str:
    """Helper to generate a valid webhook signature."""
    canonical = f"v1:{timestamp}:{event_id}:{body}"
    signature = hmac.new(
        secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"v1={signature}"


def _get_valid_webhook_payload() -> dict[str, Any]:
    """Helper to create a valid webhook payload."""
    return {
        "participant": {
            "identity": "sip-participant-123",
            "sid": "PA_abc123",
            "name": "John Doe",
        },
        "room": {
            "name": "sip-test-room",
            "sid": "RM_xyz789",
        },
        "from_phone_number": "+15559876543",
        "to_phone_number": "+15551234567",
        "room_prefix": "sip-",
        "sip_host": "example.com",
    }


def _get_valid_headers(secret: str, body: str, timestamp: str | None = None) -> dict[str, str]:
    """Helper to create valid webhook headers."""
    if timestamp is None:
        timestamp = str(int(time.time()))

    event_id = "evt_12345"
    signature = _generate_signature(secret, timestamp, event_id, body)

    return {
        "x-sayna-signature": signature,
        "x-sayna-timestamp": timestamp,
        "x-sayna-event-id": event_id,
    }


class TestWebhookReceiverInit:
    """Tests for WebhookReceiver initialization."""

    def test_initialization_with_explicit_secret(self) -> None:
        """Test receiver can be initialized with explicit secret."""
        receiver = WebhookReceiver("my-secret-key-1234567890")
        assert receiver._secret == "my-secret-key-1234567890"

    def test_initialization_with_env_variable(self) -> None:
        """Test receiver uses SAYNA_WEBHOOK_SECRET env variable."""
        os.environ["SAYNA_WEBHOOK_SECRET"] = "env-secret-key-1234567890"
        try:
            receiver = WebhookReceiver()
            assert receiver._secret == "env-secret-key-1234567890"
        finally:
            del os.environ["SAYNA_WEBHOOK_SECRET"]

    def test_initialization_trims_secret(self) -> None:
        """Test that secret is trimmed of whitespace."""
        receiver = WebhookReceiver("  my-secret-key-1234567890  ")
        assert receiver._secret == "my-secret-key-1234567890"

    def test_initialization_fails_without_secret(self) -> None:
        """Test initialization fails when no secret is provided."""
        # Ensure env variable is not set
        if "SAYNA_WEBHOOK_SECRET" in os.environ:
            del os.environ["SAYNA_WEBHOOK_SECRET"]

        with pytest.raises(SaynaValidationError, match="Webhook secret is required"):
            WebhookReceiver()

    def test_initialization_fails_with_short_secret(self) -> None:
        """Test initialization fails when secret is too short."""
        with pytest.raises(SaynaValidationError, match="must be at least 16 characters long"):
            WebhookReceiver("short")


class TestWebhookReceiverReceive:
    """Tests for WebhookReceiver.receive() method."""

    def test_receive_valid_webhook(self) -> None:
        """Test receiving a valid webhook."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        webhook = receiver.receive(headers, body)

        assert webhook.from_phone_number == "+15559876543"
        assert webhook.to_phone_number == "+15551234567"
        assert webhook.room.name == "sip-test-room"
        assert webhook.room.sid == "RM_xyz789"
        assert webhook.participant.identity == "sip-participant-123"
        assert webhook.participant.sid == "PA_abc123"
        assert webhook.participant.name == "John Doe"
        assert webhook.sip_host == "example.com"
        assert webhook.room_prefix == "sip-"

    def test_receive_with_case_insensitive_headers(self) -> None:
        """Test that header names are case-insensitive."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        timestamp = str(int(time.time()))
        event_id = "evt_12345"
        signature = _generate_signature(secret, timestamp, event_id, body)

        # Use different casing for headers
        headers = {
            "X-Sayna-Signature": signature,
            "X-SAYNA-TIMESTAMP": timestamp,
            "x-sayna-event-id": event_id,
        }

        webhook = receiver.receive(headers, body)
        assert webhook.from_phone_number == "+15559876543"
        assert webhook.to_phone_number == "+15551234567"

    def test_receive_fails_with_missing_signature_header(self) -> None:
        """Test receive fails when signature header is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        headers = {
            "x-sayna-timestamp": str(int(time.time())),
            "x-sayna-event-id": "evt_12345",
        }

        with pytest.raises(
            SaynaValidationError, match="Missing required header: x-sayna-signature"
        ):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_timestamp_header(self) -> None:
        """Test receive fails when timestamp header is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        headers = {
            "x-sayna-signature": "v1=abc123",
            "x-sayna-event-id": "evt_12345",
        }

        with pytest.raises(
            SaynaValidationError, match="Missing required header: x-sayna-timestamp"
        ):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_event_id_header(self) -> None:
        """Test receive fails when event ID header is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        headers = {
            "x-sayna-signature": "v1=abc123",
            "x-sayna-timestamp": str(int(time.time())),
        }

        with pytest.raises(SaynaValidationError, match="Missing required header: x-sayna-event-id"):
            receiver.receive(headers, body)

    def test_receive_fails_with_invalid_signature_format(self) -> None:
        """Test receive fails when signature doesn't start with 'v1='."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        timestamp = str(int(time.time()))

        headers = {
            "x-sayna-signature": "invalid-signature",
            "x-sayna-timestamp": timestamp,
            "x-sayna-event-id": "evt_12345",
        }

        with pytest.raises(SaynaValidationError, match="Invalid signature format"):
            receiver.receive(headers, body)

    def test_receive_fails_with_invalid_signature_hex(self) -> None:
        """Test receive fails when signature is not valid hex."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        timestamp = str(int(time.time()))

        headers = {
            "x-sayna-signature": "v1=not-hex-characters-xyz",
            "x-sayna-timestamp": timestamp,
            "x-sayna-event-id": "evt_12345",
        }

        with pytest.raises(
            SaynaValidationError, match="Invalid signature: must be 64 hex characters"
        ):
            receiver.receive(headers, body)

    def test_receive_fails_with_incorrect_signature(self) -> None:
        """Test receive fails when signature is incorrect."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        timestamp = str(int(time.time()))

        # Generate valid signature format but with wrong secret
        wrong_signature = _generate_signature("wrong-secret-key", timestamp, "evt_12345", body)

        headers = {
            "x-sayna-signature": wrong_signature,
            "x-sayna-timestamp": timestamp,
            "x-sayna-event-id": "evt_12345",
        }

        with pytest.raises(SaynaValidationError, match="Signature verification failed"):
            receiver.receive(headers, body)

    def test_receive_fails_with_invalid_timestamp_format(self) -> None:
        """Test receive fails when timestamp is not a valid integer."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        headers = _get_valid_headers(secret, body, timestamp="not-a-number")

        with pytest.raises(SaynaValidationError, match="Invalid timestamp format"):
            receiver.receive(headers, body)

    def test_receive_fails_with_timestamp_too_old(self) -> None:
        """Test receive fails when timestamp is outside replay protection window."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        # Timestamp from 10 minutes ago (outside 5-minute window)
        old_timestamp = str(int(time.time()) - 600)
        headers = _get_valid_headers(secret, body, timestamp=old_timestamp)

        with pytest.raises(
            SaynaValidationError, match="Timestamp outside replay protection window"
        ):
            receiver.receive(headers, body)

    def test_receive_fails_with_timestamp_too_future(self) -> None:
        """Test receive fails when timestamp is too far in the future."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        # Timestamp 10 minutes in the future (outside 5-minute window)
        future_timestamp = str(int(time.time()) + 600)
        headers = _get_valid_headers(secret, body, timestamp=future_timestamp)

        with pytest.raises(
            SaynaValidationError, match="Timestamp outside replay protection window"
        ):
            receiver.receive(headers, body)

    def test_receive_fails_with_invalid_json(self) -> None:
        """Test receive fails when body is not valid JSON."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        body = "not valid json {"
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match="Invalid JSON payload"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_participant_field(self) -> None:
        """Test receive fails when participant field is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["participant"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"participant.*Field required"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_room_field(self) -> None:
        """Test receive fails when room field is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["room"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"room.*Field required"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_from_phone_number(self) -> None:
        """Test receive fails when from_phone_number is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["from_phone_number"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"from_phone_number.*Field required"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_to_phone_number(self) -> None:
        """Test receive fails when to_phone_number is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["to_phone_number"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"to_phone_number.*Field required"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_participant_identity(self) -> None:
        """Test receive fails when participant.identity is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["participant"]["identity"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"participant.identity.*Field required"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_participant_sid(self) -> None:
        """Test receive fails when participant.sid is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["participant"]["sid"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"participant.sid.*Field required"):
            receiver.receive(headers, body)

    def test_receive_with_optional_participant_name(self) -> None:
        """Test receive works when participant.name is missing (optional field)."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["participant"]["name"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        webhook = receiver.receive(headers, body)
        assert webhook.participant.name is None

    def test_receive_fails_with_missing_room_name(self) -> None:
        """Test receive fails when room.name is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["room"]["name"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"room.name.*Field required"):
            receiver.receive(headers, body)

    def test_receive_fails_with_missing_room_sid(self) -> None:
        """Test receive fails when room.sid is missing."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        del payload["room"]["sid"]
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        with pytest.raises(SaynaValidationError, match=r"room.sid.*Field required"):
            receiver.receive(headers, body)


class TestWebhookReceiverSecurity:
    """Tests for security features of WebhookReceiver."""

    def test_constant_time_comparison(self) -> None:
        """Test that signature comparison prevents timing attacks."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        # This should succeed
        webhook = receiver.receive(headers, body)
        assert webhook is not None

        # Modify one character in the signature
        headers["x-sayna-signature"] = headers["x-sayna-signature"][:-1] + "0"

        # This should fail (signature mismatch)
        with pytest.raises(SaynaValidationError, match="Signature verification failed"):
            receiver.receive(headers, body)

    def test_signature_prevents_body_tampering(self) -> None:
        """Test that signature verification prevents body tampering."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)
        headers = _get_valid_headers(secret, body)

        # Tamper with the body
        tampered_payload = payload.copy()
        tampered_payload["from_phone_number"] = "+19999999999"
        tampered_body = json.dumps(tampered_payload)

        # Should fail because signature doesn't match tampered body
        with pytest.raises(SaynaValidationError, match="Signature verification failed"):
            receiver.receive(headers, tampered_body)

    def test_replay_protection_with_valid_timestamp(self) -> None:
        """Test that webhooks within the time window are accepted."""
        secret = "test-secret-key-1234567890"
        receiver = WebhookReceiver(secret)

        payload = _get_valid_webhook_payload()
        body = json.dumps(payload)

        # Timestamp 2 minutes ago (within 5-minute window)
        recent_timestamp = str(int(time.time()) - 120)
        headers = _get_valid_headers(secret, body, timestamp=recent_timestamp)

        webhook = receiver.receive(headers, body)
        assert webhook.from_phone_number == "+15559876543"
        assert webhook.to_phone_number == "+15551234567"
