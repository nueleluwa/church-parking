import { db } from "./client";
import type { Member } from "./types";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

const UNIQUE_VIOLATION = "23505";

export async function getMemberByPhone(phone: string): Promise<Member | null> {
  const { data, error } = await db().from("members").select("*").eq("phone", phone).maybeSingle();
  if (error) fail(error.message);
  return data as Member | null;
}

export async function getMemberById(id: string): Promise<Member | null> {
  const { data, error } = await db().from("members").select("*").eq("id", id).maybeSingle();
  if (error) fail(error.message);
  return data as Member | null;
}

/** Returns the new member's id, or "phone_taken" if that number already has an account. */
export async function createMember(
  fullName: string,
  phone: string,
  pinHash: string,
): Promise<string | "phone_taken"> {
  const { data, error } = await db()
    .from("members")
    .insert({ full_name: fullName, phone, pin_hash: pinHash })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) return "phone_taken";
  if (error || !data) fail(error?.message ?? "no member");
  return data.id as string;
}

export async function touchMember(memberId: string): Promise<void> {
  await db().from("members").update({ last_seen_at: new Date().toISOString() }).eq("id", memberId);
}

export async function lockMember(memberId: string, until: string): Promise<void> {
  const { error } = await db().from("members").update({ locked_until: until }).eq("id", memberId);
  if (error) fail(error.message);
}

export async function setMemberPin(memberId: string, pinHash: string): Promise<void> {
  const { error } = await db().from("members").update({ pin_hash: pinHash }).eq("id", memberId);
  if (error) fail(error.message);
}

export async function deleteMember(memberId: string): Promise<void> {
  const { error } = await db().rpc("delete_member", { p_member: memberId });
  if (error) fail(error.message);
}

export async function clearAttempts(key: string): Promise<void> {
  const { error } = await db().from("rate_events").delete().eq("key", key);
  if (error) fail(error.message);
}

export type MemberVehicle = { id: string; plate: string };

export async function listMemberVehicles(memberId: string): Promise<MemberVehicle[]> {
  const { data, error } = await db()
    .from("member_vehicles")
    .select("vehicles(id, plate)")
    .eq("member_id", memberId);
  if (error) fail(error.message);
  const rows = (data ?? []) as unknown as { vehicles: MemberVehicle }[];
  return rows.map((r) => r.vehicles).sort((a, b) => a.plate.localeCompare(b.plate));
}

export type AddVehicleResult = "added" | "already_yours" | "taken" | "in_use";

/**
 * Save a plate to a member (R-5 locks it to them). Refused if another member
 * has it, or if it has an open visit: first claim wins (R-4).
 */
export async function addMemberVehicle(memberId: string, plate: string): Promise<AddVehicleResult> {
  const existing = await db().from("vehicles").select("id").eq("plate", plate).maybeSingle();
  if (existing.error) fail(existing.error.message);

  let vehicleId = existing.data?.id as string | undefined;
  if (vehicleId) {
    const owners = await db().from("member_vehicles").select("member_id").eq("vehicle_id", vehicleId);
    if (owners.error) fail(owners.error.message);
    if ((owners.data ?? []).some((o) => o.member_id === memberId)) return "already_yours";
    if ((owners.data ?? []).length > 0) return "taken";

    const open = await db()
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId)
      .eq("status", "parked");
    if (open.error) fail(open.error.message);
    if ((open.count ?? 0) > 0) return "in_use";
  } else {
    const created = await db().from("vehicles").insert({ plate }).select("id").single();
    if (created.error || !created.data) fail(created.error?.message ?? "no vehicle");
    vehicleId = created.data.id as string;
  }

  const { error } = await db().from("member_vehicles").insert({ member_id: memberId, vehicle_id: vehicleId });
  if (error?.code === UNIQUE_VIOLATION) return "taken";
  if (error) fail(error.message);
  return "added";
}

export async function removeMemberVehicle(memberId: string, vehicleId: string): Promise<void> {
  const { error } = await db()
    .from("member_vehicles")
    .delete()
    .eq("member_id", memberId)
    .eq("vehicle_id", vehicleId);
  if (error) fail(error.message);
}

export type HistoryRow = {
  reference: string;
  service_date: string;
  status: "parked" | "released" | "missed";
  plate: string;
  areaName: string;
  serviceName: string;
};

export async function memberHistory(memberId: string, limit = 20): Promise<HistoryRow[]> {
  const { data, error } = await db()
    .from("visits")
    .select("reference, service_date, status, vehicles(plate), areas(name), services(name)")
    .eq("member_id", memberId)
    .order("checked_in_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);
  const rows = (data ?? []) as unknown as {
    reference: string;
    service_date: string;
    status: HistoryRow["status"];
    vehicles: { plate: string };
    areas: { name: string };
    services: { name: string };
  }[];
  return rows.map((r) => ({
    reference: r.reference,
    service_date: r.service_date,
    status: r.status,
    plate: r.vehicles.plate,
    areaName: r.areas.name,
    serviceName: r.services.name,
  }));
}

/** The member's own open visit for a vehicle today, so "Show my pass" can find it. */
export async function openPassTokenForMember(memberId: string, today: string): Promise<string | null> {
  const { data, error } = await db()
    .from("visits")
    .select("pass_token")
    .eq("member_id", memberId)
    .eq("status", "parked")
    .eq("service_date", today)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(error.message);
  return (data?.pass_token as string | undefined) ?? null;
}
