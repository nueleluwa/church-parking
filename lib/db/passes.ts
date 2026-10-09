import { db } from "./client";

export type PassRecord = {
  plate: string;
  make: string | null;
  colour: string | null;
  status: "parked" | "released" | "missed";
  reference: string;
  service_date: string;
  checkedInAt: string;
  areaName: string;
  serviceName: string;
  /** True when a guest checked in (no account). A member's pass has no phone details shown either way. */
  isGuest: boolean;
};

/**
 * Loads what a pass page needs. It deliberately never reads names or phone
 * numbers: those come in with staff sessions in M3.
 */
export async function getPassByToken(token: string): Promise<PassRecord | null> {
  const { data, error } = await db()
    .from("visits")
    .select("status, reference, service_date, checked_in_at, guest_id, vehicles(plate, make, colour), areas(name), services(name)")
    .eq("pass_token", token)
    .maybeSingle();
  if (error) throw new Error(`Database error: ${error.message}`);
  if (!data) return null;
  // Supabase types joined rows loosely, so read them explicitly.
  const row = data as unknown as {
    status: PassRecord["status"];
    reference: string;
    service_date: string;
    checked_in_at: string;
    guest_id: string | null;
    vehicles: { plate: string; make: string | null; colour: string | null };
    areas: { name: string };
    services: { name: string };
  };
  return {
    plate: row.vehicles.plate,
    make: row.vehicles.make,
    colour: row.vehicles.colour,
    checkedInAt: row.checked_in_at,
    isGuest: row.guest_id !== null,
    status: row.status,
    reference: row.reference,
    service_date: row.service_date,
    areaName: row.areas.name,
    serviceName: row.services.name,
  };
}
