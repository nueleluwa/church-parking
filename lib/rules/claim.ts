import { makePassToken, makeReference } from "./tokens";

/**
 * Check-in rate limits (T-7). The IP limit is generous because a whole
 * congregation may share the church wifi or one mobile network. The phone
 * limit is what really slows a spammer.
 */
export const RATE_LIMITS = {
  ip: { max: 150, windowMinutes: 10 },
  phone: { max: 5, windowMinutes: 60 },
} as const;

/** A ready-made reference and pass token. The database tries each in turn if one is already taken. */
export type Candidate = { reference: string; token: string };

/** What the database answers when a guest claims a plate. It never carries anyone else's pass or details. */
export type GuestClaimAnswer =
  | { status: "ok"; token: string; reference: string }
  | { status: "blocked"; reason: "plate_conflict" | "member_plate" }
  | { status: "rate_limited" }
  | { status: "error" };

export type MemberClaimAnswer =
  | { status: "ok"; token: string; reference: string; existing: boolean }
  | { status: "blocked"; reason: "plate_conflict" | "not_your_vehicle" }
  | { status: "error" };

export type GuestClaimArgs = {
  plate: string;
  name: string;
  phone: string;
  serviceId: number;
  areaId: number;
  serviceDate: string;
  staffId: string | null;
  candidates: Candidate[];
  /** Null for an attendant registering by hand, which skips the public rate limits (OP-4). */
  limits: {
    phoneKey: string;
    phoneMax: number;
    phoneMinutes: number;
    ipKey: string | null;
    ipMax: number;
    ipMinutes: number;
  } | null;
};

export type MemberClaimArgs = {
  memberId: string;
  vehicleId: string;
  plate: string;
  serviceId: number;
  areaId: number;
  serviceDate: string;
  staffId: string | null;
  candidates: Candidate[];
};

/**
 * Everything the claim rules need from the database. lib/db provides it. The two `claim` calls
 * do the whole check-in in ONE database transaction (the SQL functions claim_guest_visit and
 * claim_member_visit), so the rules R-2 (one open visit per vehicle), R-4 (first claim wins) and
 * R-5 (member plates are locked) are applied by the database itself, even for two phones at once.
 */
export interface ClaimStore {
  countAttempts(key: string, windowMinutes: number): Promise<number>;
  recordAttempt(key: string): Promise<void>;
  findVehicleId(plate: string): Promise<string | null>;
  memberIdForVehicle(vehicleId: string): Promise<string | null>;
  claimGuest(args: GuestClaimArgs): Promise<GuestClaimAnswer>;
  claimMember(args: MemberClaimArgs): Promise<MemberClaimAnswer>;
}

export type GuestClaimInput = {
  name: string;
  phone: string; // E.164
  plate: string; // normalised
  serviceId: number;
  areaId: number;
  serviceDate: string;
  /** Set when an attendant registers the car by hand. Skips the public rate limits (OP-4). */
  staffId?: string;
  ipKey: string; // hashed; empty when the address is unknown, which skips the IP limit
  phoneKey: string; // hashed
};

export type ClaimResult =
  | { status: "ok"; token: string; reference: string }
  | { status: "blocked"; reason: "plate_conflict" | "member_plate" }
  | { status: "rate_limited" };

const MAX_REFERENCE_TRIES = 5;

const candidates = (): Candidate[] =>
  Array.from({ length: MAX_REFERENCE_TRIES }, () => ({ reference: makeReference(), token: makePassToken() }));

/**
 * A guest claims a plate for one visit. Applies rate limits, R-2/R-4 (first
 * claim wins) and R-5 (member plates are locked), all in one database call. A blocked or
 * limited result never carries a pass token or any detail of the existing visit.
 */
export async function claimGuestVisit(store: ClaimStore, input: GuestClaimInput): Promise<ClaimResult> {
  const answer = await store.claimGuest({
    plate: input.plate,
    name: input.name,
    phone: input.phone,
    serviceId: input.serviceId,
    areaId: input.areaId,
    serviceDate: input.serviceDate,
    staffId: input.staffId ?? null,
    candidates: candidates(),
    limits: input.staffId
      ? null
      : {
          phoneKey: input.phoneKey,
          phoneMax: RATE_LIMITS.phone.max,
          phoneMinutes: RATE_LIMITS.phone.windowMinutes,
          ipKey: input.ipKey || null,
          ipMax: RATE_LIMITS.ip.max,
          ipMinutes: RATE_LIMITS.ip.windowMinutes,
        },
  });
  if (answer.status === "error") throw new Error("Could not make a unique reference.");
  return answer;
}

export type MemberClaimInput = {
  memberId: string;
  vehicleId: string;
  plate: string;
  serviceId: number;
  areaId: number;
  serviceDate: string;
  /** Set when an attendant registers the member's car for them. */
  staffId?: string;
};

export type MemberClaimResult =
  | { status: "ok"; token: string; reference: string; existing: boolean }
  | { status: "blocked"; reason: "plate_conflict" | "not_your_vehicle" };

/**
 * A member's car checks in (CI-4), in one database call. If the member is already checked in
 * with this car today (staying for a second or third service), they get their own pass back,
 * because the pass is good all day (R-3). Anyone else's open visit on the plate blocks the
 * check-in and alerts the coordinator, and never shows that pass.
 */
export async function claimMemberVisit(store: ClaimStore, input: MemberClaimInput): Promise<MemberClaimResult> {
  const answer = await store.claimMember({
    memberId: input.memberId,
    vehicleId: input.vehicleId,
    plate: input.plate,
    serviceId: input.serviceId,
    areaId: input.areaId,
    serviceDate: input.serviceDate,
    staffId: input.staffId ?? null,
    candidates: candidates(),
  });
  if (answer.status === "error") throw new Error("Could not make a unique reference.");
  return answer;
}

export type StaffMemberClaimInput = {
  plate: string;
  serviceId: number;
  areaId: number;
  serviceDate: string;
  staffId: string;
};

export type StaffMemberClaimResult =
  | { status: "ok"; token: string; reference: string; existing: boolean }
  | { status: "not_member" }
  | { status: "blocked" };

/**
 * An attendant registers a car that belongs to a member, for example when the
 * member is locked out, forgot their PIN or has no data. The visit is the
 * member's own, and the staff member who did it is recorded.
 */
export async function claimVisitForMemberByStaff(
  store: ClaimStore,
  input: StaffMemberClaimInput,
): Promise<StaffMemberClaimResult> {
  const vehicleId = await store.findVehicleId(input.plate);
  const memberId = vehicleId ? await store.memberIdForVehicle(vehicleId) : null;
  if (!vehicleId || !memberId) return { status: "not_member" };

  const result = await claimMemberVisit(store, { ...input, memberId, vehicleId });
  return result.status === "ok" ? result : { status: "blocked" };
}
