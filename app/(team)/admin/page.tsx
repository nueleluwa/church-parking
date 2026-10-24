import Link from "next/link";
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconCar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconLogout,
  IconPin,
  IconReport,
  IconSettings,
  IconTrend,
  IconUsers,
} from "@/components/icons";
import { Chip } from "@/components/ds/Chip";
import { EmptyState } from "@/components/ds/EmptyState";
import { MetricCard, MetricRow } from "@/components/ds/MetricCard";
import { PageHeader } from "@/components/ds/PageHeader";
import { VehicleIdentity } from "@/components/ds/VehicleIdentity";
import { MenuRow } from "@/components/MenuRow";
import { listActiveAreas, listAllServices, listOnSite, listOpenAlerts, listPeriodActivity, loadDashboardFigures } from "@/lib/db";
import { formatDuration, formatLagosTime } from "@/lib/format";
import { DASHBOARD_RANGES, formatPlate, isOverstaying, lagosDate, parseDashboardPeriod } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { DashboardFilters } from "./DashboardFilters";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const ACTIVITY_ROWS = 8;
const ON_SITE_ROWS = 6;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** An entry or an exit, in words and a small mark, in black and grey only. */
function EventChip({ kind }: { kind: "entry" | "exit" }) {
  return kind === "entry" ? (
    <Chip tone="on" icon={<IconCheck className="h-3.5 w-3.5" />}>
      Checked in
    </Chip>
  ) : (
    <Chip tone="off" icon={<IconLogout className="h-3.5 w-3.5" />}>
      Released
    </Chip>
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

  const [figures, events, openAlerts, onSiteAll] = await Promise.all([
    loadDashboardFigures(scope, areas.map((a) => a.id)),
    listPeriodActivity(scope, ACTIVITY_ROWS),
    listOpenAlerts(200),
    listOnSite(),
  ]);
  // Who is on site right now, longest first: this is live, whatever dates are chosen
  const nowMs = new Date().getTime();
  const onSite = (service ? onSiteAll.filter((c) => c.serviceId === service.id) : onSiteAll).slice(0, ON_SITE_ROWS);
  const onSiteTotal = service ? onSiteAll.filter((c) => c.serviceId === service.id).length : onSiteAll.length;
  const alerts = service ? openAlerts.filter((a) => a.serviceName === service.name) : openAlerts;
  const byArea = new Map(figures.areas.map((a) => [a.areaId, a]));

  // Every card opens the list it counts, for the same dates and service
  const visitsHref = (extra: Record<string, string> = {}) =>
    `/admin/visits?${new URLSearchParams({ from: period.from, to: period.to, ...(service ? { service: String(service.id) } : {}), ...extra })}`;
  const serviceNote = service ? `${service.name}` : "all services";
  const live = period.includesToday && period.from === period.to;
  const total = figures.checkedIn + figures.released;

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <DashboardFilters
            range={period.range}
            date={period.date}
            today={today}
            serviceId={service ? String(service.id) : ""}
            ranges={DASHBOARD_RANGES.map((r) => ({ value: r.value, label: r.label }))}
            services={services.map((s) => ({ value: String(s.id), label: `${s.name} · ${DAYS[s.weekday]} ${s.starts_at.slice(0, 5)}` }))}
            dates={period.dates}
          />
        }
      >
        {period.range === "today" ? "Overview of today's parking activity" : `Overview of parking activity ${period.words}`} across {service ? "the chosen service" : "all services"} and areas.
      </PageHeader>

      <MetricRow>
        <MetricCard id="d-checked-in" label="Cars checked in" value={figures.checkedIn} note={`Checked in ${period.words}`} icon={<IconCar className="h-6 w-6" />} href={visitsHref()} tint />
        <MetricCard id="d-left" label="Cars left" value={figures.released} note={`Released ${period.words}`} icon={<IconLogout className="h-6 w-6" />} href={visitsHref({ status: "released" })} />
        <MetricCard
          id="d-parked"
          label="Currently parked"
          value={figures.parkedNow}
          note={live ? (service ? `From ${service.name}` : "Across all areas") : `Live now, not for ${period.label.toLowerCase()}`}
          icon={<IconClock className="h-6 w-6" />}
          href="/staff/dashboard"
          tint
        />
        <MetricCard
          id="d-alerts"
          label="Active alerts"
          value={alerts.length}
          note={alerts.length ? "Need attention · view" : live ? "None open" : "None open now"}
          icon={<IconAlert className="h-6 w-6" />}
          href="/staff/dashboard"
          alert={alerts.length > 0}
          tint
        />
      </MetricRow>

      <section aria-label="Parking areas" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-section">Parking areas</h2>
          <Link href="/admin/settings/parking-areas" className="btn btn-quiet gap-2">
            <IconPin aria-hidden="true" className="h-4 w-4" />
            View all areas
          </Link>
        </div>
        {areas.length === 0 ? (
          <EmptyState>No car parks are switched on.</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {areas.map((a) => {
              const f = byArea.get(a.id) ?? { checkedIn: 0, released: 0, parkedNow: 0 };
              return (
                <li key={a.id}>
                  <Link href={visitsHref({ area: a.slug })} aria-label={`${a.name}: see its visits`} className="surface block !p-4 transition hover:bg-page sm:!p-5">
                    <span className="flex items-center justify-between gap-2 border-b border-edge/10 pb-3">
                      <span data-area className="t-card">
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
                          <span data-testid={`area-${a.slug}-${x.t}`} className="block text-2xl font-extrabold leading-tight tabular-nums">
                            {x.v}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{x.l}</span>
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {!live && <p className="t-meta px-1">Checked in and Released are for {period.label.toLowerCase()}. Currently parked is live and does not change with the date.</p>}
      </section>

      <section aria-label="On site now" className="surface">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="t-section">On site now</h2>
            <p data-testid="d-onsite-count" className="t-support mt-1">
              {onSiteTotal === 0 ? "No cars are recorded as parked." : `${onSiteTotal} ${onSiteTotal === 1 ? "car" : "cars"} recorded as parked, longest first.`}
            </p>
          </div>
          <Link href="/staff/sweep" className="text-sm font-semibold text-accent underline">
            Open sweep
          </Link>
        </div>
        {onSite.length === 0 ? (
          <EmptyState>All clear. Cars appear here as soon as they check in.</EmptyState>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {onSite.map((c) => (
              <li key={c.id} className="min-w-0">
                <Link href={`/admin/visits/${c.id}`} aria-label={`Visit of ${formatPlate(c.plate)}`} className="row-card justify-between">
                  <VehicleIdentity plate={c.plate} detail={false}>
                    <span className="t-support block">
                      {c.areaName} · in at {formatLagosTime(c.checkedInAt)} · {formatDuration(Math.max(0, Math.floor((nowMs - Date.parse(c.checkedInAt)) / 60000)))}
                    </span>
                  </VehicleIdentity>
                  {isOverstaying(c, nowMs) && (
                    <Chip tone="alert" icon={<IconAlert className="h-3.5 w-3.5" />}>
                      Overstaying
                    </Chip>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Recent activity" className="surface">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="t-section">Recent activity</h2>
            {events.length > 0 && (
              <p data-testid="d-activity-count" className="t-support mt-1">
                The latest {events.length} of {total} {total === 1 ? "event" : "events"} · {period.label.toLowerCase()}, {serviceNote}
              </p>
            )}
          </div>
          <Link href={visitsHref()} className="text-sm font-semibold text-accent underline">
            View all
          </Link>
        </div>

        {events.length === 0 ? (
          <EmptyState>
            No cars have checked in or left {period.words}
            {service ? ` for ${service.name}` : ""}.
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-2 lg:hidden">
              {events.map((e) => (
                <li key={e.key} className="min-w-0">
                  <Link href={`/admin/visits/${e.visitId}`} aria-label={`${e.kind === "entry" ? "Entry" : "Exit"} of ${formatPlate(e.plate)}`} className="row-card">
                    <VehicleIdentity plate={e.plate} detail={false}>
                      <span className="t-support block">
                        {e.kind === "entry" ? "Entry" : "Exit"} · <span data-area>{e.areaName}</span>
                      </span>
                      <span className="t-support block">{formatLagosTime(e.at)}</span>
                      <span className="mt-1.5 block">
                        <EventChip kind={e.kind} />
                      </span>
                    </VehicleIdentity>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="dt min-w-[40rem]">
                <caption className="sr-only">Recent activity</caption>
                <thead>
                  <tr>
                    {["Vehicle", "Type", "Car park", "Time", "Status"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.key}>
                      <td className="dt-td max-w-[20rem]">
                        <VehicleIdentity plate={e.plate} detail={false} href={`/admin/visits/${e.visitId}`} ariaLabel={`Visit of ${formatPlate(e.plate)}`} />
                      </td>
                      <td className="dt-td whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {e.kind === "entry" ? <IconArrowUp aria-hidden="true" className="h-4 w-4" /> : <IconArrowDown aria-hidden="true" className="h-4 w-4" />}
                          {e.kind === "entry" ? "Entry" : "Exit"}
                        </span>
                      </td>
                      <td data-area className="dt-td whitespace-nowrap">
                        {e.areaName}
                      </td>
                      <td className="dt-td whitespace-nowrap tabular-nums">{formatLagosTime(e.at)}</td>
                      <td className="dt-td">
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
        <h2 className="t-card px-1 pb-2">Manage</h2>
        <ul className="divide-y divide-edge/15 overflow-hidden rounded-2xl border border-edge/15 bg-card">
          <li><MenuRow href="/admin/analytics" icon={<IconTrend className="h-5 w-5" />} title="Analytics" subtitle="Peak times, car park usage and how visits ended" /></li>
          <li><MenuRow href="/admin/reports" icon={<IconReport className="h-5 w-5" />} title="Reports" subtitle="Counts, missed check-outs and CSV export" /></li>
          <li><MenuRow href="/admin/users" icon={<IconUsers className="h-5 w-5" />} title="Users" subtitle="Members and staff accounts: add, find, reset PINs, change roles" /></li>
          <li><MenuRow href="/admin/visits" icon={<IconClock className="h-5 w-5" />} title="Visits" subtitle="Every visit by day, car park and status" /></li>
          <li><MenuRow href="/admin/vehicles" icon={<IconCar className="h-5 w-5" />} title="Vehicles" subtitle="Every car seen, and its latest visit" /></li>
          <li><MenuRow href="/admin/settings" icon={<IconSettings className="h-5 w-5" />} title="Settings" subtitle="Services, car parks, QR signs, rules and the activity log" /></li>
        </ul>
      </section>
    </>
  );
}
