import { listActiveAreas, listActiveServices, listOpenAlerts, listTodaysVisitRows } from "@/lib/db";
import {
  defaultDashboardService,
  describeAlert,
  formatPlate,
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
};

export type DashboardData = {
  noServiceToday: boolean;
  services: { id: number; name: string; time: string }[];
  serviceId: number | null;
  summary: DashboardSummary | null;
  alerts: AlertItem[];
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
    };
  });

  if (todays.length === 0) {
    return { noServiceToday: true, services: [], serviceId: null, summary: null, alerts, updatedAt };
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
    updatedAt,
  };
}
