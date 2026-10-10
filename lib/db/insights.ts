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
      .limit(2000),
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
