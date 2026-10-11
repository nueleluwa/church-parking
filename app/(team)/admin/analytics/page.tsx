import Link from "next/link";
import { ActivityChart, DurationColumns } from "@/components/charts";
import { IconCar, IconClock, IconDownload, IconLogout, IconUsers } from "@/components/icons";
import { field } from "@/components/ui";
import { listActiveAreas, listAllServices, listParkedNow, listReportVisits } from "@/lib/db";
import {
  activitySeries,
  buildKpis,
  change,
  describeRange,
  durationByWeekday,
  formatStay,
  lagosDate,
  parseRange,
  peakHours,
  previousLabel,
  previousRange,
  rangeDays,
  rankBy,
} from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/** The longest range shown at once, so a huge range cannot slow the page down. */
const MAX_DAYS = 366;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** One headline number with its definition, and the change against the period before when that can be worked out. */
function Kpi({
  label,
  value,
  note,
  trend,
  versus,
  id,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  trend: number | null;
  versus: string;
  id: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-edge/15 bg-card p-4">
      <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-page text-ink sm:flex">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span data-testid={id} className="text-3xl font-extrabold leading-tight">
            {value}
          </span>
          {trend !== null && trend !== 0 && (
            <span className={`text-sm font-bold ${trend < 0 ? "text-accent" : "text-ink"}`}>
              {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </span>
          )}
        </p>
        <p className="text-xs text-ink-soft">{trend !== null ? versus : note}</p>
      </div>
    </div>
  );
}

/** A ranked list: number, name, count and a bar sized against the largest count shown. */
function RankList({ rows, empty }: { rows: { id: number; name: string; count: number }[]; empty: string }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (rows.length === 0 || total === 0) return <p className="text-ink-soft">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-ink-soft">{i + 1}</span>
          <span data-area className="truncate font-medium">
            {r.name}
          </span>
          <span className="font-bold">{r.count}</span>
          <span className="col-start-2 col-end-4 h-2.5 overflow-hidden rounded-full bg-ink-soft/15" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const card = "rounded-2xl border border-edge/15 bg-card p-4 sm:p-5";

/**
 * AD-5: analytics for a chosen period, service and car park. Every number is worked out from the visit records
 * (see lib/rules/analytics-report.ts for the definitions). The one live figure, cars parked right now, is labelled as live.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; area?: string; service?: string }>;
}) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());

  // By default the last 7 finished days, so they can be compared with the 7 before them
  const asked = parseRange(sp.from, sp.to) ?? { from: addDays(today, -7), to: addDays(today, -1) };
  const clamped = rangeDays(asked.from, asked.to) > MAX_DAYS;
  const range = clamped ? { from: addDays(asked.to, -(MAX_DAYS - 1)), to: asked.to } : asked;
  const days = rangeDays(range.from, range.to);
  const before = previousRange(range.from, range.to);

  const [everyVisit, everyEarlier, areas, allServices, parkedNow] = await Promise.all([
    listReportVisits(range.from, range.to),
    listReportVisits(before.from, before.to),
    listActiveAreas(),
    listAllServices(),
    listParkedNow(),
  ]);

  const area = areas.find((a) => a.slug === sp.area) ?? null;
  // Every active service, plus any switched-off service that has visits in this period
  const inPeriod = new Set(everyVisit.map((v) => v.serviceId));
  const services = allServices.filter((s) => s.active || inPeriod.has(s.id));
  const service = services.find((s) => String(s.id) === sp.service) ?? null;

  const pick = (list: typeof everyVisit) =>
    list.filter((v) => (!area || v.areaId === area.id) && (!service || v.serviceId === service.id));
  const visits = pick(everyVisit);
  const earlier = pick(everyEarlier);

  const k = buildKpis(visits);
  const p = buildKpis(earlier);
  const versus = previousLabel(days);
  // A period that includes today is not finished, so comparing it with a whole earlier period would mislead
  const finished = range.to < today;
  const vs = (now: number | null, then: number | null) => (finished ? change(now, then) : null);

  const activity = activitySeries(visits, range);
  const notOutLabel = activity.grain === "hour" ? "Not yet checked out" : "Not checked out";

  // A live snapshot: cars parked right now. The date range does not change it; the car park and service filters do.
  const parkedRows = areas
    .filter((a) => !area || a.id === area.id)
    .map((a) => ({
      id: a.id,
      name: a.name,
      count: parkedNow.filter((r) => r.areaId === a.id && (!service || r.serviceId === service.id)).length,
    }));
  const parkedMax = Math.max(...parkedRows.map((r) => r.count), 1);

  const areaRank = rankBy(visits, "area", areas.filter((a) => !area || a.id === area.id));
  const serviceRank = rankBy(visits, "service", services.filter((s) => (s.active && (!service || s.id === service.id))));
  const weekdays = durationByWeekday(visits);
  const peaks = peakHours(visits, 3);

  const filterQuery = `${area ? `&area=${area.slug}` : ""}${service ? `&service=${service.id}` : ""}`;
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -7), to: addDays(today, -1) },
    { label: "Last 28 days", from: addDays(today, -28), to: addDays(today, -1) },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];
  const exportHref = `/admin/reports/export?from=${range.from}&to=${range.to}${filterQuery}`;
  const filtered = Boolean(area || service);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Analytics</h1>
          <p className="text-ink-soft">Insights from your parking operations</p>
        </div>
        <a
          href={exportHref}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark"
        >
          <IconDownload className="h-5 w-5" />
          Export CSV
        </a>
      </header>

      <form aria-label="Filters" className={`${card} space-y-3`}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] lg:items-end">
          <label className="block text-sm font-medium">
            From
            <input type="date" name="from" defaultValue={range.from} max={today} required className={`${field} !mt-1 !py-2.5 !text-base`} />
          </label>
          <label className="block text-sm font-medium">
            To
            <input type="date" name="to" defaultValue={range.to} max={today} required className={`${field} !mt-1 !py-2.5 !text-base`} />
          </label>
          <label className="col-span-2 block text-sm font-medium lg:col-span-1">
            Service
            <select name="service" defaultValue={service ? String(service.id) : ""} className={`${field} !mt-1 !py-2.5 !text-base`}>
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block text-sm font-medium lg:col-span-1">
            Parking area
            <select name="area" defaultValue={area?.slug ?? ""} className={`${field} !mt-1 !py-2.5 !text-base`}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button className="col-span-2 min-h-12 rounded-full bg-night px-6 font-semibold text-white lg:col-span-1">Show analytics</button>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {presets.map((preset) => (
            <Link key={preset.label} href={`/admin/analytics?from=${preset.from}&to=${preset.to}${filterQuery}`} className="font-semibold text-accent underline">
              {preset.label}
            </Link>
          ))}
          {(filtered || sp.from || sp.to) && (
            <Link href="/admin/analytics" className="font-semibold text-ink-soft underline">
              Reset filters
            </Link>
          )}
        </p>
        <p className="text-sm text-ink-soft" data-testid="range-summary">
          {describeRange(range.from, range.to)} · {days} {days === 1 ? "day" : "days"} · {service ? service.name : "All services"} ·{" "}
          {area ? area.name : "All areas"} · Lagos time
          {clamped && ` · Showing the latest ${MAX_DAYS} days of the range you chose`}
          {!finished && " · Today is not over yet, so figures may still rise and no comparison is shown"}
        </p>
      </form>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi id="a-checked-in" label="Cars checked in" value={String(k.checkedIn)} note="Visits in this period" trend={vs(k.checkedIn, p.checkedIn)} versus={versus} icon={<IconCar className="h-5 w-5" />} />
        <Kpi id="a-left" label="Cars left" value={String(k.left)} note="Released at the exit" trend={vs(k.left, p.left)} versus={versus} icon={<IconLogout className="h-5 w-5" />} />
        <Kpi
          id="a-average"
          label="Average parking duration"
          value={k.averageStay === null ? "None yet" : formatStay(k.averageStay)}
          note={k.stays === 0 ? "No completed visits" : `From ${k.stays} completed ${k.stays === 1 ? "visit" : "visits"}`}
          trend={vs(k.averageStay, p.averageStay)}
          versus={versus}
          icon={<IconClock className="h-5 w-5" />}
        />
        <Kpi id="a-unique" label="Unique vehicles" value={String(k.uniqueVehicles)} note="Different number plates" trend={vs(k.uniqueVehicles, p.uniqueVehicles)} versus={versus} icon={<IconUsers className="h-5 w-5" />} />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section aria-label="Vehicle activity" className={`${card} lg:col-span-2`}>
          <h2 className="text-lg font-bold">Vehicle activity</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Check-ins and check-outs {activity.grain === "hour" ? "by the hour" : activity.grain === "day" ? "by day" : "by week"}. The line is cars with no
            recorded check-out, including any that left without being scanned.
          </p>
          {visits.length === 0 || activity.buckets.length === 0 ? (
            <p className="text-ink-soft">No activity in this period.</p>
          ) : (
            <ActivityChart
              label={`Vehicle activity, ${describeRange(range.from, range.to)}`}
              notOutLabel={notOutLabel}
              points={activity.buckets.map((b) => ({ label: b.label, checkedIn: b.checkedIn, left: b.left, notOut: b.notOut }))}
            />
          )}
        </section>

        <section aria-label="Vehicles by parking area" className={card}>
          <h2 className="text-lg font-bold">Vehicles by parking area</h2>
          <p className="mb-3 text-sm text-ink-soft">Live: cars parked right now. The date range does not change this.</p>
          {parkedRows.length === 0 ? (
            <p className="text-ink-soft">No parking areas.</p>
          ) : parkedRows.every((r) => r.count === 0) ? (
            <p className="text-ink-soft">No cars are parked right now.</p>
          ) : (
            <ul className="space-y-3">
              {parkedRows.map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                  <span data-area className="truncate font-medium">
                    {r.name}
                  </span>
                  <span className="font-bold">{r.count}</span>
                  <span className="col-span-2 h-2.5 overflow-hidden rounded-full bg-ink-soft/15" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.count / parkedMax) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-label="Top parking areas by check-ins" className={card}>
          <h2 className="text-lg font-bold">Top parking areas by check-ins</h2>
          <p className="mb-3 text-sm text-ink-soft">Cars checked in during this period</p>
          <RankList rows={areaRank} empty="No check-ins in this period." />
        </section>
        <section aria-label="Top services by check-ins" className={card}>
          <h2 className="text-lg font-bold">Top services by check-ins</h2>
          <p className="mb-3 text-sm text-ink-soft">Cars checked in during this period</p>
          <RankList rows={serviceRank} empty="No check-ins in this period." />
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-label="Average parking duration" className={card}>
          <h2 className="text-lg font-bold">Average parking duration</h2>
          <p className="mb-3 text-sm text-ink-soft">Time between check-in and check-out</p>
          {k.averageStay === null ? (
            <p className="text-ink-soft">Not enough completed visits to work this out. A visit counts once the car has been released at the exit.</p>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-3xl font-extrabold">{formatStay(k.averageStay)}</span>
                {vs(k.averageStay, p.averageStay) !== null && vs(k.averageStay, p.averageStay) !== 0 && (
                  <span className="text-sm font-bold">
                    {vs(k.averageStay, p.averageStay)! > 0 ? "↑" : "↓"} {Math.abs(vs(k.averageStay, p.averageStay)!)}% {versus}
                  </span>
                )}
              </p>
              <p className="mb-3 text-xs text-ink-soft">
                From {k.stays} completed {k.stays === 1 ? "visit" : "visits"}. Visits with no recorded check-out are left out.
              </p>
              <DurationColumns
                label="Average parking duration by day of the week"
                rows={weekdays.map((d) => ({ label: d.label, value: d.average, note: d.average === null ? "No completed visits" : `${formatStay(d.average)} from ${d.count}` }))}
              />
            </>
          )}
        </section>

        <section aria-label="Peak hours" className={card}>
          <h2 className="text-lg font-bold">Peak hours</h2>
          <p className="mb-3 text-sm text-ink-soft">The hours with the most check-ins</p>
          {peaks.length === 0 ? (
            <p className="text-ink-soft">No check-ins in this period.</p>
          ) : (
            <ol className="divide-y divide-edge/15">
              {peaks.map((h, i) => (
                <li key={h.start} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 py-2.5">
                  <span className="text-sm font-semibold text-ink-soft">{i + 1}</span>
                  <span className="font-medium">{h.label}</span>
                  <span className="font-bold">
                    {h.count} <span className="text-sm font-normal text-ink-soft">{h.count === 1 ? "check-in" : "check-ins"}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            This is arrivals, not cars on site. How many cars were on site at once is not shown, because a car that leaves without being scanned has no
            recorded departure time.
          </p>
        </section>
      </div>
    </>
  );
}
