import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

export type CheckInVehicle = { id: string; plate: string; make: string | null; colour: string | null };

/**
 * The active vehicles of the active member with this local phone number, for the member to confirm. Null when there is no such
 * member, they are switched off, or they have no active vehicle: the caller gives one answer for all three.
 */
export async function findCheckInVehicles(local: string): Promise<CheckInVehicle[] | null> {
  const { data, error } = await db()
    .from("members")
    .select("active, member_vehicles(vehicles(id, plate, make, colour, active))")
    .eq("phone_local", local)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data || !data.active) return null;
  const rows = data.member_vehicles as unknown as { vehicles: CheckInVehicle & { active: boolean } }[];
  const cars = rows
    .map((r) => r.vehicles)
    .filter((v) => v.active)
    .map(({ id, plate, make, colour }) => ({ id, plate, make, colour }))
    .sort((a, b) => a.plate.localeCompare(b.plate));
  return cars.length > 0 ? cars : null;
}

export type CheckInAnswer =
  | { status: "ok"; reissued: boolean; token: string; reference: string; plate: string }
  | { status: "unavailable"; reason: "unknown" | "inactive" | "vehicle" }
  | { status: "other_area" }
  | { status: "rate_limited" }
  | { status: "blocked"; reason: "plate_conflict" }
  | { status: "error" };

export type CheckOutAnswer =
  | { status: "ok"; plate: string; reference: string; checked_in_at: string; released_at: string }
  | { status: "already_closed" | "closed_missed" | "no_credential" | "expired" | "wrong_area" | "held" };

/**
 * Close the visit whose credential has this hash, at this car park, if it is still open (see
 * supabase/migrations/20261019050000_checkout_with_credential.sql). The credential itself never reaches the database.
 */
export async function checkoutWithCredential(credentialHash: string, areaId: number, today: string): Promise<CheckOutAnswer> {
  const { data, error } = await db().rpc("checkout_with_credential", { p_hash: credentialHash, p_area: areaId, p_today: today });
  if (error) fail(error.message);
  return data as CheckOutAnswer;
}

export type CheckInArgs = {
  local: string;
  vehicleId: string;
  serviceId: number;
  areaId: number;
  serviceDate: string;
  /** SHA-256 of the new credential. The credential itself never reaches the database. */
  credentialHash: string;
  credentialExpiresAt: Date;
  candidates: { reference: string; token: string }[];
  phone: { key: string; max: number; minutes: number };
  reissue: { key: string; max: number; minutes: number };
};

/** The whole phone check-in in one database call (see supabase/migrations/20261019030000_check_in_with_credential.sql). */
export async function checkInWithCredential(a: CheckInArgs): Promise<CheckInAnswer> {
  const { data, error } = await db().rpc("check_in_with_credential", {
    p_local: a.local,
    p_vehicle: a.vehicleId,
    p_service: a.serviceId,
    p_area: a.areaId,
    p_date: a.serviceDate,
    p_hash: a.credentialHash,
    p_expires: a.credentialExpiresAt.toISOString(),
    p_candidates: a.candidates,
    p_phone_key: a.phone.key,
    p_phone_max: a.phone.max,
    p_phone_mins: a.phone.minutes,
    p_reissue_key: a.reissue.key,
    p_reissue_max: a.reissue.max,
    p_reissue_mins: a.reissue.minutes,
  });
  if (error) fail(error.message);
  return data as CheckInAnswer;
}
