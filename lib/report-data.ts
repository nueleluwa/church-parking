import { listActiveAreas, listAllServices, listParkedNow, listReportAlerts, listReportVisits } from "@/lib/db";
import type { ReportInput } from "@/lib/rules";

/**
 * Everything a report is made from, read fresh from the database each time and limited to the chosen service.
 * Returns null when the service does not exist.
 */
export async function loadReportInput(range: { from: string; to: string }, serviceId: number | null): Promise<ReportInput | null> {
  const [visits, alerts, parked, areas, services] = await Promise.all([
    listReportVisits(range.from, range.to),
    listReportAlerts(range.from, range.to),
    listParkedNow(),
    listActiveAreas(),
    listAllServices(),
  ]);
  const service = serviceId === null ? null : (services.find((s) => s.id === serviceId) ?? null);
  if (serviceId !== null && !service) return null;
  const serviceNames = new Map(services.map((s) => [s.id, s.name]));
  return {
    range,
    service: service ? { id: service.id, name: service.name } : null,
    visits: service ? visits.filter((v) => v.serviceId === service.id) : visits,
    alerts: service ? alerts.filter((a) => a.serviceId === service.id) : alerts,
    parkedNow: parked
      .filter((p) => !service || p.serviceId === service.id)
      .map((p) => ({ ...p, serviceName: serviceNames.get(p.serviceId) ?? "" })),
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
    generatedAt: new Date(),
  };
}
