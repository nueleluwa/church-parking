import Link from "next/link";
import {
  IconAlert,
  IconCalendar,
  IconCar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconLogout,
  IconPin,
  IconQr,
  IconReport,
  IconSettings,
  IconTrend,
  IconUsers,
} from "@/components/icons";
import { MenuRow } from "@/components/MenuRow";
import { VehicleImage } from "@/components/VehicleImage";
import { listActiveAreas, listAllServices, listOpenAlerts, listPeriodActivity, loadDashboardFigures } from "@/lib/db";
import { formatLagosTime } from "@/lib/format";
import { DASHBOARD_RANGES, formatPlate, lagosDate, parseDashboardPeriod } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { DashboardFilters } from "./DashboardFilters";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const ACTIVITY_ROWS = 8;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One summary card. It is a link to the screen that lists what the number counts. */
function Card({
  label,
  value,
  note,
  icon,
  href,
  id,
  alert,
  tint,
}: {
  label: string;
  value: number;
  note: string;
  icon: React.ReactNode;
  href: string;
  id: string;
  /** Red number and note: only for alerts that need attention. */
  alert?: boolean;
  /** A pale red circle behind the icon. */
  tint?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-edge/15 bg-card p-4 hover:bg-page">
      <span aria-hidden="true" className={`hidden h-12 w-12 shrink-0 sm:flex items-center justify-center rounded-full ${tint || alert ? "bg-blush text-accent" : "bg-page text-ink"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-soft">{label}</span>
        <span data-testid={id} className={`block text-3xl font-extrabold leading-tight ${alert ? "text-accent" : ""}`}>
          {value}
        </span>
        <span className={`block text-xs ${alert ? "font-semibold text-accent" : "text-ink-soft"}`}>{note}</span>
      </span>
      <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
    </Link>
  );
}

/** An entry or an exit, in words and a small mark, in the church's black and grey only. */
function EventChip({ kind }: { kind: "entry" | "exit" }) {
  return kind === "entry" ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-edge/70 bg-white px-2.5 py-0.5 text-sm font-semibold text-ink">
      <IconCheck aria-hidden="true" className="h-3.5 w-3.5" />
      Checked in
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-edge/15 bg-panel px-2.5 py-0.5 text-sm font-semibold text-ink-soft">
      <IconLogout aria-hidden="true" className="h-3.5 w-3.5" />
      Released
    </span>
  );
}

type Search = { range?: string; date?: string; service?: string };

/**
 * The admin dashboard: what happened in the chosen period, what is on site right now, each car park, and the latest entries and exits.
 * Check-ins, releases and the car park counts cover the visits whose service date is in the period (the same definition as Visits).
 * "Currently parked" and "Active alerts" are live and say so when another date is chosen. Counts only: no names or phone numbers.
 */
export default async function AdminHome({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const period = parseDashboardPeriod({ range: sp.range, date: sp.date }, today);

  const [areas, allServices] = await Promise.all([listActiveAreas(), listAllServices()]);
  const requested = Number.parseInt(sp.service ?? "", 10);
  const service = allServices.find((s) => s.id === requested) ?? null;
  const services = allServices.filter((s) => s.active || s.id === service?.id);
  const scope = { from: period.from, to: period.to, serviceId: service?.id ?? null };

  const [figures, events, openAlerts] = await Promise.all([
    loadDashboardFigures(scope, areas.map((a) => a.id)),
    listPeriodActivity(scope, ACTIVITY_ROWS),
    listOpenAlerts(200),
  ]);
  const alerts = service ? openAlerts.filter((a) => a.serviceName === service.name) : openAlerts;
  const byArea = new Map(figures.areas.map((a) => [a.areaId, a]));

  // Every card opens the list it counts, for the same dates and service
  const visitsHref = (extra: Record<string, string> = {}) =>
    `/admin/visits?${new URLSearchParams({ from: period.from, to: period.to, ...(service ? { service: String(service.id) } : {}), ...extra })}`;
  const serviceNote = service ? `${service.name}` : "all services";
  const live = period.includesToday && period.from === period.to;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-ink-soft">
            {period.range === "today" ? "Overview of today's parking activity" : `Overview of parking activity ${period.words}`} across {service ? "the chosen service" : "all services"} and areas.
          </p>
        </div>
        <DashboardFilters
          range={period.range}
          date={period.date}
          today={today}
          serviceId={service ? String(service.id) : ""}
          ranges={DASHBOARD_RANGES.map((r) => ({ value: r.value, label: r.label }))}
          services={services.map((s) => ({ value: String(s.id), label: `${s.name} · ${DAYS[s.weekday]} ${s.starts_at.slice(0, 5)}` }))}
          dates={period.dates}
        />
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card id="d-checked-in" label="Cars checked in" value={figures.checkedIn} note={`Checked in ${period.words}`} icon={<IconCar className="h-6 w-6" />} href={visitsHref()} tint />
        <Card id="d-left" label="Cars left" value={figures.released} note={`Released ${period.words}`} icon={<IconLogout className="h-6 w-6" />} href={visitsHref({ status: "released" })} />
        <Card
          id="d-parked"
          label="Currently parked"
          value={figures.parkedNow}
          note={live ? (service ? `From ${service.name}` : "Across all areas") : `Live now, not for ${period.label.toLowerCase()}`}
          icon={<IconClock className="h-6 w-6" />}
          href="/staff/dashboard"
          tint
        />
        <Card
          id="d-alerts"
          label="Active alerts"
          value={alerts.length}
          note={alerts.length ? "Need attention · view" : live ? "None open" : "None open now"}
          icon={<IconAlert className="h-6 w-6" />}
          href="/staff/dashboard"
          alert={alerts.length > 0}
        />
      </section>

      <section aria-label="Parking areas" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">Parking areas</h2>
          <Link href="/admin/areas" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-edge/20 bg-card px-4 text-sm font-semibold hover:bg-page">
            <IconPin aria-hidden="true" className="h-4 w-4" />
            View all areas
          </Link>
        </div>
        {areas.length === 0 ? (
          <p className="rounded-2xl border border-edge/15 bg-card p-4 font-medium">No car parks are switched on.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {areas.map((a) => {
              const f = byArea.get(a.id) ?? { checkedIn: 0, released: 0, parkedNow: 0 };
              return (
                <li key={a.id}>
                  <Link href={visitsHref({ area: a.slug })} aria-label={`${a.name}: see its visits`} className="block rounded-2xl border border-edge/15 bg-card p-4 hover:bg-page">
                    <span className="flex items-center justify-between gap-2 border-b border-edge/10 pb-3">
                      <span data-area className="text-lg font-extrabold">
                        {a.name}
                      </span>
                      <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
                    </span>
                    <span className="mt-3 grid grid-cols-3 divide-x divide-edge/10 text-center">
                      {[
                        { v: f.parkedNow, l: "Currently parked", t: "parked" },
                        { v: f.checkedIn, l: "Checked in", t: "in" },
                        { v: f.released, l: "Released", t: "out" },
                      ].map((x) => (
                        <span key={x.t} className="px-1">
                          <span data-testid={`area-${a.slug}-${x.t}`} className="block text-2xl font-extrabold">
                            {x.v}
                          </span>
                          <span className="block text-xs text-ink-soft">{x.l}</span>
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {!live && <p className="px-1 text-xs text-ink-soft">Checked in and Released are for {period.label.toLowerCase()}. Currently parked is live and does not change with the date.</p>}
      </section>

      <section aria-label="Recent activity" className="rounded-2xl border border-edge/15 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold">Recent activity</h2>
            {events.length > 0 && (
              <p data-testid="d-activity-count" className="text-sm text-ink-soft">
                The latest {events.length} of {figures.checkedIn + figures.released} {figures.checkedIn + figures.released === 1 ? "event" : "events"} · {period.label.toLowerCase()}, {serviceNote}
              </p>
            )}
          </div>
          <Link href={visitsHref()} className="text-sm font-semibold text-accent underline">
            View all
          </Link>
        </div>

        {events.length === 0 ? (
          <p className="mt-3 rounded-xl bg-page p-4 font-medium">No cars have checked in or left {period.words}{service ? ` for ${service.name}` : ""}.</p>
        ) : (
          <>
            <ul className="mt-3 grid gap-2 lg:hidden">
              {events.map((e) => (
                <li key={e.key} className="min-w-0">
                  <Link href={`/admin/visits/${e.visitId}`} aria-label={`${e.kind === "entry" ? "Entry" : "Exit"} of ${formatPlate(e.plate)}`} className="flex items-center gap-3 rounded-xl border border-edge/10 p-3 hover:bg-page">
                    <VehicleImage size="sm" />
                    <span className="min-w-0 flex-1">
                      <span data-plate className="block whitespace-nowrap text-lg font-extrabold">
                        {formatPlate(e.plate)}
                      </span>
                      <span className="block text-sm text-ink-soft">
                        {e.kind === "entry" ? "↑ Entry" : "↓ Exit"} · <span data-area>{e.areaName}</span>
                      </span>
                      <span className="block text-sm text-ink-soft">{formatLagosTime(e.at)}</span>
                    </span>
                    <EventChip kind={e.kind} />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-3 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[40rem] text-left">
                <caption className="sr-only">Recent activity</caption>
                <thead className="border-b border-edge/20 text-sm text-ink-soft">
                  <tr>
                    {["Vehicle", "Type", "Car park", "Time", "Status"].map((c) => (
                      <th key={c} scope="col" className="whitespace-nowrap px-2.5 py-3 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/15">
                  {events.map((e) => (
                    <tr key={e.key} className="hover:bg-page">
                      <td className="px-2.5 py-3">
                        <span className="flex items-center gap-3">
                          <VehicleImage size="sm" />
                          <Link href={`/admin/visits/${e.visitId}`} aria-label={`Visit of ${formatPlate(e.plate)}`} data-plate className="whitespace-nowrap text-lg font-extrabold underline-offset-2 hover:underline">
                            {formatPlate(e.plate)}
                          </Link>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3">
                        <span aria-hidden="true">{e.kind === "entry" ? "↑" : "↓"} </span>
                        {e.kind === "entry" ? "Entry" : "Exit"}
                      </td>
                      <td data-area className="whitespace-nowrap px-2.5 py-3">
                        {e.areaName}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3">{formatLagosTime(e.at)}</td>
                      <td className="px-2.5 py-3">
                        <EventChip kind={e.kind} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* On a wide screen the side menu already lists these, so the list is for phones */}
      <section aria-label="Manage" className="lg:hidden">
        <h2 className="px-1 pb-2 text-lg font-bold">Manage</h2>
        <ul className="divide-y divide-edge/15 overflow-hidden rounded-card bg-card shadow-sm">
          <li><MenuRow href="/admin/analytics" icon={<IconTrend className="h-5 w-5" />} title="Analytics" subtitle="Peak times, car park usage and how visits ended" /></li>
          <li><MenuRow href="/admin/reports" icon={<IconReport className="h-5 w-5" />} title="Reports" subtitle="Counts, missed check-outs and CSV export" /></li>
          <li><MenuRow href="/admin/services" icon={<IconCalendar className="h-5 w-5" />} title="Services" subtitle="Names and times" /></li>
          <li><MenuRow href="/admin/signs" icon={<IconQr className="h-5 w-5" />} title="QR Signs" subtitle="Print a sign for each car park" /></li>
          <li><MenuRow href="/admin/users" icon={<IconUsers className="h-5 w-5" />} title="Users" subtitle="Members and staff accounts: add, find, reset PINs, change roles" /></li>
          <li><MenuRow href="/admin/visits" icon={<IconClock className="h-5 w-5" />} title="Visits" subtitle="Every visit by day, car park and status" /></li>
          <li><MenuRow href="/admin/vehicles" icon={<IconCar className="h-5 w-5" />} title="Vehicles" subtitle="Every car seen, and its latest visit" /></li>
          <li><MenuRow href="/admin/areas" icon={<IconPin className="h-5 w-5" />} title="Car Parks" subtitle="Add, rename or switch off a car park" /></li>
          <li><MenuRow href="/admin/settings" icon={<IconSettings className="h-5 w-5" />} title="Settings" subtitle="The rules in force, and the activity log" /></li>
        </ul>
      </section>
    </>
  );
}
