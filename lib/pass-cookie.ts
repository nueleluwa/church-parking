import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { signValue, verifyValue } from "@/lib/session";

const COOKIE = "cp_pass";
const MAX_AGE_SECONDS = 60 * 60 * 24; // a pass is only good for one day (R-7)

/** Remember the pass on the phone that created it (CI-6). */
export async function rememberPass(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signValue(token, serverEnv().SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** The pass token remembered on this phone, if the cookie is genuine. */
export async function rememberedPassToken(): Promise<string | null> {
  const signed = (await cookies()).get(COOKIE)?.value;
  return signed ? verifyValue(signed, serverEnv().SESSION_SECRET) : null;
}
