import { createHmac, timingSafeEqual } from "node:crypto";

/** Signs a value so a cookie can't be forged: "value.signature". */
export function signValue(value: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${sig}`;
}

/** Returns the value if the signature is good, otherwise null. */
export function verifyValue(signed: string, secret: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(signValue(value, secret).slice(i + 1));
  const actual = Buffer.from(signed.slice(i + 1));
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? value : null;
}

/** One-way hash for rate-limit keys, so raw phones and IPs are never stored. */
export function hashKey(kind: string, value: string, secret: string): string {
  return `${kind}:${createHmac("sha256", secret).update(value).digest("base64url")}`;
}
