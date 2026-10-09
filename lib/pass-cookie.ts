import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { addRemembered, parseRemembered, serialiseRemembered } from "@/lib/rules/pass-tokens";
import { signValue, verifyValue } from "@/lib/session";

const COOKIE = "cp_pass";
const MAX_AGE_SECONDS = 60 * 60 * 24; // a pass is only good for one day (R-7)

/** The passes this phone made, newest first, if the cookie is genuine. */
export async function rememberedPassTokens(): Promise<string[]> {
  const signed = (await cookies()).get(COOKIE)?.value;
  const value = signed ? verifyValue(signed, serverEnv().SESSION_SECRET) : null;
  return parseRemembered(value);
}

/** Remember a new pass on the phone that created it (CI-6), keeping the ones it already held. */
export async function rememberPass(token: string): Promise<void> {
  const store = await cookies();
  const list = addRemembered(await rememberedPassTokens(), token);
  store.set(COOKIE, signValue(serialiseRemembered(list), serverEnv().SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
