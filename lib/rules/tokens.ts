import { randomBytes } from "node:crypto";

// Leaves out the look-alikes 0, O, 1 and I. 32 characters, so a random byte
// masked with 31 picks one without bias.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A short reference the driver can read out, like "PK-7Q4M". */
export function makeReference(): string {
  const bytes = randomBytes(4);
  let code = "";
  for (const b of bytes) code += REFERENCE_ALPHABET[b & 31];
  return `PK-${code}`;
}

/** A 128-bit random pass token, base64url encoded (22 characters). */
export function makePassToken(): string {
  return randomBytes(16).toString("base64url");
}
