import { plateLikePattern, type VisitListRow, type VisitStatus } from "@/lib/rules/visit-list";
import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

// ---------- Vehicles (admin) ----------

export type VehicleSummary = {
  id: string;
  plate: string;
  make: string | null;
  colour: string | null;
  /** A member's saved car. Names and phone numbers are never listed here. */
  isMember: boolean;
  visits: number;
  lastSeen: string | null;
  lastStatus: "parked" | "released" | "missed" | null;
  lastVisitId: string | null;
  lastAreaName: string | null;
};

type VisitLite = {
  id: string;
  vehicle_id: string;
  status: "parked" | "released" | "missed";
  checked_in_at: string;
  areas: { name: string } | null;
};

/**
 * Cars the church has seen. With a search, the plates that match (0/O and 1/I look-alikes
 * included). Without one, the cars seen most recently.
 */
export async function listVehicles(search: string, limit = 40): Promise<VehicleSummary[]> {
  let vehicleIds: string[];
  if (search.length >= 2) {
    const { data, error } = await db()
      .from("vehicles")
      .select("id")
      .like("plate", `%${search.replace(/[0O1I]/g, "_")}%`)
      .limit(limit);
    if (error) fail(error.message);
    vehicleIds = (data ?? []).map((v) => v.id as string);
  } else {
    const { data, error } = await db()
      .from("visits")
      .select("vehicle_id")
      .order("checked_in_at", { ascending: false })
      .limit(limit * 4);
    if (error) fail(error.message);
    vehicleIds = [...new Set((data ?? []).map((v) => v.vehicle_id as string))].slice(0, limit);
  }
  if (vehicleIds.length === 0) return [];

  const [vehicles, visits, members] = await Promise.all([
    db().from("vehicles").select("id, plate, make, colour").in("id", vehicleIds),
    db()
      .from("visits")
      .select("id, vehicle_id, status, checked_in_at, areas(name)")
      .in("vehicle_id", vehicleIds)
      .order("checked_in_at", { ascending: false })
      .limit(6000),
    db().from("member_vehicles").select("vehicle_id").in("vehicle_id", vehicleIds),
  ]);
  if (vehicles.error) fail(vehicles.error.message);
  if (visits.error) fail(visits.error.message);
  if (members.error) fail(members.error.message);

  const memberCars = new Set((members.data ?? []).map((m) => m.vehicle_id as string));
  const byVehicle = new Map<string, VisitLite[]>();
  for (const v of (visits.data ?? []) as unknown as VisitLite[]) {
    byVehicle.set(v.vehicle_id, [...(byVehicle.get(v.vehicle_id) ?? []), v]);
  }

  return ((vehicles.data ?? []) as { id: string; plate: string; make: string | null; colour: string | null }[])
    .map((v) => {
      const list = byVehicle.get(v.id) ?? [];
      const last = list[0];
      return {
        id: v.id,
        plate: v.plate,
        make: v.make,
        colour: v.colour,
        isMember: memberCars.has(v.id),
        visits: list.length,
        lastSeen: last?.checked_in_at ?? null,
        lastStatus: last?.status ?? null,
        lastVisitId: last?.id ?? null,
        lastAreaName: last?.areas?.name ?? null,
      };
    })
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

// ---------- One visit in full (coordinators and admins) ----------

export type TimelineEvent = { at: string; what: string; by: string | null; reason: string | null };

export type VisitDetail = {
  id: string;
  reference: string;
  passToken: string;
  status: "parked" | "released" | "missed";
  serviceDate: string;
  plate: string;
  make: string | null;
  colour: string | null;
  serviceName: string;
  areaName: string;
  checkedInAt: string;
  checkedInBy: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseMethod: string | null;
  held: boolean;
  isGuest: boolean;
  /** First name and the last 4 phone digits only (R-9). */
  firstName: string;
  phoneLast4: string;
  timeline: TimelineEvent[];
};

const ACTION_WORDS: Record<string, string> = {
  release: "Released",
  hold: "Put on hold (Does not match)",
  clear_hold: "Hold cleared",
  no_match: "Does not match was tapped",
  sweep_gone: "Marked Gone in the sweep",
  sweep_still_here: "Marked Still here in the sweep",
  midnight_close: "Closed automatically at midnight",
  change_area: "Moved to another car park",
  change_service: "Service changed",
  reopen: "Reopened (undone)",
  close: "Closed by a coordinator",
  reveal_phone: "Phone number was shown",
  manual_register: "Registered by hand",
  register_for_member: "Registered for the member",
};

type AuditRow = {
  action: string;
  reason: string | null;
  created_at: string;
  staff: { full_name: string } | null;
};

export async function getVisitDetail(id: string): Promise<VisitDetail | null> {
  const { data, error } = await db()
    .from("visits")
    .select(
      "id, reference, pass_token, status, service_date, checked_in_at, released_at, release_method, held_at, " +
        "vehicles(plate, make, colour), services(name), areas(name), members(full_name, phone), guests(full_name, phone), " +
        "checked_in:checked_in_by(full_name), released:released_by(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) return null;
  const v = data as unknown as {
    id: string;
    reference: string;
    pass_token: string;
    status: "parked" | "released" | "missed";
    service_date: string;
    checked_in_at: string;
    released_at: string | null;
    release_method: string | null;
    held_at: string | null;
    vehicles: { plate: string; make: string | null; colour: string | null };
    services: { name: string };
    areas: { name: string };
    members: { full_name: string; phone: string } | null;
    guests: { full_name: string; phone: string } | null;
    checked_in: { full_name: string } | null;
    released: { full_name: string } | null;
  };

  const events = await db()
    .from("audit_events")
    .select("action, reason, created_at, staff:staff_id(full_name)")
    .eq("visit_id", id)
    .order("created_at", { ascending: true });
  if (events.error) fail(events.error.message);

  const person = v.members ?? v.guests;
  const timeline: TimelineEvent[] = [
    { at: v.checked_in_at, what: "Checked in", by: v.checked_in?.full_name ?? null, reason: null },
    ...((events.data ?? []) as unknown as AuditRow[]).map((e) => ({
      at: e.created_at,
      what: ACTION_WORDS[e.action] ?? e.action.replace(/_/g, " "),
      by: e.staff?.full_name ?? null,
      reason: e.reason,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    id: v.id,
    reference: v.reference,
    passToken: v.pass_token,
    status: v.status,
    serviceDate: v.service_date,
    plate: v.vehicles.plate,
    make: v.vehicles.make,
    colour: v.vehicles.colour,
    serviceName: v.services.name,
    areaName: v.areas.name,
    checkedInAt: v.checked_in_at,
    checkedInBy: v.checked_in?.full_name ?? null,
    releasedAt: v.released_at,
    releasedBy: v.released?.full_name ?? null,
    releaseMethod: v.release_method,
    held: v.held_at !== null,
    isGuest: v.members === null,
    firstName: (person?.full_name ?? "").trim().split(/\s+/)[0] ?? "",
    phoneLast4: (person?.phone ?? "").slice(-4),
    timeline,
  };
}

// ---------- The activity log (admin) ----------

export type AuditEntry = { id: number; at: string; what: string; by: string | null; reason: string | null; visitId: string | null };

const MORE_WORDS: Record<string, string> = {
  rename_area: "Car park renamed",
  area_create: "Car park added",
  area_activate: "Car park switched on",
  area_deactivate: "Car park switched off",
  service_create: "Service added",
  service_update: "Service changed",
  staff_create: "Staff account created",
  staff_role: "Staff role changed",
  staff_activate: "Staff account switched on",
  staff_deactivate: "Staff account switched off",
  staff_password_reset: "Staff password reset",
  staff_edit: "Staff name or phone changed",
  member_pin_reset: "Member PIN reset",
  export_report: "Report exported",
};

/** The most recent staff and admin actions, newest first. Names of staff only: never a driver's details. */
export async function listAuditEntries(limit = 60): Promise<AuditEntry[]> {
  const { data, error } = await db()
    .from("audit_events")
    .select("id, action, reason, created_at, visit_id, staff:staff_id(full_name)")
    .order("id", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);
  return ((data ?? []) as unknown as (AuditRow & { id: number; visit_id: string | null })[]).map((e) => ({
    id: e.id,
    at: e.created_at,
    what: MORE_WORDS[e.action] ?? ACTION_WORDS[e.action] ?? e.action.replace(/_/g, " "),
    by: e.staff?.full_name ?? null,
    reason: e.reason,
    visitId: e.visit_id,
  }));
}

// ---------- Every visit on one day (admin) ----------

export type DayVisit = {
  id: string;
  plate: string;
  areaName: string;
  areaSlug: string;
  serviceId: number;
  serviceName: string;
  status: "parked" | "released" | "missed";
  checkedInAt: string;
  releasedAt: string | null;
  member: boolean;
  held: boolean;
};

/** Every visit on a service date, newest first. No names or phone numbers: those stay behind "Show number" on the visit. */
export async function listVisitsOn(date: string, limit = 1000): Promise<DayVisit[]> {
  const { data, error } = await db()
    .from("visits")
    .select("id, status, checked_in_at, released_at, held_at, member_id, service_id, vehicles(plate), areas(name, slug), services(name)")
    .eq("service_date", date)
    .order("checked_in_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);
  type Row = {
    id: string;
    status: DayVisit["status"];
    checked_in_at: string;
    released_at: string | null;
    held_at: string | null;
    member_id: string | null;
    service_id: number;
    vehicles: { plate: string } | null;
    areas: { name: string; slug: string } | null;
    services: { name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    plate: r.vehicles?.plate ?? "",
    areaName: r.areas?.name ?? "",
    areaSlug: r.areas?.slug ?? "",
    serviceId: r.service_id,
    serviceName: r.services?.name ?? "",
    status: r.status,
    checkedInAt: r.checked_in_at,
    releasedAt: r.released_at,
    member: r.member_id !== null,
    held: r.held_at !== null,
  }));
}

// ---------- What each person on the team did lately (admin) ----------

/** For each member of staff, their most recent recorded actions (newest first). Staff only: no driver details. */
export async function recentActivityByStaff(perPerson = 4): Promise<Map<string, { at: string; what: string }[]>> {
  const { data, error } = await db()
    .from("audit_events")
    .select("staff_id, action, created_at")
    .not("staff_id", "is", null)
    .order("id", { ascending: false })
    .limit(1500);
  if (error) fail(error.message);
  const out = new Map<string, { at: string; what: string }[]>();
  for (const e of (data ?? []) as { staff_id: string; action: string; created_at: string }[]) {
    const list = out.get(e.staff_id) ?? [];
    if (list.length < perPerson) {
      list.push({ at: e.created_at, what: MORE_WORDS[e.action] ?? ACTION_WORDS[e.action] ?? e.action.replace(/_/g, " ") });
      out.set(e.staff_id, list);
    }
  }
  return out;
}

// ---------- Cars parked right now (admin analytics) ----------

/** Every car that is parked at this moment, with its car park and service. A live snapshot, not a historical figure. */
export async function listParkedNow(): Promise<{ areaId: number; areaName: string; serviceId: number }[]> {
  const { data, error } = await db().from("visits").select("area_id, service_id, areas(name)").eq("status", "parked").limit(5000);
  if (error) fail(error.message);
  return ((data ?? []) as unknown as { area_id: number; service_id: number; areas: { name: string } | null }[]).map((r) => ({
    areaId: r.area_id,
    areaName: r.areas?.name ?? "",
    serviceId: r.service_id,
  }));
}

// ---------- The Visits screen: a filtered, paged list of visits ----------

export type VisitFilter = {
  from: string;
  to: string;
  serviceId: number | null;
  areaId: number | null;
  status: VisitStatus | null;
  /** A normalised plate, or "" for no plate search. */
  plate: string;
};

const VISIT_LIST_SELECT =
  "id, status, checked_in_at, released_at, release_method, reference, member_id, held_at, service_id, area_id, " +
  "vehicles!inner(plate, make, colour), areas(name, slug), services(name), staff:released_by(full_name)";

type VisitListJoin = {
  id: string;
  status: VisitStatus;
  checked_in_at: string;
  released_at: string | null;
  release_method: VisitListRow["releaseMethod"];
  reference: string;
  member_id: string | null;
  held_at: string | null;
  service_id: number;
  area_id: number;
  vehicles: { plate: string; make: string | null; colour: string | null };
  areas: { name: string; slug: string } | null;
  services: { name: string } | null;
  staff: { full_name: string } | null;
};

/** Applies the filters to a visits query. The plate filter needs the vehicles join (vehicles!inner). */
// The query builder's chained types are very large, so it is handled loosely here and returned as it came in.
function filtered<Q>(query: Q, f: VisitFilter, withStatus = true): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (query as any).gte("service_date", f.from).lte("service_date", f.to);
  if (f.serviceId !== null) q = q.eq("service_id", f.serviceId);
  if (f.areaId !== null) q = q.eq("area_id", f.areaId);
  if (withStatus && f.status) q = q.eq("status", f.status);
  if (f.plate) q = q.like("vehicles.plate", plateLikePattern(f.plate));
  return q as Q;
}

const toListRow = (r: VisitListJoin): VisitListRow => ({
  id: r.id,
  plate: r.vehicles.plate,
  make: r.vehicles.make,
  colour: r.vehicles.colour,
  member: r.member_id !== null,
  serviceId: r.service_id,
  serviceName: r.services?.name ?? "",
  areaId: r.area_id,
  areaName: r.areas?.name ?? "",
  areaSlug: r.areas?.slug ?? "",
  status: r.status,
  checkedInAt: r.checked_in_at,
  releasedAt: r.released_at,
  releaseMethod: r.release_method,
  releasedBy: r.staff?.full_name ?? null,
  reference: r.reference,
  held: r.held_at !== null,
});

/** One page of visits matching the filters, newest first, and how many match in all. */
export async function searchVisits(f: VisitFilter, page: number, size: number): Promise<{ rows: VisitListRow[]; total: number }> {
  const start = (page - 1) * size;
  const { data, error, count } = await filtered(db().from("visits").select(VISIT_LIST_SELECT, { count: "exact" }), f)
    .order("checked_in_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + size - 1);
  if (error) fail(error.message);
  return { rows: ((data ?? []) as unknown as VisitListJoin[]).map(toListRow), total: count ?? 0 };
}

/** Every visit matching the filters (for the export), oldest first. */
export async function listMatchingVisits(f: VisitFilter, max = 50_000): Promise<VisitListRow[]> {
  const out: VisitListRow[] = [];
  for (let start = 0; start < max; start += 1000) {
    const { data, error } = await filtered(db().from("visits").select(VISIT_LIST_SELECT), f)
      .order("checked_in_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + 999);
    if (error) fail(error.message);
    const rows = (data ?? []) as unknown as VisitListJoin[];
    out.push(...rows.map(toListRow));
    if (rows.length < 1000) break;
  }
  return out;
}

/** How many visits in the period (and service, car park and plate) have each status. The status filter is not applied. */
export async function countVisitsByStatus(f: VisitFilter): Promise<Record<VisitStatus, number>> {
  const one = async (status: VisitStatus) => {
    const { count, error } = await filtered(db().from("visits").select("id, vehicles!inner(plate)", { count: "exact", head: true }), { ...f, status }, true);
    if (error) fail(error.message);
    return count ?? 0;
  };
  const [parked, released, missed] = await Promise.all([one("parked"), one("released"), one("missed")]);
  return { parked, released, missed };
}

/** Cars checked in and not released right now, whatever the dates. Limited only by service and car park. */
export async function countParkedNowIn(serviceId: number | null, areaId: number | null): Promise<number> {
  let q = db().from("visits").select("id", { count: "exact", head: true }).eq("status", "parked");
  if (serviceId !== null) q = q.eq("service_id", serviceId);
  if (areaId !== null) q = q.eq("area_id", areaId);
  const { count, error } = await q;
  if (error) fail(error.message);
  return count ?? 0;
}
