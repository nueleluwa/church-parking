import type { ClaimStore, GuestClaimAnswer, MemberClaimAnswer } from "@/lib/rules/claim";
import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

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

  /** The whole guest check-in in one database call (see supabase/migrations/20261010010000_claim_functions.sql). */
  async claimGuest(a) {
    const { data, error } = await db().rpc("claim_guest_visit", {
      p_plate: a.plate,
      p_name: a.name,
      p_phone: a.phone,
      p_service: a.serviceId,
      p_area: a.areaId,
      p_date: a.serviceDate,
      p_staff: a.staffId,
      p_candidates: a.candidates,
      p_phone_key: a.limits?.phoneKey ?? null,
      p_phone_max: a.limits?.phoneMax ?? 0,
      p_phone_mins: a.limits?.phoneMinutes ?? 0,
      p_ip_key: a.limits?.ipKey ?? null,
      p_ip_max: a.limits?.ipMax ?? 0,
      p_ip_mins: a.limits?.ipMinutes ?? 0,
    });
    if (error) fail(error.message);
    return data as GuestClaimAnswer;
  },

  /** The whole member check-in in one database call. */
  async claimMember(a) {
    const { data, error } = await db().rpc("claim_member_visit", {
      p_member: a.memberId,
      p_vehicle: a.vehicleId,
      p_plate: a.plate,
      p_service: a.serviceId,
      p_area: a.areaId,
      p_date: a.serviceDate,
      p_staff: a.staffId,
      p_candidates: a.candidates,
    });
    if (error) fail(error.message);
    return data as MemberClaimAnswer;
  },
};
