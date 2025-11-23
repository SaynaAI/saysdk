"""Webhook receiver for verifying and parsing Sayna SIP webhooks."""

import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional, Union

from pydantic import ValidationError

from sayna_client.errors import SaynaValidationError
from sayna_client.types import WebhookSIPOutput


#: Minimum required secret length in characters for security.
MIN_SECRET_LENGTH = 16

#: Maximum allowed time difference in seconds for replay protection.
#: Webhooks with timestamps outside this window will be rejected.
TIMESTAMP_TOLERANCE_SECONDS = 300  # 5 minutes

#: Expected length of HMAC-SHA256 signature in hex format
_SIGNATURE_HEX_LENGTH = 64


class WebhookReceiver:
    """Receives and verifies cryptographically signed webhooks from Sayna SIP service.

    This class handles the secure verification of webhook signatures using HMAC-SHA256,
    validates timestamp freshness to prevent replay attacks, and parses the webhook
    payload into a strongly-typed WebhookSIPOutput object.

    Security Features:
        - **HMAC-SHA256 Signature Verification**: Ensures webhook authenticity
        - **Constant-Time Comparison**: Prevents timing attack vulnerabilities
        - **Replay Protection**: 5-minute timestamp window prevents replay attacks
        - **Strict Validation**: Comprehensive checks on all required fields

    Examples:
        Basic usage with Flask::

            from flask import Flask, request, jsonify
            from sayna_client import WebhookReceiver

            app = Flask(__name__)
            receiver = WebhookReceiver("your-secret-key-min-16-chars")


            @app.route("/webhook", methods=["POST"])
            def webhook():
                try:
                    # Get raw body (CRITICAL: exact bytes as received)
                    body = request.get_data(as_text=True)

                    webhook = receiver.receive(request.headers, body)

                    print(f"Valid webhook received:")
                    print(f"  From: {webhook.from_phone_number}")
                    print(f"  To: {webhook.to_phone_number}")
                    print(f"  Room: {webhook.room.name}")
                    print(f"  SIP Host: {webhook.sip_host}")
                    print(f"  Participant: {webhook.participant.identity}")

                    return jsonify({"received": True}), 200
                except SaynaValidationError as error:
                    print(f"Webhook verification failed: {error}")
                    return jsonify({"error": "Invalid signature"}), 401

        Using environment variable::

            import os
            from sayna_client import WebhookReceiver

            # Set environment variable
            os.environ["SAYNA_WEBHOOK_SECRET"] = "your-secret-key"

            # Receiver automatically uses env variable
            receiver = WebhookReceiver()

        FastAPI example::

            from fastapi import FastAPI, Request, HTTPException
            from sayna_client import WebhookReceiver

            app = FastAPI()
            receiver = WebhookReceiver()


            @app.post("/webhook")
            async def webhook(request: Request):
                try:
                    # Get raw body
                    body = await request.body()
                    body_str = body.decode("utf-8")

                    webhook = receiver.receive(dict(request.headers), body_str)

                    # Process webhook...

                    return {"received": True}
                except SaynaValidationError as error:
                    raise HTTPException(status_code=401, detail=str(error))

    Important Notes:
        - **Raw Body Required**: You MUST pass the raw request body string, not the parsed
          JSON object. The signature is computed over the exact bytes received, so any
          formatting changes will cause verification to fail.

        - **Case-Insensitive Headers**: Header names are case-insensitive in HTTP. This
          class handles both ``X-Sayna-Signature`` and ``x-sayna-signature`` correctly.

        - **Secret Security**: Never commit secrets to version control. Use environment
          variables or a secret management system.

    See Also:
        WebhookSIPOutput: The validated webhook payload structure
    """

    def __init__(self, secret: Optional[str] = None) -> None:
        """Initialize a new webhook receiver with the specified signing secret.

        Args:
            secret: HMAC signing secret (min 16 chars, 32+ recommended).
                If not provided, uses SAYNA_WEBHOOK_SECRET environment variable.

        Raises:
            SaynaValidationError: If secret is missing or too short.

        Examples:
            With explicit secret::

                receiver = WebhookReceiver("my-secret-key-at-least-16-chars")

            From environment variable::

                receiver = WebhookReceiver()
        """
        effective_secret = secret or os.environ.get("SAYNA_WEBHOOK_SECRET")

        if not effective_secret:
            msg = (
                "Webhook secret is required. Provide it as a constructor parameter "
                "or set SAYNA_WEBHOOK_SECRET environment variable."
            )
            raise SaynaValidationError(msg)

        trimmed_secret = effective_secret.strip()

        if len(trimmed_secret) < MIN_SECRET_LENGTH:
            msg = (
                f"Webhook secret must be at least {MIN_SECRET_LENGTH} characters long. "
                f"Received {len(trimmed_secret)} characters. "
                f"Generate a secure secret with: openssl rand -hex 32"
            )
            raise SaynaValidationError(msg)

        self._secret = trimmed_secret

    def receive(self, headers: dict[str, Union[str, Any]], body: str) -> WebhookSIPOutput:
        """Verify and parse an incoming SIP webhook from Sayna.

        This method performs the following security checks:

        1. Validates presence of required headers
        2. Verifies timestamp is within acceptable window (prevents replay attacks)
        3. Computes HMAC-SHA256 signature over canonical string
        4. Performs constant-time comparison to prevent timing attacks
        5. Parses and validates the webhook payload structure

        Args:
            headers: HTTP request headers (case-insensitive dict or dict-like object)
            body: Raw request body as string (not parsed JSON)

        Returns:
            Parsed and validated webhook payload.

        Raises:
            SaynaValidationError: If signature verification fails or payload is invalid.

        Examples:
            Flask example::

                @app.route("/webhook", methods=["POST"])
                def webhook():
                    body = request.get_data(as_text=True)
                    webhook = receiver.receive(request.headers, body)
                    # webhook is now a validated WebhookSIPOutput object
                    return jsonify({"received": True})

            Django example::

                from django.http import JsonResponse
                from django.views.decorators.csrf import csrf_exempt


                @csrf_exempt
                def webhook(request):
                    body = request.body.decode("utf-8")
                    webhook_data = receiver.receive(request.headers, body)
                    return JsonResponse({"received": True})
        """
        # Normalize headers to lowercase for case-insensitive lookup
        normalized_headers = self._normalize_headers(headers)

        # Extract required headers
        signature = self._get_required_header(normalized_headers, "x-sayna-signature")
        timestamp = self._get_required_header(normalized_headers, "x-sayna-timestamp")
        event_id = self._get_required_header(normalized_headers, "x-sayna-event-id")

        # Parse and validate signature format
        if not signature.startswith("v1="):
            msg = f"Invalid signature format. Expected 'v1=<hex>' but got: {signature[:10]}..."
            raise SaynaValidationError(msg)
        signature_hex = signature[3:]

        # Validate signature is valid hex (64 chars for SHA256)
        if len(signature_hex) != _SIGNATURE_HEX_LENGTH or not all(
            c in "0123456789abcdefABCDEF" for c in signature_hex
        ):
            msg = f"Invalid signature: must be {_SIGNATURE_HEX_LENGTH} hex characters (HMAC-SHA256)"
            raise SaynaValidationError(msg)

        # Validate and check timestamp
        self._validate_timestamp(timestamp)

        # Build canonical string for signature verification
        canonical = f"v1:{timestamp}:{event_id}:{body}"

        # Compute expected signature
        expected_signature = hmac.new(
            self._secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        # Constant-time comparison to prevent timing attacks
        if not hmac.compare_digest(signature_hex.lower(), expected_signature):
            msg = (
                "Signature verification failed. The webhook may have been tampered "
                "with or the secret is incorrect."
            )
            raise SaynaValidationError(msg)

        # Parse and validate the webhook payload using Pydantic
        return self._parse_and_validate_payload(body)

    def _normalize_headers(self, headers: dict[str, Any]) -> dict[str, str]:
        """Normalize HTTP headers to lowercase for case-insensitive access.

        Args:
            headers: Original headers dict (may contain non-string values)

        Returns:
            Normalized headers dict with lowercase keys and string values
        """
        normalized: dict[str, str] = {}

        for key, value in headers.items():
            # Convert key to lowercase and value to string
            if value is not None:
                normalized[key.lower()] = str(value)

        return normalized

    def _get_required_header(self, headers: dict[str, str], name: str) -> str:
        """Retrieve a required header value or raise a validation error.

        Args:
            headers: Normalized headers dict
            name: Header name (lowercase)

        Returns:
            Header value

        Raises:
            SaynaValidationError: If header is missing
        """
        value = headers.get(name.lower())

        if not value:
            msg = f"Missing required header: {name}"
            raise SaynaValidationError(msg)

        return value

    def _validate_timestamp(self, timestamp_str: str) -> None:
        """Validate the timestamp is within the acceptable window.

        Args:
            timestamp_str: Timestamp as string (Unix seconds)

        Raises:
            SaynaValidationError: If timestamp is invalid or outside window
        """
        # Parse timestamp
        try:
            timestamp = int(timestamp_str)
        except ValueError as e:
            msg = f"Invalid timestamp format: expected Unix seconds but got '{timestamp_str}'"
            raise SaynaValidationError(msg) from e

        # Check if timestamp is within acceptable range
        now = int(time.time())
        diff = abs(now - timestamp)

        if diff > TIMESTAMP_TOLERANCE_SECONDS:
            msg = (
                f"Timestamp outside replay protection window. "
                f"Difference: {diff} seconds (max allowed: {TIMESTAMP_TOLERANCE_SECONDS}). "
                f"This webhook may be a replay attack or there may be significant clock skew."
            )
            raise SaynaValidationError(msg)

    def _parse_and_validate_payload(self, body: str) -> WebhookSIPOutput:
        """Parse and validate the webhook payload structure using Pydantic.

        Args:
            body: Raw JSON body string

        Returns:
            Validated WebhookSIPOutput object

        Raises:
            SaynaValidationError: If JSON is invalid or validation fails
        """
        # Parse JSON
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as error:
            msg = f"Invalid JSON payload: {error}"
            raise SaynaValidationError(msg) from error

        # Validate using Pydantic model
        try:
            return WebhookSIPOutput(**payload)
        except ValidationError as error:
            # Extract first error message for clearer feedback
            errors = error.errors()
            if errors:
                first_error = errors[0]
                field = ".".join(str(loc) for loc in first_error["loc"])
                msg = first_error["msg"]
                msg = f"Webhook payload validation failed: {field}: {msg}"
                raise SaynaValidationError(msg) from error
            msg = f"Webhook payload validation failed: {error}"
            raise SaynaValidationError(msg) from error
