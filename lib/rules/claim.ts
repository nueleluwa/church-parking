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

export type AlertKind = "plate_conflict" | "member_plate_claim";

export type NewVisit = {
  reference: string;
  pass_token: string;
  vehicle_id: string;
  guest_id?: string;
  member_id?: string;
  service_id: number;
  area_id: number;
  service_date: string;
  checked_in_by?: string;
};

export type OpenVisit = {
  member_id: string | null;
  pass_token: string;
  reference: string;
  service_date: string;
};

/** Everything the claim rules need from the database. lib/db provides it. */
export interface ClaimStore {
  countAttempts(key: string, windowMinutes: number): Promise<number>;
  recordAttempt(key: string): Promise<void>;
  findVehicleId(plate: string): Promise<string | null>;
  createVehicle(plate: string): Promise<string>;
  isMemberPlate(vehicleId: string): Promise<boolean>;
  memberOwnsVehicle(memberId: string, vehicleId: string): Promise<boolean>;
  memberIdForVehicle(vehicleId: string): Promise<string | null>;
  /** Closes visits for this vehicle still open from an earlier day, as the midnight job would. */
  closeStaleOpenVisits(vehicleId: string, today: string): Promise<void>;
  findOpenVisit(vehicleId: string): Promise<OpenVisit | null>;
  createGuest(name: string, phone: string): Promise<string>;
  insertVisit(visit: NewVisit): Promise<"ok" | "open_visit_exists" | "reference_taken">;
  raiseAlert(kind: AlertKind, plate: string, detail: Record<string, unknown>): Promise<void>;
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

/**
 * A guest claims a plate for one visit. Applies rate limits, R-2/R-4 (first
 * claim wins) and R-5 (member plates are locked). A blocked or limited
 * result never carries a pass token or any detail of the existing visit.
 */
export async function claimGuestVisit(
  store: ClaimStore,
  input: GuestClaimInput,
): Promise<ClaimResult> {
  if (!input.staffId) {
    const checks: Promise<number>[] = [
      store.countAttempts(input.phoneKey, RATE_LIMITS.phone.windowMinutes),
    ];
    if (input.ipKey) checks.push(store.countAttempts(input.ipKey, RATE_LIMITS.ip.windowMinutes));
    const [phoneCount, ipCount = 0] = await Promise.all(checks);

    await store.recordAttempt(input.phoneKey);
    if (input.ipKey) await store.recordAttempt(input.ipKey);
    if (ipCount >= RATE_LIMITS.ip.max || phoneCount >= RATE_LIMITS.phone.max) {
      return { status: "rate_limited" };
    }
  }

  const alertDetail = { area_id: input.areaId, service_id: input.serviceId };
  let vehicleId = await store.findVehicleId(input.plate);

  if (vehicleId) {
    await store.closeStaleOpenVisits(vehicleId, input.serviceDate);
    if (await store.findOpenVisit(vehicleId)) {
      await store.raiseAlert("plate_conflict", input.plate, alertDetail);
      return { status: "blocked", reason: "plate_conflict" };
    }
    if (await store.isMemberPlate(vehicleId)) {
      await store.raiseAlert("member_plate_claim", input.plate, alertDetail);
      return { status: "blocked", reason: "member_plate" };
    }
  } else {
    vehicleId = await store.createVehicle(input.plate);
  }

  const guestId = await store.createGuest(input.name, input.phone);

  for (let i = 0; i < MAX_REFERENCE_TRIES; i++) {
    const visit: NewVisit = {
      reference: makeReference(),
      pass_token: makePassToken(),
      vehicle_id: vehicleId,
      guest_id: guestId,
      service_id: input.serviceId,
      area_id: input.areaId,
      service_date: input.serviceDate,
      ...(input.staffId ? { checked_in_by: input.staffId } : {}),
    };
    const outcome = await store.insertVisit(visit);
    if (outcome === "ok") {
      return { status: "ok", token: visit.pass_token, reference: visit.reference };
    }
    if (outcome === "open_visit_exists") {
      // Someone else claimed this plate a moment ago. The database decides.
      await store.raiseAlert("plate_conflict", input.plate, alertDetail);
      return { status: "blocked", reason: "plate_conflict" };
    }
  }
  throw new Error("Could not make a unique reference.");
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
 * A member's car checks in (CI-4). If the member is already checked in with
 * this car today (staying for a second or third service), they get their own
 * pass back, because the pass is good all day (R-3). Anyone else's open visit
 * on the plate blocks the check-in and alerts the coordinator, and never
 * shows that pass.
 */
export async function claimMemberVisit(
  store: ClaimStore,
  input: MemberClaimInput,
): Promise<MemberClaimResult> {
  if (!(await store.memberOwnsVehicle(input.memberId, input.vehicleId))) {
    return { status: "blocked", reason: "not_your_vehicle" };
  }
  const alertDetail = { area_id: input.areaId, service_id: input.serviceId };

  await store.closeStaleOpenVisits(input.vehicleId, input.serviceDate);
  const open = await store.findOpenVisit(input.vehicleId);
  if (open) {
    if (open.member_id === input.memberId && open.service_date === input.serviceDate) {
      return { status: "ok", token: open.pass_token, reference: open.reference, existing: true };
    }
    await store.raiseAlert("plate_conflict", input.plate, alertDetail);
    return { status: "blocked", reason: "plate_conflict" };
  }

  for (let i = 0; i < MAX_REFERENCE_TRIES; i++) {
    const visit: NewVisit = {
      reference: makeReference(),
      pass_token: makePassToken(),
      vehicle_id: input.vehicleId,
      member_id: input.memberId,
      service_id: input.serviceId,
      area_id: input.areaId,
      service_date: input.serviceDate,
      ...(input.staffId ? { checked_in_by: input.staffId } : {}),
    };
    const outcome = await store.insertVisit(visit);
    if (outcome === "ok") {
      return { status: "ok", token: visit.pass_token, reference: visit.reference, existing: false };
    }
    if (outcome === "open_visit_exists") {
      await store.raiseAlert("plate_conflict", input.plate, alertDetail);
      return { status: "blocked", reason: "plate_conflict" };
    }
  }
  throw new Error("Could not make a unique reference.");
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
