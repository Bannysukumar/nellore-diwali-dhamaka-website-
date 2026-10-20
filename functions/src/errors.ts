import { FunctionsErrorCode, HttpsError } from "firebase-functions/v2/https";

/**
 * Error contract shared with the web client.
 *
 * `callBackend` strips the `functions/` prefix from `HttpsError.code`, so the
 * codes produced here surface verbatim in the UI and drive its recovery hints.
 */

export function fail(code: FunctionsErrorCode, message: string, details?: unknown): never {
  throw new HttpsError(code, message, details);
}

type Fail = (message: string, details?: unknown) => never;

export const invalidArgument: Fail = (message, details) =>
  fail("invalid-argument", message, details);

export const failedPrecondition: Fail = (message, details) =>
  fail("failed-precondition", message, details);

export const notFound: Fail = (message) => fail("not-found", message);

export const permissionDenied: Fail = (message) => fail("permission-denied", message);

export const unauthenticated: Fail = (message) => fail("unauthenticated", message);

export const alreadyExists: Fail = (message) => fail("already-exists", message);

export const resourceExhausted: Fail = (message) => fail("resource-exhausted", message);

export const aborted: Fail = (message) => fail("aborted", message);

/**
 * Validates the request payload shape before any business logic runs. Unknown
 * extra keys are ignored; a missing or wrongly-typed key fails fast with a
 * message that is safe to show to the caller.
 */
export function requireObject<T extends object>(data: unknown): T {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    invalidArgument("The request payload is malformed.");
  }
  return data as T;
}

export function requireString(data: Record<string, unknown>, key: string, max = 500): string {
  const value = data[key];
  if (typeof value !== "string" || !value.trim()) {
    invalidArgument(`"${key}" is required.`);
  }
  if (value.length > max) invalidArgument(`"${key}" is too long.`);
  return value;
}

export function optionalString(
  data: Record<string, unknown>,
  key: string,
  max = 2000,
): string | undefined {
  const value = data[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") invalidArgument(`"${key}" must be text.`);
  if (value.length > max) invalidArgument(`"${key}" is too long.`);
  return value;
}

export function requireInteger(
  data: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): number {
  const value = data[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    invalidArgument(`"${key}" must be a whole number.`);
  }
  if (opts.min !== undefined && value < opts.min) {
    invalidArgument(`"${key}" must be at least ${opts.min}.`);
  }
  if (opts.max !== undefined && value > opts.max) {
    invalidArgument(`"${key}" must be at most ${opts.max}.`);
  }
  return value;
}

export function requireStringArray(
  data: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): string[] {
  const value = data[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    invalidArgument(`"${key}" must be a list of identifiers.`);
  }
  if (opts.min !== undefined && value.length < opts.min) {
    invalidArgument(`"${key}" must contain at least ${opts.min} item(s).`);
  }
  if (opts.max !== undefined && value.length > opts.max) {
    invalidArgument(`"${key}" must contain at most ${opts.max} item(s).`);
  }
  return value as string[];
}

/**
 * Idempotency keys arrive from the client. They become part of a document id,
 * so they are restricted to a safe subset rather than sanitised silently.
 */
export function requireRequestId(data: Record<string, unknown>, key = "requestId"): string {
  const value = requireString(data, key, 120);
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(value)) {
    invalidArgument("The request identifier is malformed.");
  }
  return value;
}
