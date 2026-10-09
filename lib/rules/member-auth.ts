/** PIN lockout limits (threat T-4). */
export const PIN_LIMITS = {
  /** 5 failures pause sign-in for 15 minutes. */
  pause: { max: 5, windowMinutes: 15 },
  /** 15 failures in a day lock the account until an admin resets it. */
  daily: { max: 15, windowMinutes: 24 * 60 },
  /** Per IP address, so one phone can't guess across many accounts. */
  ip: { max: 30, windowMinutes: 15 },
} as const;

/** A lock that only an admin PIN reset clears. */
export const LOCKED_FOREVER = "9999-12-31T00:00:00.000Z";

export const PIN_PATTERN = /^\d{4}$/;

export interface MemberAuthStore {
  getMemberByPhone(phone: string): Promise<{ id: string; pin_hash: string; locked_until: string | null } | null>;
  countFailures(key: string, windowMinutes: number): Promise<number>;
  recordFailure(key: string): Promise<void>;
  clearFailures(key: string): Promise<void>;
  lockMember(memberId: string): Promise<void>;
  /** Must take about as long when the hash is null, so unknown phones can't be told apart. */
  verifyPin(hash: string | null, pin: string): Promise<boolean>;
}

export type PinResult =
  | { status: "ok"; memberId: string }
  | { status: "wrong" }
  | { status: "paused" }
  | { status: "locked" };

/**
 * Check a phone number and PIN. Lockouts are counted per phone number (even
 * for numbers with no account) and per IP address, and they apply before the
 * PIN is looked at, so a correct PIN is refused while paused or locked.
 */
export async function attemptMemberSignIn(
  store: MemberAuthStore,
  input: { phone: string; pin: string; phoneKey: string; ipKey: string; now: Date },
): Promise<PinResult> {
  const member = await store.getMemberByPhone(input.phone);

  if (member?.locked_until && new Date(member.locked_until) > input.now) {
    return { status: "locked" };
  }

  const [recent, today, fromIp] = await Promise.all([
    store.countFailures(input.phoneKey, PIN_LIMITS.pause.windowMinutes),
    store.countFailures(input.phoneKey, PIN_LIMITS.daily.windowMinutes),
    store.countFailures(input.ipKey, PIN_LIMITS.ip.windowMinutes),
  ]);

  if (today >= PIN_LIMITS.daily.max) {
    if (member) {
      await store.lockMember(member.id);
      return { status: "locked" };
    }
    return { status: "paused" };
  }
  if (recent >= PIN_LIMITS.pause.max || fromIp >= PIN_LIMITS.ip.max) {
    return { status: "paused" };
  }

  const ok = await store.verifyPin(member?.pin_hash ?? null, input.pin);
  if (ok && member) {
    await store.clearFailures(input.phoneKey);
    return { status: "ok", memberId: member.id };
  }

  await Promise.all([store.recordFailure(input.phoneKey), store.recordFailure(input.ipKey)]);
  if (member && today + 1 >= PIN_LIMITS.daily.max) {
    await store.lockMember(member.id);
    return { status: "locked" };
  }
  return { status: "wrong" };
}
