import { canAddVehicle } from "@/lib/rules/limits";
import { lagosDate } from "@/lib/rules/service";
import type { VehicleDetails } from "@/lib/rules/vehicle";
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

export type MemberVehicle = { id: string; plate: string; make: string | null; colour: string | null };

export async function listMemberVehicles(memberId: string): Promise<MemberVehicle[]> {
  const { data, error } = await db()
    .from("member_vehicles")
    .select("vehicles(id, plate, make, colour)")
    .eq("member_id", memberId);
  if (error) fail(error.message);
  const rows = (data ?? []) as unknown as { vehicles: MemberVehicle }[];
  return rows.map((r) => r.vehicles).sort((a, b) => a.plate.localeCompare(b.plate));
}

export type AddVehicleResult = "added" | "already_yours" | "taken" | "in_use" | "too_many" | "inactive";

/**
 * Save a plate to a member (R-5 locks it to them). Refused if another member
 * has it, or if it has an open visit: first claim wins (R-4).
 */
export async function addMemberVehicle(
  memberId: string,
  plate: string,
  details: VehicleDetails = { make: null, colour: null },
): Promise<AddVehicleResult> {
  const saved = await db()
    .from("member_vehicles")
    .select("vehicle_id", { count: "exact", head: true })
    .eq("member_id", memberId);
  if (saved.error) fail(saved.error.message);
  if (!canAddVehicle(saved.count ?? 0)) return "too_many";

  const existing = await db().from("vehicles").select("id, active").eq("plate", plate).maybeSingle();
  if (existing.error) fail(existing.error.message);

  let vehicleId = existing.data?.id as string | undefined;
  if (vehicleId) {
    // An administrator deactivated this vehicle: saving it to an account must not quietly bring it back
    if (existing.data?.active === false) return "inactive";
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
    const created = await db().from("vehicles").insert({ plate, ...details }).select("id").single();
    if (created.error || !created.data) fail(created.error?.message ?? "no vehicle");
    vehicleId = created.data.id as string;
  }

  const { error } = await db().from("member_vehicles").insert({ member_id: memberId, vehicle_id: vehicleId });
  if (error?.code === UNIQUE_VIOLATION) return "taken";
  if (error) fail(error.message);
  // The car may already exist from an earlier guest visit with no details: add the member's
  if (existing.data?.id && (details.make || details.colour)) await updateVehicleRow(vehicleId, details);
  return "added";
}

async function updateVehicleRow(vehicleId: string, details: VehicleDetails): Promise<void> {
  const { error } = await db().from("vehicles").update(details).eq("id", vehicleId);
  if (error) fail(error.message);
}

/** Change the make, model and colour of a car the member has saved. Returns false if it is not theirs. */
export async function updateMemberVehicleDetails(
  memberId: string,
  vehicleId: string,
  details: VehicleDetails,
): Promise<boolean> {
  const owned = await db()
    .from("member_vehicles")
    .select("vehicle_id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("vehicle_id", vehicleId);
  if (owned.error) fail(owned.error.message);
  if ((owned.count ?? 0) === 0) return false;
  await updateVehicleRow(vehicleId, details);
  return true;
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
  checkedInAt: string;
  status: "parked" | "released" | "missed";
  plate: string;
  make: string | null;
  colour: string | null;
  areaName: string;
  serviceName: string;
  /** Only for a car still parked today, so the member can open its pass. */
  passToken: string | null;
};

export async function memberHistory(memberId: string, limit = 20): Promise<HistoryRow[]> {
  const { data, error } = await db()
    .from("visits")
    .select("reference, service_date, checked_in_at, status, pass_token, vehicles(plate, make, colour), areas(name), services(name)")
    .eq("member_id", memberId)
    .order("checked_in_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);
  const rows = (data ?? []) as unknown as {
    reference: string;
    service_date: string;
    checked_in_at: string;
    status: HistoryRow["status"];
    pass_token: string;
    vehicles: { plate: string; make: string | null; colour: string | null };
    areas: { name: string };
    services: { name: string };
  }[];
  const today = lagosDate(new Date());
  return rows.map((r) => ({
    reference: r.reference,
    service_date: r.service_date,
    checkedInAt: r.checked_in_at,
    status: r.status,
    plate: r.vehicles.plate,
    make: r.vehicles.make,
    colour: r.vehicles.colour,
    areaName: r.areas.name,
    serviceName: r.services.name,
    passToken: r.status === "parked" && r.service_date === today ? r.pass_token : null,
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

/** Today's open passes for a member's cars, by vehicle, so a car already checked in can show its pass. */
export async function openPassTokensByVehicle(
  memberId: string,
  today: string,
): Promise<Record<string, string>> {
  const { data, error } = await db()
    .from("visits")
    .select("vehicle_id, pass_token")
    .eq("member_id", memberId)
    .eq("status", "parked")
    .eq("service_date", today);
  if (error) fail(error.message);
  return Object.fromEntries((data ?? []).map((v) => [v.vehicle_id as string, v.pass_token as string]));
}

export type ConvertResult =
  | { status: "ok"; memberId: string }
  | { status: "not_found" | "not_guest" | "not_open" | "phone_taken" | "plate_taken" };

/**
 * A guest turns their pass details into a member account (CI-7). One database step
 * makes the member, saves the car to them and moves the visit across.
 */
export async function convertGuestToMember(token: string, pinHash: string): Promise<ConvertResult> {
  const { data, error } = await db().rpc("convert_guest_to_member", { p_token: token, p_pin_hash: pinHash });
  if (error) fail(error.message);
  const result = data as string;
  if (/^[0-9a-f-]{36}$/.test(result)) return { status: "ok", memberId: result };
  return { status: result as Exclude<ConvertResult["status"], "ok"> };
}

// ---------- Members as an administrator sees them (Users screen) ----------

export type MemberFilter = { q: string; status: "active" | "inactive" | null; cars: "with" | "none" | null; /** Only members who joined at or after this time. */ since: string | null };

export type MemberListRow = {
  id: string;
  fullName: string;
  phone: string;
  active: boolean;
  lockedUntil: string | null;
  createdAt: string;
  vehicleCount: number;
};

type MemberRaw = {
  id: string;
  full_name: string;
  phone: string;
  active: boolean;
  locked_until: string | null;
  created_at: string;
  member_vehicles: { vehicle_id: string }[];
};

/** Text that is safe to put inside a PostgREST filter: no separators, wildcards or brackets. */
const safe = (text: string) => text.replace(/[%_,()*\\"]/g, " ").replace(/\s+/g, " ").trim();

/** The ids of members whose saved car matches a plate typed in the search box (0/O and 1/I look-alikes included). */
async function memberIdsByPlate(text: string): Promise<string[]> {
  const plate = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate.length < 2) return [];
  const cars = await db().from("vehicles").select("id").like("plate", `%${plate.replace(/[0O1I]/g, "_")}%`).limit(100);
  if (cars.error) fail(cars.error.message);
  const ids = (cars.data ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];
  const links = await db().from("member_vehicles").select("member_id").in("vehicle_id", ids).limit(200);
  if (links.error) fail(links.error.message);
  return [...new Set((links.data ?? []).map((l) => l.member_id as string))];
}

/** One page of members, newest first, narrowed by a name, phone or plate search, a status and whether they have saved cars. */
export async function searchMemberList(f: MemberFilter, page: number, size: number): Promise<{ rows: MemberListRow[]; total: number }> {
  const select = f.cars === "with" ? "id, full_name, phone, active, locked_until, created_at, member_vehicles!inner(vehicle_id)" : "id, full_name, phone, active, locked_until, created_at, member_vehicles(vehicle_id)";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db().from("members").select(select, { count: "exact" });
  const text = safe(f.q);
  if (text) {
    const conditions = [`full_name.ilike.%${text}%`];
    const digits = text.replace(/\D/g, "").replace(/^0/, "");
    if (digits.length >= 3 && digits.length >= text.replace(/[\s+\-()]/g, "").length - 1) conditions.push(`phone.like.%${digits}%`);
    const ids = await memberIdsByPlate(text);
    if (ids.length > 0) conditions.push(`id.in.(${ids.join(",")})`);
    query = query.or(conditions.join(","));
  }
  if (f.status) query = query.eq("active", f.status === "active");
  if (f.since) query = query.gte("created_at", f.since);
  if (f.cars === "none") query = query.is("member_vehicles", null);
  const from = (page - 1) * size;
  const { data, error, count } = await query.order("created_at", { ascending: false }).order("id").range(from, from + size - 1);
  if (error) fail(error.message);
  const rows = ((data ?? []) as MemberRaw[]).map((m) => ({
    id: m.id,
    fullName: m.full_name,
    phone: m.phone,
    active: m.active,
    lockedUntil: m.locked_until,
    createdAt: m.created_at,
    vehicleCount: m.member_vehicles.length,
  }));
  return { rows, total: count ?? 0 };
}

export type MemberSummary = { total: number; vehicles: number; newThisMonth: number; inactive: number };

/** Whole-register numbers. "Registered vehicles" counts the links between members and vehicles (a car saved by one member is one). */
export async function memberSummary(monthStartIso: string): Promise<MemberSummary> {
  const head = (table: string) => db().from(table).select("*", { count: "exact", head: true });
  const [total, vehicles, fresh, off] = await Promise.all([
    head("members"),
    head("member_vehicles"),
    head("members").gte("created_at", monthStartIso),
    head("members").eq("active", false),
  ]);
  for (const r of [total, vehicles, fresh, off]) if (r.error) fail(r.error.message);
  return { total: total.count ?? 0, vehicles: vehicles.count ?? 0, newThisMonth: fresh.count ?? 0, inactive: off.count ?? 0 };
}

/** Make a member (by an administrator). Returns the id, or "phone_taken" if that number already has an account. */
export async function createMemberAccount(v: { name: string; phone: string; pinHash: string | null; active: boolean }): Promise<string | "phone_taken"> {
  const { data, error } = await db()
    .from("members")
    .insert({ full_name: v.name, phone: v.phone, pin_hash: v.pinHash, active: v.active })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) return "phone_taken";
  if (error || !data) fail(error?.message ?? "no member");
  return data.id as string;
}

/** Change a member's name and phone number. Visits and saved cars are attached to the id, so nothing else moves. */
export async function updateMemberDetails(id: string, name: string, phone: string): Promise<"ok" | "phone_taken" | "not_found"> {
  const { data, error } = await db().from("members").update({ full_name: name, phone }).eq("id", id).select("id");
  if (error?.code === UNIQUE_VIOLATION) return "phone_taken";
  if (error) fail(error.message);
  return (data ?? []).length > 0 ? "ok" : "not_found";
}

/** Switch a member on or off. Returns false if there is no such member. */
export async function setMemberActive(id: string, active: boolean): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const { data, error } = await db().from("members").update({ active }).eq("id", id).select("id");
  if (error) fail(error.message);
  return (data ?? []).length > 0;
}
