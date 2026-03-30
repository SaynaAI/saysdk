import { readFile } from "node:fs/promises";
import type { GoogleAuth, ProviderAuth } from "./types";
import { SaynaValidationError } from "./errors";

function isGoogleAuth(auth: ProviderAuth): auth is GoogleAuth {
  return "credentials" in auth;
}

/**
 * Resolves Google credentials from a string to a parsed object.
 *
 * If the value is already an object it is returned as-is.
 * If it is a string, the function first tries `JSON.parse`.
 * When parsing fails, the string is treated as a file path
 * and the file is read and parsed.
 *
 * @throws {SaynaValidationError} When the string is neither valid JSON nor a readable JSON file.
 */
export async function resolveGoogleCredentials(
  credentials: string | Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (typeof credentials !== "string") {
    return credentials;
  }

  // Try parsing as inline JSON string
  try {
    const parsed: unknown = JSON.parse(credentials);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    throw new SaynaValidationError(
      `GoogleAuth credentials JSON string must parse to an object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`
    );
  } catch (error) {
    if (error instanceof SaynaValidationError) {
      throw error;
    }
    // Not valid JSON — fall through to file path handling
  }

  // Treat as file path
  let content: string;
  try {
    content = await readFile(credentials, "utf-8");
  } catch (_error) {
    throw new SaynaValidationError(
      `GoogleAuth credentials string is not valid JSON and could not be read as a file: ${credentials}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new SaynaValidationError(
      `GoogleAuth credentials file does not contain valid JSON: ${credentials}`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SaynaValidationError(
      `GoogleAuth credentials file must contain a JSON object: ${credentials}`
    );
  }

  return parsed as Record<string, unknown>;
}

/**
 * Resolves provider auth credentials.
 *
 * For {@link GoogleAuth} with string credentials the value is resolved
 * via {@link resolveGoogleCredentials}. All other auth types pass through unchanged.
 */
export async function resolveProviderAuth(
  auth: ProviderAuth
): Promise<ProviderAuth> {
  if (!isGoogleAuth(auth) || typeof auth.credentials !== "string") {
    return auth;
  }
  return {
    credentials: await resolveGoogleCredentials(auth.credentials),
  };
}

/**
 * Resolves provider auth inside an STT or TTS config object.
 *
 * Returns the original config when no resolution is needed,
 * or a shallow copy with the resolved auth otherwise.
 * Accepts `undefined` for convenience and returns it unchanged.
 */
export async function resolveConfigAuth<
  T extends { auth?: ProviderAuth },
>(config: T | undefined): Promise<T | undefined> {
  if (!config?.auth) {
    return config;
  }
  const resolved = await resolveProviderAuth(config.auth);
  if (resolved === config.auth) {
    return config;
  }
  return { ...config, auth: resolved };
}
