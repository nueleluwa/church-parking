"use server";

import { hash, verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { z } from "zod";
import { claimStore, clearAttempts, getStaffByPhone } from "@/lib/db";
import { ipKey as makeIpKey } from "@/lib/member-auth";
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
  const phoneKey = hashKey("staff-phone", phone ?? parsed.data.phone, secret);
  const ipKey = await makeIpKey("staff-ip", secret);

  const [phoneTries, ipTries] = await Promise.all([
    claimStore.countAttempts(phoneKey, LIMITS.windowMinutes),
    ipKey ? claimStore.countAttempts(ipKey, LIMITS.windowMinutes) : Promise.resolve(0),
  ]);
  if (phoneTries >= LIMITS.phone || ipTries >= LIMITS.ip) {
    return { error: "Too many tries. Please wait 15 minutes, then try again." };
  }

  const staff = phone ? await getStaffByPhone(phone) : null;
  dummyHash ??= hash("not-a-real-password");
  const ok = await verify(staff?.password_hash ?? (await dummyHash), parsed.data.password).catch(
    () => false,
  );
  if (!staff || !staff.active || !ok) {
    // Only wrong passwords count towards the limit, so signing in often never locks anyone out
    await Promise.all([
      claimStore.recordAttempt(phoneKey),
      ipKey ? claimStore.recordAttempt(ipKey) : Promise.resolve(),
    ]);
    return { error: WRONG };
  }

  await clearAttempts(phoneKey);
  await startStaffSession(staff.id);
  redirect("/staff");
}
