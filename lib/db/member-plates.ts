import { db } from "./client";

export type PlateProblem = "taken" | "in_use" | "inactive";

/**
 * Which of these plates cannot be saved to a member right now: already saved by a member ("taken"), parked this moment
 * ("in_use"), or deactivated by an administrator ("inactive"). Plates that are new, or that only a guest has used, are fine.
 */
export async function plateProblems(plates: string[]): Promise<Map<string, PlateProblem>> {
  const out = new Map<string, PlateProblem>();
  if (plates.length === 0) return out;
  const { data, error } = await db().from("vehicles").select("id, plate, active, member_vehicles(member_id)").in("plate", plates);
  if (error) throw new Error(`Database error: ${error.message}`);
  const rows = (data ?? []) as unknown as { id: string; plate: string; active: boolean; member_vehicles: { member_id: string }[] }[];
  if (rows.length === 0) return out;
  const open = await db()
    .from("visits")
    .select("vehicle_id")
    .in(
      "vehicle_id",
      rows.map((r) => r.id),
    )
    .eq("status", "parked");
  if (open.error) throw new Error(`Database error: ${open.error.message}`);
  const parked = new Set((open.data ?? []).map((o) => o.vehicle_id as string));
  for (const r of rows) {
    if (r.member_vehicles.length > 0) out.set(r.plate, "taken");
    else if (!r.active) out.set(r.plate, "inactive");
    else if (parked.has(r.id)) out.set(r.plate, "in_use");
  }
  return out;
}
