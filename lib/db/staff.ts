import type { ReleaseStore } from "@/lib/rules/release";
import type { ScanDetail } from "@/lib/rules/scan";
import { isNewCar, normalisePhone, normalisePlate } from "@/lib/rules";
import { db } from "./client";
import type { Staff } from "./types";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

export async function getStaffByPhone(phone: string): Promise<Staff | null> {
  const { data, error } = await db().from("staff").select("*").eq("phone", phone).maybeSingle();
  if (error) fail(error.message);
  return data as Staff | null;
}

export async function getStaffById(id: string): Promise<Staff | null> {
  const { data, error } = await db().from("staff").select("*").eq("id", id).maybeSingle();
  if (error) fail(error.message);
  return data as Staff | null;
}

const DETAIL_SELECT =
  "id, status, reference, service_date, released_at, release_method, checked_in_at, held_at, vehicle_id, member_id, " +
  "vehicles(plate, make, colour), areas(id, name, slug), services(name), " +
  "members(full_name, phone), guests(full_name, phone), " +
  "releaser:staff!visits_released_by_fkey(full_name)";

type DetailRow = {
  id: string;
  vehicle_id: string;
  member_id: string | null;
  status: ScanDetail["status"];
  reference: string;
  service_date: string;
  released_at: string | null;
  release_method: string | null;
  held_at: string | null;
  checked_in_at: string;
  vehicles: { plate: string; make: string | null; colour: string | null };
  areas: { id: number; name: string; slug: string };
  services: { name: string };
  members: { full_name: string; phone: string } | null;
  guests: { full_name: string; phone: string } | null;
  releaser: { full_name: string } | null;
};

function toDetail(row: DetailRow): ScanDetail {
  const person = row.members ?? row.guests;
  return {
    visitId: row.id,
    status: row.status,
    reference: row.reference,
    serviceDate: row.service_date,
    plate: row.vehicles.plate,
    make: row.vehicles.make,
    colour: row.vehicles.colour,
    checkedInAt: row.checked_in_at,
    areaName: row.areas.name,
    areaId: row.areas.id,
    areaSlug: row.areas.slug,
    serviceName: row.services.name,
    isGuest: row.members === null,
    isNewCar: false, // filled in by withNewCarFlags
    fullName: person?.full_name ?? "",
    phone: person?.phone ?? "",
    releasedAt: row.released_at,
    held: row.held_at !== null,
    releasedByName: row.releaser?.full_name ?? null,
    releaseMethod: row.release_method,
  };
}

/** Marks member visits whose car was saved to the account within the last week. */
async function withNewCarFlags(rows: DetailRow[]): Promise<ScanDetail[]> {
  const details = rows.map(toDetail);
  const memberRows = rows.filter((r) => r.member_id);
  if (memberRows.length === 0) return details;

  const { data, error } = await db()
    .from("member_vehicles")
    .select("member_id, vehicle_id, added_at")
    .in("vehicle_id", memberRows.map((r) => r.vehicle_id));
  if (error) fail(error.message);

  const now = new Date();
  const added = new Map(
    (data ?? []).map((m) => [`${m.member_id}:${m.vehicle_id}`, m.added_at as string]),
  );
  return details.map((d, i) => ({
    ...d,
    isNewCar: rows[i].member_id
      ? isNewCar(added.get(`${rows[i].member_id}:${rows[i].vehicle_id}`) ?? null, now)
      : false,
  }));
}

export async function getScanDetailByToken(token: string): Promise<ScanDetail | null> {
  const { data, error } = await db()
    .from("visits")
    .select(DETAIL_SELECT)
    .eq("pass_token", token)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) return null;
  return (await withNewCarFlags([data as unknown as DetailRow]))[0];
}

/** Today's visits matching a plate, phone number or reference (EX-4). */
export async function searchTodaysVisits(query: string, today: string): Promise<ScanDetail[]> {
  const q = query.trim();
  if (!q) return [];
  let request = db()
    .from("visits")
    .select(DETAIL_SELECT)
    .eq("service_date", today)
    .order("checked_in_at", { ascending: false })
    .limit(10);

  if (/^PK-/i.test(q)) {
    request = request.eq("reference", q.toUpperCase());
  } else {
    const phone = normalisePhone(q);
    if (phone) {
      const [guests, members] = await Promise.all([
        db().from("guests").select("id").eq("phone", phone),
        db().from("members").select("id").eq("phone", phone),
      ]);
      const guestIds = (guests.data ?? []).map((g) => g.id as string);
      const memberIds = (members.data ?? []).map((m) => m.id as string);
      if (guestIds.length === 0 && memberIds.length === 0) return [];
      const filters = [
        guestIds.length ? `guest_id.in.(${guestIds.join(",")})` : null,
        memberIds.length ? `member_id.in.(${memberIds.join(",")})` : null,
      ].filter(Boolean);
      request = request.or(filters.join(","));
    } else {
      const plate = normalisePlate(q);
      if (plate.length < 3) return [];
      const { data: vehicles } = await db()
        .from("vehicles")
        .select("id")
        // 0/O and 1/I look alike on a plate, so each one matches either (_ is a single-character wildcard)
        .like("plate", `%${plate.replace(/[0O1I]/g, "_")}%`)
        .limit(20);
      const ids = (vehicles ?? []).map((v) => v.id as string);
      if (ids.length === 0) return [];
      request = request.in("vehicle_id", ids);
    }
  }
  const { data, error } = await request;
  if (error) fail(error.message);
  return withNewCarFlags((data ?? []) as unknown as DetailRow[]);
}

/** The full phone number for one visit. Only used by "Show number", which logs it. */
export async function getVisitPhone(visitId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("visits")
    .select("members(phone), guests(phone)")
    .eq("id", visitId)
    .maybeSingle();
  if (error) fail(error.message);
  const row = data as unknown as { members: { phone: string } | null; guests: { phone: string } | null } | null;
  return row?.members?.phone ?? row?.guests?.phone ?? null;
}

export async function logAudit(
  staffId: string,
  visitId: string | null,
  action: string,
  extra: { reason?: string; after?: Record<string, unknown> } = {},
): Promise<void> {
  const { error } = await db()
    .from("audit_events")
    .insert({ staff_id: staffId, visit_id: visitId, action, reason: extra.reason, after: extra.after });
  if (error) fail(error.message);
}

/**
 * Staff close a visit for a member who could not (QR check-in). A reason is required and is written to the audit log in the
 * same transaction. A visit on hold, or already closed, is refused.
 */
export async function staffCloseVisit(visitId: string, staffId: string, reason: string): Promise<"ok" | "not_found" | "bad_state" | "held" | "bad_input"> {
  const { data, error } = await db().rpc("staff_close_visit", { p_visit: visitId, p_staff: staffId, p_reason: reason });
  if (error) fail(error.message);
  return data as "ok" | "not_found" | "bad_state" | "held" | "bad_input";
}

/** "Does not match": hold the car and alert the coordinator (EX-5). */
export async function raiseNoMatch(staffId: string, visitId: string, plate: string): Promise<"ok" | "not_found" | "bad_state"> {
  const { data, error } = await db().rpc("hold_visit", { p_visit: visitId, p_staff: staffId });
  if (error) fail(error.message);
  if (data !== "ok") return data as "not_found" | "bad_state";
  const alert = await db()
    .from("alerts")
    .insert({ kind: "no_match", visit_id: visitId, plate, detail: { staff_id: staffId } });
  if (alert.error) fail(alert.error.message);
  return "ok";
}

/** A coordinator clears a hold. The reason is required and audited. */
export async function clearHold(visitId: string, staffId: string, reason: string): Promise<"ok" | "not_found" | "bad_state" | "bad_input"> {
  const { data, error } = await db().rpc("clear_hold", { p_visit: visitId, p_staff: staffId, p_reason: reason });
  if (error) fail(error.message);
  return data as "ok" | "not_found" | "bad_state" | "bad_input";
}

export const releaseStore: ReleaseStore = {
  async getVisitState(visitId) {
    const { data, error } = await db()
      .from("visits")
      .select("status, service_date, held_at")
      .eq("id", visitId)
      .maybeSingle();
    if (error) fail(error.message);
    if (!data) return null;
    const row = data as { status: "parked" | "released" | "missed"; service_date: string; held_at: string | null };
    return { status: row.status, service_date: row.service_date, held: row.held_at !== null };
  },

  async release(visitId, staffId, method, today) {
    const { data, error } = await db().rpc("release_visit", {
      p_visit: visitId,
      p_staff: staffId,
      p_method: method,
      p_today: today,
    });
    if (error) fail(error.message);
    return data !== null;
  },
};
