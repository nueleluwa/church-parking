"use server";

import { hash, verify } from "@node-rs/argon2";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { claimStore, getStaffByPhone } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { normalisePhone } from "@/lib/rules";
import { hashKey } from "@/lib/session";
import { startStaffSession } from "@/lib/staff-auth";

export type SignInState = { error?: string };

const schema = z.object({
  phone: z.string().trim().min(1).max(30),
  password: z.string().min(1).max(200),
});

const WRONG = "Phone number or password is wrong.";
const LIMITS = { phone: 10, ip: 30, windowMinutes: 15 };

// Checked when the phone number is unknown, so a wrong number takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;

export async function signInStaff(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: WRONG };

  const phone = normalisePhone(parsed.data.phone);
  const secret = serverEnv().SESSION_SECRET;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const phoneKey = hashKey("staff-phone", phone ?? parsed.data.phone, secret);
  const ipKey = hashKey("staff-ip", ip, secret);

  const [phoneTries, ipTries] = await Promise.all([
    claimStore.countAttempts(phoneKey, LIMITS.windowMinutes),
    claimStore.countAttempts(ipKey, LIMITS.windowMinutes),
  ]);
  await Promise.all([claimStore.recordAttempt(phoneKey), claimStore.recordAttempt(ipKey)]);
  if (phoneTries >= LIMITS.phone || ipTries >= LIMITS.ip) {
    return { error: "Too many tries. Please wait 15 minutes, then try again." };
  }

  const staff = phone ? await getStaffByPhone(phone) : null;
  dummyHash ??= hash("not-a-real-password");
  const ok = await verify(staff?.password_hash ?? (await dummyHash), parsed.data.password).catch(
    () => false,
  );
  if (!staff || !staff.active || !ok) return { error: WRONG };

  await startStaffSession(staff.id);
  redirect("/staff/scan");
}
