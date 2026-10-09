import type { CorrectionAction, CorrectionResult, RenameResult, VisitRow } from "@/lib/rules";
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
};

/** Open (unresolved) alerts, newest first. Never returns names or phone numbers. */
export async function listOpenAlerts(limit = 30): Promise<AlertRow[]> {
  const { data, error } = await db()
    .from("alerts")
    .select("id, kind, plate, detail, created_at, visits(areas(name), services(name))")
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
    visits: { areas: { name: string }; services: { name: string } } | null;
  }[];

  // Conflict alerts have no visit of their own, only the area and service ids in the detail.
  const [areas, services] = await Promise.all([
    db().from("areas").select("id, name"),
    db().from("services").select("id, name"),
  ]);
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
