import { signValue, verifyValue } from "./session";

/** Staff sessions last 12 hours (decision D-03, threat T-5). */
export const STAFF_SESSION_SECONDS = 12 * 60 * 60;

/** A signed, expiring staff session value. It holds only an id, never personal data. */
export function makeStaffToken(staffId: string, secret: string, now = Date.now()): string {
  const payload = JSON.stringify({ sid: staffId, exp: now + STAFF_SESSION_SECONDS * 1000 });
  return signValue(Buffer.from(payload).toString("base64url"), secret);
}

/** The staff id if the token is genuine and not expired, otherwise null. */
export function readStaffToken(token: string, secret: string, now = Date.now()): string | null {
  const body = verifyValue(token, secret);
  if (!body) return null;
  try {
    const { sid, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      sid?: unknown;
      exp?: unknown;
    };
    if (typeof sid !== "string" || typeof exp !== "number" || exp <= now) return null;
    return sid;
  } catch {
    return null;
  }
}
