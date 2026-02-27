import { describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import { WebhookReceiver } from "../src/webhook-receiver";
import { SaynaValidationError } from "../src/errors";
import type { WebhookSIPOutput } from "../src/types";

function generateSignature(
  secret: string,
  timestamp: string,
  eventId: string,
  body: string
): string {
  const canonical = `v1:${timestamp}:${eventId}:${body}`;
  const signature = createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("hex");
  return `v1=${signature}`;
}

function getValidWebhookPayload(): WebhookSIPOutput {
  return {
    participant: {
      identity: "sip-participant-123",
      sid: "PA_abc123",
      name: "John Doe",
    },
    room: {
      name: "sip-test-room",
      sid: "RM_xyz789",
    },
    from_phone_number: "+15559876543",
    to_phone_number: "+15551234567",
    room_prefix: "sip-",
    sip_host: "example.com",
    sip_headers: { "X-Custom-Header": "value", "User-Agent": "SIPClient/1.0" },
  };
}

function getValidHeaders(
  secret: string,
  body: string,
  timestamp?: string
): Record<string, string> {
  timestamp ??= Math.floor(Date.now() / 1000).toString();

  const eventId = "evt_12345";
  const signature = generateSignature(secret, timestamp, eventId, body);

  return {
    "x-sayna-signature": signature,
    "x-sayna-timestamp": timestamp,
    "x-sayna-event-id": eventId,
  };
}

describe("WebhookReceiver Initialization", () => {
  test("should initialize with explicit secret", () => {
    const receiver = new WebhookReceiver("my-secret-key-1234567890");
    expect(receiver).toBeDefined();
  });

  test("should initialize with env variable", () => {
    process.env.SAYNA_WEBHOOK_SECRET = "env-secret-key-1234567890";
    const receiver = new WebhookReceiver();
    expect(receiver).toBeDefined();
    delete process.env.SAYNA_WEBHOOK_SECRET;
  });

  test("should trim secret whitespace", () => {
    const receiver = new WebhookReceiver("  my-secret-key-1234567890  ");
    expect(receiver).toBeDefined();
  });

  test("should fail without secret", () => {
    delete process.env.SAYNA_WEBHOOK_SECRET;

    expect(() => {
      new WebhookReceiver();
    }).toThrow(SaynaValidationError);

    expect(() => {
      new WebhookReceiver();
    }).toThrow("Webhook secret is required");
  });

  test("should fail with short secret", () => {
    expect(() => {
      new WebhookReceiver("short");
    }).toThrow(SaynaValidationError);

    expect(() => {
      new WebhookReceiver("short");
    }).toThrow("must be at least 16 characters long");
  });
});

describe("WebhookReceiver.receive()", () => {
  const secret = "test-secret-key-1234567890";

  test("should receive valid webhook", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    const webhook = receiver.receive(headers, body);

    expect(webhook.from_phone_number).toBe("+15559876543");
    expect(webhook.to_phone_number).toBe("+15551234567");
    expect(webhook.room.name).toBe("sip-test-room");
    expect(webhook.room.sid).toBe("RM_xyz789");
    expect(webhook.participant.identity).toBe("sip-participant-123");
    expect(webhook.participant.sid).toBe("PA_abc123");
    expect(webhook.participant.name).toBe("John Doe");
    expect(webhook.sip_host).toBe("example.com");
    expect(webhook.room_prefix).toBe("sip-");
    expect(webhook.sip_headers).toEqual({
      "X-Custom-Header": "value",
      "User-Agent": "SIPClient/1.0",
    });
  });

  test("should work without optional sip_headers", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload as any).sip_headers;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    const webhook = receiver.receive(headers, body);
    expect(webhook.sip_headers).toBeUndefined();
  });

  test("should work with empty sip_headers object", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    payload.sip_headers = {};
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    const webhook = receiver.receive(headers, body);
    expect(webhook.sip_headers).toEqual({});
  });

  test("should fail with invalid sip_headers type", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    (payload as any).sip_headers = "not-an-object";
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Field 'sip_headers' must be a plain object if present");
  });

  test("should fail with array sip_headers", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    (payload as any).sip_headers = ["not", "an", "object"];
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Field 'sip_headers' must be a plain object if present");
  });

  test("should handle case-insensitive headers", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const eventId = "evt_12345";
    const signature = generateSignature(secret, timestamp, eventId, body);

    const headers = {
      "X-Sayna-Signature": signature,
      "X-SAYNA-TIMESTAMP": timestamp,
      "x-sayna-event-id": eventId,
    };

    const webhook = receiver.receive(headers, body);
    expect(webhook.from_phone_number).toBe("+15559876543");
    expect(webhook.to_phone_number).toBe("+15551234567");
  });

  test("should fail with missing signature header", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    const headers = {
      "x-sayna-timestamp": Math.floor(Date.now() / 1000).toString(),
      "x-sayna-event-id": "evt_12345",
    };

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Missing required header: x-sayna-signature");
  });

  test("should fail with missing timestamp header", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    const headers = {
      "x-sayna-signature": "v1=abc123",
      "x-sayna-event-id": "evt_12345",
    };

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Missing required header: x-sayna-timestamp");
  });

  test("should fail with missing event-id header", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    const headers = {
      "x-sayna-signature": "v1=abc123",
      "x-sayna-timestamp": Math.floor(Date.now() / 1000).toString(),
    };

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Missing required header: x-sayna-event-id");
  });

  test("should fail with invalid signature format", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const headers = {
      "x-sayna-signature": "invalid-signature",
      "x-sayna-timestamp": timestamp,
      "x-sayna-event-id": "evt_12345",
    };

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Invalid signature format");
  });

  test("should fail with invalid signature hex", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const headers = {
      "x-sayna-signature": "v1=not-hex-characters-xyz",
      "x-sayna-timestamp": timestamp,
      "x-sayna-event-id": "evt_12345",
    };

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Invalid signature: must be 64 hex characters");
  });

  test("should fail with incorrect signature", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Generate signature with wrong secret
    const wrongSignature = generateSignature(
      "wrong-secret-key",
      timestamp,
      "evt_12345",
      body
    );

    const headers = {
      "x-sayna-signature": wrongSignature,
      "x-sayna-timestamp": timestamp,
      "x-sayna-event-id": "evt_12345",
    };

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Signature verification failed");
  });

  test("should fail with invalid timestamp format", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    const headers = getValidHeaders(secret, body, "not-a-number");

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Invalid timestamp format");
  });

  test("should fail with timestamp too old", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    // Timestamp from 10 minutes ago (outside 5-minute window)
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const headers = getValidHeaders(secret, body, oldTimestamp);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Timestamp outside replay protection window");
  });

  test("should fail with timestamp too far in future", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    // Timestamp 10 minutes in the future (outside 5-minute window)
    const futureTimestamp = (Math.floor(Date.now() / 1000) + 600).toString();
    const headers = getValidHeaders(secret, body, futureTimestamp);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Timestamp outside replay protection window");
  });

  test("should fail with invalid JSON", () => {
    const receiver = new WebhookReceiver(secret);

    const body = "not valid json {";
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("Invalid JSON payload");
  });

  test("should fail with missing participant field", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload as any).participant;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'participant'");
  });

  test("should fail with missing room field", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload as any).room;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'room'");
  });

  test("should fail with missing from_phone_number", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload as any).from_phone_number;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'from_phone_number'");
  });

  test("should fail with missing to_phone_number", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload as any).to_phone_number;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'to_phone_number'");
  });

  test("should fail with missing participant.identity", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload.participant as any).identity;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'participant.identity'");
  });

  test("should fail with missing participant.sid", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload.participant as any).sid;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'participant.sid'");
  });

  test("should work without optional participant.name", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload.participant as any).name;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    const webhook = receiver.receive(headers, body);
    expect(webhook.participant.name).toBeUndefined();
  });

  test("should fail with missing room.name", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload.room as any).name;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'room.name'");
  });

  test("should fail with missing room.sid", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    delete (payload.room as any).sid;
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    expect(() => {
      receiver.receive(headers, body);
    }).toThrow("missing required field 'room.sid'");
  });
});

describe("WebhookReceiver Security", () => {
  const secret = "test-secret-key-1234567890";

  test("should use constant-time comparison", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    // This should succeed
    const webhook = receiver.receive(headers, body);
    expect(webhook).toBeDefined();

    // Create a new signature with one character modified
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const eventId = "evt_12345";
    const correctSignature = generateSignature(
      secret,
      timestamp,
      eventId,
      body
    );

    // Modify one character in the signature (replace last char)
    const lastChar = correctSignature[correctSignature.length - 1];
    const newChar = lastChar === "0" ? "1" : "0";
    const incorrectSignature = correctSignature.slice(0, -1) + newChar;

    const modifiedHeaders = {
      "x-sayna-signature": incorrectSignature,
      "x-sayna-timestamp": timestamp,
      "x-sayna-event-id": eventId,
    };

    // This should fail
    expect(() => {
      receiver.receive(modifiedHeaders, body);
    }).toThrow("Signature verification failed");
  });

  test("should prevent body tampering", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);
    const headers = getValidHeaders(secret, body);

    // Tamper with the body
    const tamperedPayload = { ...payload };
    tamperedPayload.from_phone_number = "+19999999999";
    const tamperedBody = JSON.stringify(tamperedPayload);

    // Should fail because signature doesn't match tampered body
    expect(() => {
      receiver.receive(headers, tamperedBody);
    }).toThrow("Signature verification failed");
  });

  test("should accept webhooks within time window", () => {
    const receiver = new WebhookReceiver(secret);

    const payload = getValidWebhookPayload();
    const body = JSON.stringify(payload);

    // Timestamp 2 minutes ago (within 5-minute window)
    const recentTimestamp = (Math.floor(Date.now() / 1000) - 120).toString();
    const headers = getValidHeaders(secret, body, recentTimestamp);

    const webhook = receiver.receive(headers, body);
    expect(webhook.from_phone_number).toBe("+15559876543");
    expect(webhook.to_phone_number).toBe("+15551234567");
  });
});
