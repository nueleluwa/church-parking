import type { CorrectionAction, CorrectionResult, OnSiteVisit, RenameResult, VisitRow } from "@/lib/rules";
import { db } from "./client";
import { logAudit } from "./staff";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

/** Every visit today, with only the fields the dashboard counts need. */
export async function listTodaysVisitRows(today: string): Promise<VisitRow[]> {
  const { data, error } = await db()
    .from("visits")
    .select("service_id, area_id, status")
    .eq("service_date", today);
  if (error) fail(error.message);
  return (data ?? []) as VisitRow[];
}

export type AlertRow = {
  id: number;
  kind: string;
  plate: string | null;
  created_at: string;
  areaName: string | null;
  serviceName: string | null;
  /** The visit the alert is about, when it has one (a conflict alert has none). */
  visitId: string | null;
  make: string | null;
  colour: string | null;
};

/** Open (unresolved) alerts, newest first. Never returns names or phone numbers. */
export async function listOpenAlerts(limit = 30): Promise<AlertRow[]> {
  const { data, error } = await db()
    .from("alerts")
    .select("id, kind, plate, detail, created_at, visit_id, visits(areas(name), services(name), vehicles(make, colour))")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);

  const rows = (data ?? []) as unknown as {
    id: number;
    kind: string;
    plate: string | null;
    detail: { area_id?: number; service_id?: number } | null;
    created_at: string;
    visit_id: string | null;
    visits: { areas: { name: string }; services: { name: string }; vehicles: { make: string | null; colour: string | null } | null } | null;
  }[];

  // Conflict alerts have no visit of their own, only the area and service ids in the detail.
  const [areas, services] = await Promise.all([
    db().from("areas").select("id, name"),
    db().from("services").select("id, name"),
  ]);
  // A conflict alert has no visit, so the car's details come from its plate
  const plates = [...new Set(rows.filter((r) => !r.visits && r.plate).map((r) => r.plate as string))];
  const cars = plates.length ? await db().from("vehicles").select("plate, make, colour").in("plate", plates) : { data: [] };
  const carByPlate = new Map((cars.data ?? []).map((c) => [c.plate as string, c as { make: string | null; colour: string | null }]));
  const areaName = new Map((areas.data ?? []).map((a) => [a.id as number, a.name as string]));
  const serviceName = new Map((services.data ?? []).map((s) => [s.id as number, s.name as string]));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    plate: r.plate,
    created_at: r.created_at,
    areaName: r.visits?.areas.name ?? (r.detail?.area_id ? (areaName.get(r.detail.area_id) ?? null) : null),
    serviceName:
      r.visits?.services.name ?? (r.detail?.service_id ? (serviceName.get(r.detail.service_id) ?? null) : null),
    visitId: r.visit_id,
    make: r.visits?.vehicles?.make ?? (r.plate ? (carByPlate.get(r.plate)?.make ?? null) : null),
    colour: r.visits?.vehicles?.colour ?? (r.plate ? (carByPlate.get(r.plate)?.colour ?? null) : null),
  }));
}

export async function resolveAlert(alertId: number, staffId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("alerts")
    .update({ resolved_by: staffId, resolved_at: new Date().toISOString() })
    .eq("id", alertId)
    .is("resolved_at", null)
    .select("id");
  if (error) fail(error.message);
  if (!data || data.length === 0) return false;
  await logAudit(staffId, null, "resolve_alert", { after: { alert_id: alertId } });
  return true;
}

export type SweepRow = {
  visitId: string;
  plate: string;
  reference: string;
  areaId: number;
  areaName: string;
  serviceName: string;
  firstName: string;
  isGuest: boolean;
};

/**
 * Cars still parked at the end of a service: everything parked today that
 * was checked in for this service or an earlier one, except cars already
 * marked "Still here" in this service's sweep (OP-2, R-3).
 */
export async function listSweepRows(
  serviceId: number,
  serviceStart: string,
  today: string,
): Promise<SweepRow[]> {
  const { data: services, error: sErr } = await db().from("services").select("id, starts_at");
  if (sErr) fail(sErr.message);
  const upTo = (services ?? [])
    .filter((s) => (s.starts_at as string) <= serviceStart)
    .map((s) => s.id as number);

  const { data, error } = await db()
    .from("visits")
    .select("id, reference, area_id, vehicles(plate), areas(name), services(name), members(full_name), guests(full_name)")
    .eq("service_date", today)
    .eq("status", "parked")
    .in("service_id", upTo);
  if (error) fail(error.message);

  const rows = (data ?? []) as unknown as {
    id: string;
    reference: string;
    area_id: number;
    vehicles: { plate: string };
    areas: { name: string };
    services: { name: string };
    members: { full_name: string } | null;
    guests: { full_name: string } | null;
  }[];
  if (rows.length === 0) return [];

  const checked = await db()
    .from("audit_events")
    .select("visit_id, after")
    .eq("action", "sweep_still_here")
    .in("visit_id", rows.map((r) => r.id));
  if (checked.error) fail(checked.error.message);
  const alreadyChecked = new Set(
    (checked.data ?? [])
      .filter((e) => (e.after as { sweep_service_id?: number } | null)?.sweep_service_id === serviceId)
      .map((e) => e.visit_id as string),
  );

  return rows
    .filter((r) => !alreadyChecked.has(r.id))
    .map((r) => ({
      visitId: r.id,
      plate: r.vehicles.plate,
      reference: r.reference,
      areaId: r.area_id,
      areaName: r.areas.name,
      serviceName: r.services.name,
      firstName: (r.members ?? r.guests)?.full_name.trim().split(/\s+/)[0] ?? "",
      isGuest: r.members === null,
    }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName) || a.plate.localeCompare(b.plate));
}

export async function sweepVisit(
  visitId: string,
  staffId: string,
  gone: boolean,
  serviceId: number,
): Promise<"ok" | "not_found" | "bad_state"> {
  const { data, error } = await db().rpc("sweep_visit", {
    p_visit: visitId,
    p_staff: staffId,
    p_gone: gone,
    p_service: serviceId,
  });
  if (error) fail(error.message);
  return data as "ok" | "not_found" | "bad_state";
}

export async function correctVisit(input: {
  visitId: string;
  staffId: string;
  action: CorrectionAction;
  reason: string;
  areaId?: number;
  serviceId?: number;
}): Promise<CorrectionResult> {
  const { data, error } = await db().rpc("correct_visit", {
    p_visit: input.visitId,
    p_staff: input.staffId,
    p_action: input.action,
    p_reason: input.reason,
    p_area: input.areaId ?? null,
    p_service: input.serviceId ?? null,
  });
  if (error) fail(error.message);
  return data as CorrectionResult;
}

export type AreaRecord = { id: number; name: string; slug: string; active: boolean };

/** Every car park, including any switched off, for the admin screen. */
export async function listAllAreas(): Promise<AreaRecord[]> {
  const { data, error } = await db().from("areas").select("id, name, slug, active").order("sort").order("id");
  if (error) fail(error.message);
  return (data ?? []) as AreaRecord[];
}

/**
 * Rename a car park by its id. The id and the QR address (slug) never change, so
 * every visit and sign keeps pointing at the same car park. The rename and its
 * audit row happen together in the database.
 */
export async function renameArea(areaId: number, staffId: string, name: string): Promise<RenameResult> {
  const { data, error } = await db().rpc("rename_area", { p_area: areaId, p_staff: staffId, p_name: name });
  if (error) fail(error.message);
  return data as RenameResult;
}

export type ActivityEvent = {
  key: string;
  /** entry: the driver checked in. exit: an attendant released the car. closed: the visit was closed (sweep or midnight). */
  kind: "entry" | "exit" | "closed";
  at: string;
  plate: string;
  make: string | null;
  colour: string | null;
  areaName: string;
  serviceName: string;
  /** A staff-only link to the pass, so a tapped row opens that car. */
  passToken: string;
};

/**
 * Today's check-ins and releases, newest first, for the Recent Scans screen. Each visit gives
 * one "entry" event, and a second event when it was released or closed. Real records only.
 */
export async function listRecentActivity(today: string, limit = 40): Promise<ActivityEvent[]> {
  const { data, error } = await db()
    .from("visits")
    .select(
      "id, checked_in_at, released_at, status, pass_token, vehicles(plate, make, colour), areas(name), services(name)",
    )
    .eq("service_date", today)
    .order("checked_in_at", { ascending: false })
    .limit(200);
  if (error) fail(error.message);

  const rows = (data ?? []) as unknown as {
    id: string;
    checked_in_at: string;
    released_at: string | null;
    status: "parked" | "released" | "missed";
    pass_token: string;
    vehicles: { plate: string; make: string | null; colour: string | null };
    areas: { name: string };
    services: { name: string };
  }[];

  const events: ActivityEvent[] = [];
  for (const r of rows) {
    const base = {
      plate: r.vehicles.plate,
      make: r.vehicles.make,
      colour: r.vehicles.colour,
      areaName: r.areas.name,
      serviceName: r.services.name,
      passToken: r.pass_token,
    };
    events.push({ ...base, key: `${r.id}-in`, kind: "entry", at: r.checked_in_at });
    if (r.released_at && r.status !== "parked") {
      events.push({ ...base, key: `${r.id}-out`, kind: r.status === "released" ? "exit" : "closed", at: r.released_at });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------- The Sweep screen ----------

/** Every car recorded as parked right now (each car has at most one open visit), with its service times and any "Still here" marks. */
export async function listOnSite(): Promise<OnSiteVisit[]> {
  const { data, error } = await db()
    .from("visits")
    .select("id, service_id, area_id, service_date, checked_in_at, held_at, member_id, vehicles(plate, make, colour), areas(name, slug), services(name, starts_at, ends_at)")
    .eq("status", "parked")
    .order("checked_in_at", { ascending: true })
    .limit(5000);
  if (error) fail(error.message);
  const rows = (data ?? []) as unknown as {
    id: string;
    service_id: number;
    area_id: number;
    service_date: string;
    checked_in_at: string;
    held_at: string | null;
    member_id: string | null;
    vehicles: { plate: string; make: string | null; colour: string | null };
    areas: { name: string; slug: string };
    services: { name: string; starts_at: string; ends_at: string };
  }[];
  if (rows.length === 0) return [];

  // The "Still here" marks, kept in the audit log: which service's sweep each was for
  const earliest = rows.map((r) => r.service_date).sort()[0];
  const marks = new Map<string, number[]>();
  for (let start = 0; start < 20_000; start += 1000) {
    const { data: events, error: markError } = await db()
      .from("audit_events")
      .select("visit_id, after")
      .eq("action", "sweep_still_here")
      .gte("created_at", `${earliest}T00:00:00+01:00`)
      .order("id", { ascending: true })
      .range(start, start + 999);
    if (markError) fail(markError.message);
    for (const e of (events ?? []) as { visit_id: string; after: { sweep_service_id?: number } | null }[]) {
      const sweep = e.after?.sweep_service_id;
      if (typeof sweep === "number") marks.set(e.visit_id, [...(marks.get(e.visit_id) ?? []), sweep]);
    }
    if ((events ?? []).length < 1000) break;
  }

  return rows.map((r) => ({
    id: r.id,
    plate: r.vehicles.plate,
    make: r.vehicles.make,
    colour: r.vehicles.colour,
    member: r.member_id !== null,
    serviceId: r.service_id,
    serviceName: r.services.name,
    serviceStart: r.services.starts_at,
    serviceEnd: r.services.ends_at,
    serviceDate: r.service_date,
    areaId: r.area_id,
    areaName: r.areas.name,
    areaSlug: r.areas.slug,
    checkedInAt: r.checked_in_at,
    held: r.held_at !== null,
    stillHereIn: marks.get(r.id) ?? [],
  }));
}

/** Cars released at the exit since 00:00 today (Lagos). Cars closed as missed are not releases and are not counted. */
export async function countReleasedToday(today: string): Promise<number> {
  const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const { count, error } = await db()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("status", "released")
    .gte("released_at", `${today}T00:00:00+01:00`)
    .lt("released_at", `${next}T00:00:00+01:00`);
  if (error) fail(error.message);
  return count ?? 0;
}

/** The service each of these visits belongs to, for visits still parked. The server looks this up itself rather than trusting the browser. */
export async function openVisitServices(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db().from("visits").select("id, service_id").eq("status", "parked").in("id", ids.slice(i, i + 100));
    if (error) fail(error.message);
    for (const r of (data ?? []) as { id: string; service_id: number }[]) out.set(r.id, r.service_id);
  }
  return out;
}

export type SweepHistoryRow = {
  id: number;
  at: string;
  outcome: "still_here" | "gone";
  visitId: string;
  plate: string;
  serviceName: string;
  areaName: string;
  sweepServiceName: string | null;
  staff: string | null;
};

export type SweepHistoryFilter = { from: string; to: string; outcome: "still_here" | "gone" | null };

/** Recorded sweep outcomes (Still here and Gone), newest first, a page at a time. Nothing is invented: only what staff recorded. */
export async function listSweepHistory(f: SweepHistoryFilter, page: number, size: number): Promise<{ rows: SweepHistoryRow[]; total: number }> {
  const next = new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const actions = f.outcome === "still_here" ? ["sweep_still_here"] : f.outcome === "gone" ? ["sweep_gone"] : ["sweep_still_here", "sweep_gone"];
  const start = (page - 1) * size;
  const { data, error, count } = await db()
    .from("audit_events")
    .select("id, action, created_at, visit_id, after, staff:staff_id(full_name), visits(vehicles(plate), areas(name), services(name))", { count: "exact" })
    .in("action", actions)
    .gte("created_at", `${f.from}T00:00:00+01:00`)
    .lt("created_at", `${next}T00:00:00+01:00`)
    .order("id", { ascending: false })
    .range(start, start + size - 1);
  if (error) fail(error.message);
  const rows = (data ?? []) as unknown as {
    id: number;
    action: string;
    created_at: string;
    visit_id: string;
    after: { sweep_service_id?: number } | null;
    staff: { full_name: string } | null;
    visits: { vehicles: { plate: string }; areas: { name: string }; services: { name: string } } | null;
  }[];
  const { data: services } = await db().from("services").select("id, name");
  const serviceName = new Map((services ?? []).map((s) => [s.id as number, s.name as string]));
  return {
    total: count ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      outcome: r.action === "sweep_gone" ? "gone" : "still_here",
      visitId: r.visit_id,
      plate: r.visits?.vehicles.plate ?? "",
      serviceName: r.visits?.services.name ?? "",
      areaName: r.visits?.areas.name ?? "",
      sweepServiceName: r.after?.sweep_service_id ? (serviceName.get(r.after.sweep_service_id) ?? null) : null,
      staff: r.staff?.full_name ?? null,
    })),
  };
}
