import { cookies } from "next/headers";
import { looksLikeCredential } from "@/lib/rules/credential";

/**
 * The checkout credential's cookie (ADR-001). Set by the server at check-in, never readable by script (HttpOnly), sent only to
 * the parking pages (path /c, which covers the check-in page and the exit page), 24 hours by default or until checkout. It holds
 * the credential and nothing else: no name, phone number or plate. `Secure` follows the other cookies: on in production, off for
 * plain-http localhost. localStorage is never used for it.
 */
export const EXIT_COOKIE = "cp_exit";
const PATH = "/c";

export async function setExitCredential(token: string, hours: number): Promise<void> {
  (await cookies()).set(EXIT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PATH,
    maxAge: Math.round(hours * 3600),
  });
}

/** The credential this browser holds, if the cookie is present and shaped like one. */
export async function readExitCredential(): Promise<string | null> {
  const value = (await cookies()).get(EXIT_COOKIE)?.value;
  return looksLikeCredential(value) ? value : null;
}

export async function clearExitCredential(): Promise<void> {
  (await cookies()).set(EXIT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PATH,
    maxAge: 0,
  });
}
