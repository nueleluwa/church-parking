import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

export type PeriodScope = { from: string; to: string; serviceId: number | null };

/** Visits whose service date is in the period (and, if chosen, of that service and car park). Same definition as the Visits screen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inPeriod(query: any, s: PeriodScope, areaId: number | null = null): any {
  let q = query.gte("service_date", s.from).lte("service_date", s.to);
  if (s.serviceId !== null) q = q.eq("service_id", s.serviceId);
  if (areaId !== null) q = q.eq("area_id", areaId);
  return q;
}

async function countVisits(s: PeriodScope, areaId: number | null, released: boolean): Promise<number> {
  let q = inPeriod(db().from("visits").select("id", { count: "exact", head: true }), s, areaId);
  if (released) q = q.eq("status", "released");
  const { count, error } = await q;
  if (error) fail(error.message);
  return count ?? 0;
}

async function countParked(serviceId: number | null, areaId: number | null): Promise<number> {
  let q = db().from("visits").select("id", { count: "exact", head: true }).eq("status", "parked");
  if (serviceId !== null) q = q.eq("service_id", serviceId);
  if (areaId !== null) q = q.eq("area_id", areaId);
  const { count, error } = await q;
  if (error) fail(error.message);
  return count ?? 0;
}

export type AreaFigures = { areaId: number; checkedIn: number; released: number; parkedNow: number };
export type DashboardFigures = { checkedIn: number; released: number; parkedNow: number; areas: AreaFigures[] };

/**
 * The dashboard's numbers, as head counts run side by side (nothing is downloaded). Checked in counts every visit made in the
 * period; released counts those released at the exit (a visit closed as missed is not a release). Parked now is live. The totals
 * are counted on their own, so a visit in a car park that was later switched off is still in the total.
 */
export async function loadDashboardFigures(s: PeriodScope, areaIds: number[]): Promise<DashboardFigures> {
  const [checkedIn, released, parkedNow, areas] = await Promise.all([
    countVisits(s, null, false),
    countVisits(s, null, true),
    countParked(s.serviceId, null),
    Promise.all(
      areaIds.map(async (areaId) => {
        const [ci, rel, parked] = await Promise.all([countVisits(s, areaId, false), countVisits(s, areaId, true), countParked(s.serviceId, areaId)]);
        return { areaId, checkedIn: ci, released: rel, parkedNow: parked };
      }),
    ),
  ]);
  return { checkedIn, released, parkedNow, areas };
}

export type PeriodEvent = {
  key: string;
  visitId: string;
  /** entry: a successful check-in. exit: a recorded release at the exit. A visit closed as missed is neither. */
  kind: "entry" | "exit";
  at: string;
  plate: string;
  areaName: string;
  areaSlug: string;
  serviceName: string;
};

type Raw = {
  id: string;
  checked_in_at: string;
  released_at: string | null;
  vehicles: { plate: string } | null;
  areas: { name: string; slug: string } | null;
  services: { name: string } | null;
};

const SELECT = "id, checked_in_at, released_at, vehicles(plate), areas(name, slug), services(name)";

/**
 * The latest check-ins and releases of the period, newest first. Each check-in is an "entry" at the time the car was checked in,
 * and each release is an "exit" at the time it was released. A car is never shown as leaving because it disappeared from a list.
 */
export async function listPeriodActivity(s: PeriodScope, limit: number): Promise<PeriodEvent[]> {
  const [entries, exits] = await Promise.all([
    inPeriod(db().from("visits").select(SELECT), s).order("checked_in_at", { ascending: false }).limit(limit),
    inPeriod(db().from("visits").select(SELECT), s).eq("status", "released").not("released_at", "is", null).order("released_at", { ascending: false }).limit(limit),
  ]);
  if (entries.error) fail(entries.error.message);
  if (exits.error) fail(exits.error.message);

  const make = (r: Raw, kind: "entry" | "exit", at: string): PeriodEvent => ({
    key: `${r.id}-${kind}`,
    visitId: r.id,
    kind,
    at,
    plate: r.vehicles?.plate ?? "",
    areaName: r.areas?.name ?? "",
    areaSlug: r.areas?.slug ?? "",
    serviceName: r.services?.name ?? "",
  });
  const events = [
    ...((entries.data ?? []) as Raw[]).map((r) => make(r, "entry", r.checked_in_at)),
    ...((exits.data ?? []) as Raw[]).map((r) => make(r, "exit", r.released_at as string)),
  ];
  return events.sort((a, b) => b.at.localeCompare(a.at) || (a.kind === "exit" ? -1 : 1)).slice(0, limit);
}
