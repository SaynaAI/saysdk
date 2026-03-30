/* eslint-disable @typescript-eslint/await-thenable */
// Note: ESLint incorrectly flags await expect().rejects.toThrow() as awaiting non-thenable,
// but this is the correct pattern for testing async function rejections in Bun/Jest.
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveGoogleCredentials,
  resolveProviderAuth,
  resolveConfigAuth,
} from "../src/credentials";
import type {
  ApiKeyAuth,
  AzureAuth,
  GoogleAuth,
  STTConfig,
  TTSConfig,
} from "../src/types";
import { SaynaValidationError } from "../src/errors";

const SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "my-project",
  private_key_id: "key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
  client_email: "sa@my-project.iam.gserviceaccount.com",
  client_id: "123456789",
};

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "creds-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// resolveGoogleCredentials
// ---------------------------------------------------------------------------
describe("resolveGoogleCredentials", () => {
  test("returns object credentials as-is", async () => {
    const result = await resolveGoogleCredentials(SERVICE_ACCOUNT);
    expect(result).toBe(SERVICE_ACCOUNT);
  });

  test("parses a valid JSON string to an object", async () => {
    const json = JSON.stringify(SERVICE_ACCOUNT);
    const result = await resolveGoogleCredentials(json);
    expect(result).toEqual(SERVICE_ACCOUNT);
  });

  test("throws when JSON string parses to an array", async () => {
    await expect(resolveGoogleCredentials("[1,2,3]")).rejects.toThrow(
      SaynaValidationError
    );
    await expect(resolveGoogleCredentials("[1,2,3]")).rejects.toThrow(
      "must parse to an object"
    );
  });

  test("throws when JSON string parses to a number", async () => {
    await expect(resolveGoogleCredentials("42")).rejects.toThrow(
      SaynaValidationError
    );
  });

  test("throws when JSON string parses to a string", async () => {
    await expect(resolveGoogleCredentials('"hello"')).rejects.toThrow(
      SaynaValidationError
    );
  });

  test("throws when JSON string parses to null", async () => {
    await expect(resolveGoogleCredentials("null")).rejects.toThrow(
      SaynaValidationError
    );
  });

  test("reads and parses a valid JSON file", async () => {
    const filePath = join(tempDir, "valid.json");
    await writeFile(filePath, JSON.stringify(SERVICE_ACCOUNT));
    const result = await resolveGoogleCredentials(filePath);
    expect(result).toEqual(SERVICE_ACCOUNT);
  });

  test("throws for a nonexistent file path", async () => {
    await expect(
      resolveGoogleCredentials("/no/such/file.json")
    ).rejects.toThrow(SaynaValidationError);
    await expect(
      resolveGoogleCredentials("/no/such/file.json")
    ).rejects.toThrow("could not be read as a file");
  });

  test("throws when file contains invalid JSON", async () => {
    const filePath = join(tempDir, "bad.json");
    await writeFile(filePath, "not json {{");
    await expect(resolveGoogleCredentials(filePath)).rejects.toThrow(
      SaynaValidationError
    );
    await expect(resolveGoogleCredentials(filePath)).rejects.toThrow(
      "does not contain valid JSON"
    );
  });

  test("throws when file contains a JSON array", async () => {
    const filePath = join(tempDir, "array.json");
    await writeFile(filePath, "[1,2,3]");
    await expect(resolveGoogleCredentials(filePath)).rejects.toThrow(
      SaynaValidationError
    );
    await expect(resolveGoogleCredentials(filePath)).rejects.toThrow(
      "must contain a JSON object"
    );
  });
});

// ---------------------------------------------------------------------------
// resolveProviderAuth
// ---------------------------------------------------------------------------
describe("resolveProviderAuth", () => {
  test("returns ApiKeyAuth unchanged", async () => {
    const auth: ApiKeyAuth = { api_key: "test" };
    const result = await resolveProviderAuth(auth);
    expect(result).toBe(auth);
  });

  test("returns AzureAuth unchanged", async () => {
    const auth: AzureAuth = { api_key: "key", region: "eastus" };
    const result = await resolveProviderAuth(auth);
    expect(result).toBe(auth);
  });

  test("returns GoogleAuth with object credentials unchanged", async () => {
    const auth: GoogleAuth = { credentials: SERVICE_ACCOUNT };
    const result = await resolveProviderAuth(auth);
    expect(result).toBe(auth);
  });

  test("resolves GoogleAuth with JSON string credentials", async () => {
    const auth: GoogleAuth = {
      credentials: JSON.stringify(SERVICE_ACCOUNT),
    };
    const result = await resolveProviderAuth(auth);
    expect(result).toEqual({ credentials: SERVICE_ACCOUNT });
  });

  test("resolves GoogleAuth with file path credentials", async () => {
    const filePath = join(tempDir, "provider-auth.json");
    await writeFile(filePath, JSON.stringify(SERVICE_ACCOUNT));
    const auth: GoogleAuth = { credentials: filePath };
    const result = await resolveProviderAuth(auth);
    expect(result).toEqual({ credentials: SERVICE_ACCOUNT });
  });
});

// ---------------------------------------------------------------------------
// resolveConfigAuth
// ---------------------------------------------------------------------------
describe("resolveConfigAuth", () => {
  test("returns undefined for undefined config", async () => {
    const result = await resolveConfigAuth(undefined);
    expect(result).toBeUndefined();
  });

  test("returns config unchanged when auth is absent", async () => {
    const config: STTConfig = {
      provider: "deepgram",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "nova-3",
    };
    const result = await resolveConfigAuth(config);
    expect(result).toBe(config);
  });

  test("returns config unchanged when auth is ApiKeyAuth", async () => {
    const config: STTConfig = {
      provider: "deepgram",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "nova-3",
      auth: { api_key: "test" },
    };
    const result = await resolveConfigAuth(config);
    expect(result).toBe(config);
  });

  test("resolves STTConfig with GoogleAuth string credentials", async () => {
    const config: STTConfig = {
      provider: "google",
      language: "en-US",
      sample_rate: 16000,
      channels: 1,
      punctuation: true,
      encoding: "linear16",
      model: "latest_long",
      auth: { credentials: JSON.stringify(SERVICE_ACCOUNT) },
    };
    const result = await resolveConfigAuth(config);
    expect(result).not.toBe(config);
    expect(result!.auth).toEqual({ credentials: SERVICE_ACCOUNT });
    expect(result!.provider).toBe("google");
    expect(result!.model).toBe("latest_long");
  });

  test("resolves TTSConfig with GoogleAuth file credentials", async () => {
    const filePath = join(tempDir, "tts-config.json");
    await writeFile(filePath, JSON.stringify(SERVICE_ACCOUNT));
    const config: TTSConfig = {
      provider: "google",
      model: "en-US-Wavenet-D",
      auth: { credentials: filePath },
    };
    const result = await resolveConfigAuth(config);
    expect(result).not.toBe(config);
    expect(result!.auth).toEqual({ credentials: SERVICE_ACCOUNT });
    expect(result!.provider).toBe("google");
  });

  test("returns TTSConfig unchanged when GoogleAuth has object credentials", async () => {
    const config: TTSConfig = {
      provider: "google",
      model: "en-US-Wavenet-D",
      auth: { credentials: SERVICE_ACCOUNT },
    };
    const result = await resolveConfigAuth(config);
    expect(result).toBe(config);
  });
});
