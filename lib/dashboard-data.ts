import { listActiveAreas, listActiveServices, listOnSite, listOpenAlerts, listTodaysVisitRows } from "@/lib/db";
import {
  defaultDashboardService,
  describeAlert,
  describeVehicle,
  formatPlate,
  isOverstaying,
  lagosDate,
  servicesToday,
  summariseVisits,
  type DashboardSummary,
} from "@/lib/rules";

export type AlertItem = {
  id: number;
  title: string;
  hint: string;
  plate: string;
  when: string; // HH:MM, Lagos time
  where: string; // "Car Park 1 · Service 2"
  area: string;
  service: string;
  /** Where Investigate goes: the visit if there is one, otherwise today's visits for the plate. */
  investigateHref: string;
  /** "Toyota Corolla · Silver", when known. */
  vehicle: string;
};

/** One car recorded as parked right now. */
export type OnSiteItem = { id: string; plate: string; vehicle: string; areaName: string; since: string; overstaying: boolean };
const ON_SITE_LIMIT = 10;

export type DashboardData = {
  /** Cars on site right now, longest first, and how many there are in all. Live, whatever service is chosen. */
  onSite: OnSiteItem[];
  onSiteTotal: number;
  noServiceToday: boolean;
  services: { id: number; name: string; time: string }[];
  serviceId: number | null;
  summary: DashboardSummary | null;
  alerts: AlertItem[];
  /** Each car park's address name, so a card can open its visits. */
  areaSlugs: Record<number, string>;
  updatedAt: string;
};

const hhmm = (t: string) => t.slice(0, 5);

const lagosTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });

/**
 * Everything the coordinator dashboard shows (OP-1). Counts only: no names or
 * phone numbers, and no spaces-left figure (D-05).
 */
export async function loadDashboard(requestedServiceId?: number): Promise<DashboardData> {
  const now = new Date();
  const today = lagosDate(now);
  const todays = servicesToday(now, await listActiveServices());
  const updatedAt = now.toISOString();

  const alerts = (await listOpenAlerts()).map((a) => {
    const text = describeAlert(a.kind);
    return {
      id: a.id,
      title: text.title,
      hint: text.hint,
      plate: a.plate ? formatPlate(a.plate) : "",
      when: lagosTime(a.created_at),
      where: [a.areaName, a.serviceName].filter(Boolean).join(" · "),
      area: a.areaName ?? "",
      service: a.serviceName ?? "",
      investigateHref: a.visitId ? `/admin/visits/${a.visitId}` : `/admin/visits?q=${encodeURIComponent(a.plate ?? "")}`,
      vehicle: describeVehicle({ make: a.make, colour: a.colour }) ?? "",
    };
  });

  const parked = await listOnSite();
  const nowMs = now.getTime();
  const onSite = parked.slice(0, ON_SITE_LIMIT).map((c) => ({
    id: c.id,
    plate: formatPlate(c.plate),
    vehicle: describeVehicle({ make: c.make, colour: c.colour }) ?? "",
    areaName: c.areaName,
    since: lagosTime(c.checkedInAt),
    overstaying: isOverstaying(c, nowMs),
  }));

  if (todays.length === 0) {
    return { noServiceToday: true, services: [], serviceId: null, summary: null, alerts, areaSlugs: {}, onSite, onSiteTotal: parked.length, updatedAt };
  }

  const selected =
    todays.find((s) => s.id === requestedServiceId) ?? defaultDashboardService(now, todays) ?? todays[0];
  const [rows, areas] = await Promise.all([listTodaysVisitRows(today), listActiveAreas()]);

  return {
    noServiceToday: false,
    services: todays.map((s) => ({
      id: s.id,
      name: s.name,
      time: `${hhmm(s.starts_at)} to ${hhmm(s.ends_at)}`,
    })),
    serviceId: selected.id,
    summary: summariseVisits(rows, areas, todays, selected.id),
    alerts,
    areaSlugs: Object.fromEntries(areas.map((a) => [a.id, a.slug])),
    onSite,
    onSiteTotal: parked.length,
    updatedAt,
  };
}
