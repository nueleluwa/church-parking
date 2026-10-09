import { makePassToken, makeReference } from "./tokens";

/** Check-in rate limits (T-7). */
export const RATE_LIMITS = {
  ip: { max: 20, windowMinutes: 10 },
  phone: { max: 5, windowMinutes: 60 },
} as const;

export type AlertKind = "plate_conflict" | "member_plate_claim";

export type NewVisit = {
  reference: string;
  pass_token: string;
  vehicle_id: string;
  guest_id: string;
  service_id: number;
  area_id: number;
  service_date: string;
};

/** Everything claimGuestVisit needs from the database. lib/db provides it. */
export interface ClaimStore {
  countAttempts(key: string, windowMinutes: number): Promise<number>;
  recordAttempt(key: string): Promise<void>;
  findVehicleId(plate: string): Promise<string | null>;
  createVehicle(plate: string): Promise<string>;
  isMemberPlate(vehicleId: string): Promise<boolean>;
  hasOpenVisit(vehicleId: string): Promise<boolean>;
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
  ipKey: string; // hashed
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
  const [ipCount, phoneCount] = await Promise.all([
    store.countAttempts(input.ipKey, RATE_LIMITS.ip.windowMinutes),
    store.countAttempts(input.phoneKey, RATE_LIMITS.phone.windowMinutes),
  ]);
  await Promise.all([store.recordAttempt(input.ipKey), store.recordAttempt(input.phoneKey)]);
  if (ipCount >= RATE_LIMITS.ip.max || phoneCount >= RATE_LIMITS.phone.max) {
    return { status: "rate_limited" };
  }

  const alertDetail = { area_id: input.areaId, service_id: input.serviceId };
  let vehicleId = await store.findVehicleId(input.plate);

  if (vehicleId) {
    if (await store.hasOpenVisit(vehicleId)) {
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
