import { createHash, randomBytes } from "node:crypto";

/**
 * The checkout credential (ADR-001): the secret a member's browser holds, as a cookie, to close its own visit. It is a bearer
 * secret, so it is 256 random bits, it is never stored (only its SHA-256 hash is), and it must never be logged, put in a URL,
 * a QR code or an audit row. It is NOT the pass token (`visits.pass_token`), which the attendant scans and which sits in a URL.
 */

/** 32 random bytes as base64url: 43 characters. */
export function makeCredential(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashCredential(token) };
}

/** What the database stores. A credential has 256 bits of randomness, so a plain SHA-256 is enough; it cannot be guessed back. */
export function hashCredential(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A value shaped like a credential. Anything else is rejected before the database is asked. */
export function looksLikeCredential(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
