import { signValue, verifyValue } from "./session";

/** Member sessions last 180 days (decision D-03). */
export const MEMBER_SESSION_SECONDS = 180 * 24 * 60 * 60;

/** Signed and expiring. The kind marker stops a member token working as a staff token. */
export function makeMemberToken(memberId: string, secret: string, now = Date.now()): string {
  const payload = JSON.stringify({ k: "member", sid: memberId, exp: now + MEMBER_SESSION_SECONDS * 1000 });
  return signValue(Buffer.from(payload).toString("base64url"), secret);
}

export function readMemberToken(token: string, secret: string, now = Date.now()): string | null {
  const body = verifyValue(token, secret);
  if (!body) return null;
  try {
    const { k, sid, exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      k?: unknown;
      sid?: unknown;
      exp?: unknown;
    };
    if (k !== "member" || typeof sid !== "string" || typeof exp !== "number" || exp <= now) return null;
    return sid;
  } catch {
    return null;
  }
}
