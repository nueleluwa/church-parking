import type { ClaimStore, OpenVisit } from "@/lib/rules/claim";
import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

/** Postgres unique violation. The index name tells us which rule was hit. */
const UNIQUE_VIOLATION = "23505";

export const claimStore: ClaimStore = {
  async countAttempts(key, windowMinutes) {
    const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const { count, error } = await db()
      .from("rate_events")
      .select("id", { count: "exact", head: true })
      .eq("key", key)
      .gte("created_at", since);
    if (error) fail(error.message);
    return count ?? 0;
  },

  async recordAttempt(key) {
    const { error } = await db().from("rate_events").insert({ key });
    if (error) fail(error.message);
  },

  async findVehicleId(plate) {
    const { data, error } = await db().from("vehicles").select("id").eq("plate", plate).maybeSingle();
    if (error) fail(error.message);
    return data?.id ?? null;
  },

  async createVehicle(plate) {
    const { data, error } = await db().from("vehicles").insert({ plate }).select("id").single();
    if (error?.code === UNIQUE_VIOLATION) {
      // Another request created it a moment ago.
      const existing = await this.findVehicleId(plate);
      if (existing) return existing;
    }
    if (error || !data) fail(error?.message ?? "no vehicle");
    return data.id;
  },

  async isMemberPlate(vehicleId) {
    const { count, error } = await db()
      .from("member_vehicles")
      .select("member_id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId);
    if (error) fail(error.message);
    return (count ?? 0) > 0;
  },

  async closeStaleOpenVisits(vehicleId, today) {
    const { error } = await db().rpc("close_stale_visits", { p_vehicle: vehicleId, p_today: today });
    if (error) fail(error.message);
  },

  async findOpenVisit(vehicleId) {
    const { data, error } = await db()
      .from("visits")
      .select("member_id, pass_token, reference, service_date")
      .eq("vehicle_id", vehicleId)
      .eq("status", "parked")
      .maybeSingle();
    if (error) fail(error.message);
    return data as OpenVisit | null;
  },

  async memberIdForVehicle(vehicleId) {
    const { data, error } = await db()
      .from("member_vehicles")
      .select("member_id")
      .eq("vehicle_id", vehicleId)
      .limit(1)
      .maybeSingle();
    if (error) fail(error.message);
    return (data?.member_id as string | undefined) ?? null;
  },

  async memberOwnsVehicle(memberId, vehicleId) {
    const { count, error } = await db()
      .from("member_vehicles")
      .select("member_id", { count: "exact", head: true })
      .eq("member_id", memberId)
      .eq("vehicle_id", vehicleId);
    if (error) fail(error.message);
    return (count ?? 0) > 0;
  },

  async createGuest(name, phone) {
    const { data, error } = await db()
      .from("guests")
      .insert({ full_name: name, phone })
      .select("id")
      .single();
    if (error || !data) fail(error?.message ?? "no guest");
    return data.id;
  },

  async insertVisit(visit) {
    const { error } = await db().from("visits").insert(visit);
    if (!error) return "ok";
    if (error.code === UNIQUE_VIOLATION) {
      return error.message.includes("one_open_visit_per_vehicle")
        ? "open_visit_exists"
        : "reference_taken";
    }
    return fail(error.message);
  },

  async raiseAlert(kind, plate, detail) {
    const { error } = await db().from("alerts").insert({ kind, plate, detail });
    if (error) fail(error.message);
  },
};
