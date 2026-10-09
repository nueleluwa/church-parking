import { hash, verify } from "@node-rs/argon2";
import { cookies, headers } from "next/headers";
import {
  clearAttempts,
  claimStore,
  getMemberById,
  getMemberByPhone,
  lockMember,
  touchMember,
  type Member,
} from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  attemptMemberSignIn,
  LOCKED_FOREVER,
  type MemberAuthStore,
  type PinResult,
} from "@/lib/rules";
import { hashKey } from "@/lib/session";
import { makeMemberToken, MEMBER_SESSION_SECONDS, readMemberToken } from "@/lib/member-token";

const COOKIE = "cp_member";

// Checked when a phone number has no account, so a wrong number takes as long as a wrong PIN.
let dummyHash: Promise<string> | undefined;

const store: MemberAuthStore = {
  async getMemberByPhone(phone) {
    return getMemberByPhone(phone);
  },
  countFailures: (key, windowMinutes) => claimStore.countAttempts(key, windowMinutes),
  recordFailure: (key) => claimStore.recordAttempt(key),
  clearFailures: (key) => clearAttempts(key),
  lockMember: (id) => lockMember(id, LOCKED_FOREVER),
  async verifyPin(pinHash, pin) {
    dummyHash ??= hash("0000");
    return verify(pinHash ?? (await dummyHash), pin).catch(() => false);
  },
};

export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Check a phone number and PIN with the lockout rules (T-4). */
export async function checkMemberPin(phone: string, pin: string): Promise<PinResult> {
  const secret = serverEnv().SESSION_SECRET;
  return attemptMemberSignIn(store, {
    phone,
    pin,
    phoneKey: hashKey("pin-phone", phone, secret),
    ipKey: hashKey("pin-ip", await clientIp(), secret),
    now: new Date(),
  });
}

export const PIN_MESSAGES = {
  wrong: "Phone number or PIN is wrong.",
  paused: "Too many tries. Please wait 15 minutes, then try again.",
  locked: "This account is locked. Please ask the parking team to reset your PIN.",
} as const;

export async function startMemberSession(memberId: string): Promise<void> {
  (await cookies()).set(COOKIE, makeMemberToken(memberId, serverEnv().SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MEMBER_SESSION_SECONDS,
  });
  await touchMember(memberId);
}

export async function endMemberSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** The signed-in member, or null. Read from the database each time, so a locked or deleted account stops working. */
export async function currentMember(): Promise<Member | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = readMemberToken(token, serverEnv().SESSION_SECRET);
  if (!id) return null;
  const member = await getMemberById(id);
  if (!member) return null;
  if (member.locked_until && new Date(member.locked_until) > new Date()) return null;
  return member;
}

export function hashPin(pin: string): Promise<string> {
  return hash(pin);
}
