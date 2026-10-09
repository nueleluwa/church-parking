export type VisitRow = {
  service_id: number;
  area_id: number;
  status: "parked" | "released" | "missed";
};

export type ServiceInfo = { id: number; starts_at: string };
export type AreaInfo = { id: number; name: string };

export type AreaCounts = {
  areaId: number;
  areaName: string;
  /** Cars checked in for the selected service. */
  checkedIn: number;
  released: number;
  /** Still parked from the selected service. */
  parked: number;
  missed: number;
  /** Cars checked in for an earlier service today that are still here. */
  carriedOver: number;
};

export type DashboardSummary = {
  areas: AreaCounts[];
  totals: Omit<AreaCounts, "areaId" | "areaName">;
};

const toMinutes = (t: string) => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/**
 * Live counts for one service, per area (OP-1, D-05: car counts, not spaces
 * left). A car still parked from an earlier service counts as carried over.
 */
export function summariseVisits(
  rows: VisitRow[],
  areas: AreaInfo[],
  services: ServiceInfo[],
  serviceId: number,
): DashboardSummary {
  const start = new Map(services.map((s) => [s.id, toMinutes(s.starts_at)]));
  const selectedStart = start.get(serviceId) ?? 0;

  const byArea: AreaCounts[] = areas.map((a) => ({
    areaId: a.id,
    areaName: a.name,
    checkedIn: 0,
    released: 0,
    parked: 0,
    missed: 0,
    carriedOver: 0,
  }));
  const index = new Map(byArea.map((a) => [a.areaId, a]));

  for (const r of rows) {
    const area = index.get(r.area_id);
    if (!area) continue;
    if (r.service_id === serviceId) {
      area.checkedIn++;
      area[r.status]++;
    } else if (r.status === "parked" && (start.get(r.service_id) ?? 0) < selectedStart) {
      area.carriedOver++;
    }
  }

  const totals = byArea.reduce(
    (t, a) => ({
      checkedIn: t.checkedIn + a.checkedIn,
      released: t.released + a.released,
      parked: t.parked + a.parked,
      missed: t.missed + a.missed,
      carriedOver: t.carriedOver + a.carriedOver,
    }),
    { checkedIn: 0, released: 0, parked: 0, missed: 0, carriedOver: 0 },
  );
  return { areas: byArea, totals };
}
