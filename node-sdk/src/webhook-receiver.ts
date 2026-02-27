import { createHmac, timingSafeEqual } from "crypto";
import { SaynaValidationError } from "./errors";
import type { WebhookSIPOutput } from "./types";

/**
 * Minimum required secret length in characters for security.
 * @internal
 */
const MIN_SECRET_LENGTH = 16;

/**
 * Maximum allowed time difference in seconds for replay protection.
 * Webhooks with timestamps outside this window will be rejected.
 * @internal
 */
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Receives and verifies cryptographically signed webhooks from Sayna SIP service.
 *
 * This class handles the secure verification of webhook signatures using HMAC-SHA256,
 * validates timestamp freshness to prevent replay attacks, and parses the webhook
 * payload into a strongly-typed WebhookSIPOutput object.
 *
 * ## Security Features
 *
 * - **HMAC-SHA256 Signature Verification**: Ensures webhook authenticity
 * - **Constant-Time Comparison**: Prevents timing attack vulnerabilities
 * - **Replay Protection**: 5-minute timestamp window prevents replay attacks
 * - **Strict Validation**: Comprehensive checks on all required fields
 *
 * ## Usage
 *
 * ### Basic Example
 *
 * ```typescript
 * import { WebhookReceiver } from "@sayna-ai/node-sdk";
 *
 * // Initialize with secret (or uses SAYNA_WEBHOOK_SECRET env variable)
 * const receiver = new WebhookReceiver("your-secret-key-min-16-chars");
 *
 * // In your Express route handler
 * app.post('/webhook', express.json({ verify: (req, res, buf) => {
 *   req.rawBody = buf.toString('utf8');
 * }}), (req, res) => {
 *   try {
 *     const webhook = receiver.receive(req.headers, req.rawBody);
 *
 *     console.log('Valid webhook received:');
 *     console.log('  From:', webhook.from_phone_number);
 *     console.log('  To:', webhook.to_phone_number);
 *     console.log('  Room:', webhook.room.name);
 *     console.log('  SIP Host:', webhook.sip_host);
 *     console.log('  Participant:', webhook.participant.identity);
 *
 *     res.status(200).json({ received: true });
 *   } catch (error) {
 *     console.error('Webhook verification failed:', error.message);
 *     res.status(401).json({ error: 'Invalid signature' });
 *   }
 * });
 * ```
 *
 * ### With Environment Variable
 *
 * ```typescript
 * // Set environment variable
 * process.env.SAYNA_WEBHOOK_SECRET = "your-secret-key";
 *
 * // Receiver automatically uses env variable
 * const receiver = new WebhookReceiver();
 * ```
 *
 * ### Fastify Example
 *
 * ```typescript
 * import Fastify from 'fastify';
 * import { WebhookReceiver } from "@sayna-ai/node-sdk";
 *
 * const fastify = Fastify();
 * const receiver = new WebhookReceiver();
 *
 * fastify.post('/webhook', {
 *   config: {
 *     rawBody: true
 *   }
 * }, async (request, reply) => {
 *   try {
 *     const webhook = receiver.receive(
 *       request.headers,
 *       request.rawBody
 *     );
 *
 *     // Process webhook...
 *
 *     return { received: true };
 *   } catch (error) {
 *     reply.code(401);
 *     return { error: error.message };
 *   }
 * });
 * ```
 *
 * ## Important Notes
 *
 * - **Raw Body Required**: You MUST pass the raw request body string, not the parsed JSON object.
 *   The signature is computed over the exact bytes received, so any formatting changes will
 *   cause verification to fail.
 *
 * - **Case-Insensitive Headers**: Header names are case-insensitive in HTTP. This class handles
 *   both `X-Sayna-Signature` and `x-sayna-signature` correctly.
 *
 * - **Secret Security**: Never commit secrets to version control. Use environment variables
 *   or a secret management system.
 *
 * @see WebhookSIPOutput
 */
export class WebhookReceiver {
  private readonly secret: string;

  /**
   * Creates a new webhook receiver with the specified signing secret.
   *
   * @param secret - HMAC signing secret (min 16 chars, 32+ recommended).
   *                 If not provided, uses SAYNA_WEBHOOK_SECRET environment variable.
   *
   * @throws {SaynaValidationError} If secret is missing or too short
   *
   * @example
   * ```typescript
   * // Explicit secret
   * const receiver = new WebhookReceiver("my-secret-key-at-least-16-chars");
   *
   * // From environment variable
   * const receiver = new WebhookReceiver();
   * ```
   */
  constructor(secret?: string) {
    const effectiveSecret = secret ?? process.env.SAYNA_WEBHOOK_SECRET;

    if (!effectiveSecret) {
      throw new SaynaValidationError(
        "Webhook secret is required. Provide it as a constructor parameter or set SAYNA_WEBHOOK_SECRET environment variable."
      );
    }

    const trimmedSecret = effectiveSecret.trim();

    if (trimmedSecret.length < MIN_SECRET_LENGTH) {
      throw new SaynaValidationError(
        `Webhook secret must be at least ${MIN_SECRET_LENGTH} characters long. ` +
          `Received ${trimmedSecret.length} characters. ` +
          `Generate a secure secret with: openssl rand -hex 32`
      );
    }

    this.secret = trimmedSecret;
  }

  /**
   * Verifies and parses an incoming SIP webhook from Sayna.
   *
   * This method performs the following security checks:
   * 1. Validates presence of required headers
   * 2. Verifies timestamp is within acceptable window (prevents replay attacks)
   * 3. Computes HMAC-SHA256 signature over canonical string
   * 4. Performs constant-time comparison to prevent timing attacks
   * 5. Parses and validates the webhook payload structure
   *
   * @param headers - HTTP request headers (case-insensitive)
   * @param body - Raw request body as string (not parsed JSON)
   *
   * @returns Parsed and validated webhook payload
   *
   * @throws {SaynaValidationError} If signature verification fails or payload is invalid
   *
   * @example
   * ```typescript
   * const receiver = new WebhookReceiver("your-secret");
   *
   * // Express example
   * app.post('/webhook', express.json({ verify: (req, res, buf) => {
   *   req.rawBody = buf.toString();
   * }}), (req, res) => {
   *   const webhook = receiver.receive(req.headers, req.rawBody);
   *   // webhook is now a validated WebhookSIPOutput object
   * });
   * ```
   */
  receive(
    headers: Record<string, string | string[] | undefined>,
    body: string
  ): WebhookSIPOutput {
    // Normalize headers to lowercase for case-insensitive lookup
    const normalizedHeaders = this.normalizeHeaders(headers);

    // Extract required headers
    const signature = this.getRequiredHeader(
      normalizedHeaders,
      "x-sayna-signature"
    );
    const timestamp = this.getRequiredHeader(
      normalizedHeaders,
      "x-sayna-timestamp"
    );
    const eventId = this.getRequiredHeader(
      normalizedHeaders,
      "x-sayna-event-id"
    );

    // Parse and validate signature format
    if (!signature.startsWith("v1=")) {
      throw new SaynaValidationError(
        "Invalid signature format. Expected 'v1=<hex>' but got: " +
          signature.substring(0, 10) +
          "..."
      );
    }
    const signatureHex = signature.substring(3);

    // Validate signature is valid hex (64 chars for SHA256)
    if (!/^[0-9a-f]{64}$/i.test(signatureHex)) {
      throw new SaynaValidationError(
        "Invalid signature: must be 64 hex characters (HMAC-SHA256)"
      );
    }

    // Validate and check timestamp
    this.validateTimestamp(timestamp);

    // Build canonical string for signature verification
    const canonical = `v1:${timestamp}:${eventId}:${body}`;

    // Compute expected signature
    const hmac = createHmac("sha256", this.secret);
    hmac.update(canonical, "utf8");
    const expectedSignature = hmac.digest("hex");

    // Constant-time comparison to prevent timing attacks
    if (!this.constantTimeEqual(signatureHex, expectedSignature)) {
      throw new SaynaValidationError(
        "Signature verification failed. The webhook may have been tampered with or the secret is incorrect."
      );
    }

    // Parse and validate the webhook payload
    return this.parseAndValidatePayload(body);
  }

  /**
   * Normalizes HTTP headers to lowercase for case-insensitive access.
   * Handles both single string values and arrays of strings.
   *
   * @internal
   */
  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        // Handle array values (take first element)
        const stringValue = Array.isArray(value) ? value[0] : value;
        if (stringValue) {
          normalized[key.toLowerCase()] = stringValue;
        }
      }
    }

    return normalized;
  }

  /**
   * Retrieves a required header value or throws a validation error.
   *
   * @internal
   */
  private getRequiredHeader(
    headers: Record<string, string>,
    name: string
  ): string {
    const value = headers[name.toLowerCase()];

    if (!value) {
      throw new SaynaValidationError(`Missing required header: ${name}`);
    }

    return value;
  }

  /**
   * Validates the timestamp is within the acceptable window.
   *
   * @internal
   */
  private validateTimestamp(timestampStr: string): void {
    // Parse timestamp
    const timestamp = Number(timestampStr);

    if (isNaN(timestamp)) {
      throw new SaynaValidationError(
        `Invalid timestamp format: expected Unix seconds but got '${timestampStr}'`
      );
    }

    // Check if timestamp is within acceptable range
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - timestamp);

    if (diff > TIMESTAMP_TOLERANCE_SECONDS) {
      throw new SaynaValidationError(
        `Timestamp outside replay protection window. ` +
          `Difference: ${diff} seconds (max allowed: ${TIMESTAMP_TOLERANCE_SECONDS}). ` +
          `This webhook may be a replay attack or there may be significant clock skew.`
      );
    }
  }

  /**
   * Performs constant-time string comparison to prevent timing attacks.
   *
   * @internal
   */
  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");

    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Parses and validates the webhook payload structure.
   *
   * @internal
   */
  private parseAndValidatePayload(body: string): WebhookSIPOutput {
    let payload: unknown;

    // Parse JSON
    try {
      payload = JSON.parse(body);
    } catch (error) {
      throw new SaynaValidationError(
        `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Validate payload is an object
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new SaynaValidationError("Webhook payload must be a JSON object");
    }

    const data = payload as Record<string, unknown>;

    // Validate required fields
    this.validateParticipant(data.participant);
    this.validateRoom(data.room);
    this.validateStringField(data, "from_phone_number", "from_phone_number");
    this.validateStringField(data, "to_phone_number", "to_phone_number");
    this.validateStringField(data, "room_prefix", "room_prefix");
    this.validateStringField(data, "sip_host", "sip_host");

    // sip_headers is optional, but if present must be a plain object with string values
    if (data.sip_headers !== undefined) {
      if (
        !data.sip_headers ||
        typeof data.sip_headers !== "object" ||
        Array.isArray(data.sip_headers)
      ) {
        throw new SaynaValidationError(
          "Field 'sip_headers' must be a plain object if present"
        );
      }
      const headers = data.sip_headers as Record<string, unknown>;
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value !== "string") {
          throw new SaynaValidationError(
            `Field 'sip_headers.${key}' must be a string`
          );
        }
      }
    }

    // TypeScript type assertion is safe here because we've validated all fields
    // We use double assertion through unknown to satisfy strict type checking
    return data as unknown as WebhookSIPOutput;
  }

  /**
   * Validates the participant object structure.
   *
   * @internal
   */
  private validateParticipant(participant: unknown): void {
    if (
      !participant ||
      typeof participant !== "object" ||
      Array.isArray(participant)
    ) {
      throw new SaynaValidationError(
        "Webhook payload missing required field 'participant' (must be an object)"
      );
    }

    const p = participant as Record<string, unknown>;

    this.validateStringField(p, "identity", "participant.identity");
    this.validateStringField(p, "sid", "participant.sid");

    // name is optional, but if present must be a string
    if (p.name !== undefined && typeof p.name !== "string") {
      throw new SaynaValidationError(
        "Field 'participant.name' must be a string if present"
      );
    }
  }

  /**
   * Validates the room object structure.
   *
   * @internal
   */
  private validateRoom(room: unknown): void {
    if (!room || typeof room !== "object" || Array.isArray(room)) {
      throw new SaynaValidationError(
        "Webhook payload missing required field 'room' (must be an object)"
      );
    }

    const r = room as Record<string, unknown>;

    this.validateStringField(r, "name", "room.name");
    this.validateStringField(r, "sid", "room.sid");
  }

  /**
   * Validates a required string field.
   *
   * @internal
   */
  private validateStringField(
    obj: Record<string, unknown>,
    field: string,
    displayName: string
  ): void {
    const value = obj[field];

    if (typeof value !== "string" || value.length === 0) {
      throw new SaynaValidationError(
        `Webhook payload missing required field '${displayName}' (must be a non-empty string)`
      );
    }
  }
}
