import { db } from "./client";

export type PassRecord = {
  plate: string;
  status: "parked" | "released" | "missed";
  reference: string;
  service_date: string;
  areaName: string;
  serviceName: string;
};

/**
 * Loads what a pass page needs. It deliberately never reads names or phone
 * numbers: those come in with staff sessions in M3.
 */
export async function getPassByToken(token: string): Promise<PassRecord | null> {
  const { data, error } = await db()
    .from("visits")
    .select("status, reference, service_date, vehicles(plate), areas(name), services(name)")
    .eq("pass_token", token)
    .maybeSingle();
  if (error) throw new Error(`Database error: ${error.message}`);
  if (!data) return null;
  // Supabase types joined rows loosely, so read them explicitly.
  const row = data as unknown as {
    status: PassRecord["status"];
    reference: string;
    service_date: string;
    vehicles: { plate: string };
    areas: { name: string };
    services: { name: string };
  };
  return {
    plate: row.vehicles.plate,
    status: row.status,
    reference: row.reference,
    service_date: row.service_date,
    areaName: row.areas.name,
    serviceName: row.services.name,
  };
}
