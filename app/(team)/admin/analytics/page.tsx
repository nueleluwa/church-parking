import Link from "next/link";
import { Bars, Donut, TimeChart } from "@/components/charts";
import { field, primaryButton } from "@/components/ui";
import { listActiveAreas, listReportVisits } from "@/lib/db";
import { IconDownload } from "@/components/icons";
import { formatDuration, formatLagosDate } from "@/lib/format";
import { buildAnalytics, lagosDate, parseRange, percentChange, previousRange } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function Kpi({ label, value, change, id, lowerIsBetter, partial }: { label: string; value: number; change: number | null; id: string; lowerIsBetter?: boolean; partial?: boolean }) {
  const good = change === null ? null : lowerIsBetter ? change <= 0 : change >= 0;
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      <p className="flex flex-wrap items-baseline gap-2">
        <span data-testid={id} className="text-3xl font-extrabold">
          {value}
        </span>
        {change !== null && change !== 0 && (
          <span className={`text-sm font-bold ${good ? "text-success" : "text-danger"}`}>
            {change > 0 ? "↑" : "↓"} {Math.abs(change)}%
          </span>
        )}
      </p>
      {change !== null && <p className="text-xs text-ink-soft">
          compared with the period before{partial ? " (today is not over yet)" : ""}
        </p>}
    </div>
  );
}

function Plain({ label, value, note, id }: { label: string; value: string; note: string; id: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      <p data-testid={id} className="text-3xl font-extrabold">
        {value}
      </p>
      <p className="text-xs text-ink-soft">{note}</p>
    </div>
  );
}

/** AD-5: peak arrival times, which car park fills first, and how visits ended. All from the visit records. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; area?: string; service?: string }> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const range = parseRange(sp.from, sp.to) ?? { from: today, to: today };
  const before = previousRange(range.from, range.to);

  const [everyVisit, everyEarlier, areas] = await Promise.all([
    listReportVisits(range.from, range.to),
    listReportVisits(before.from, before.to),
    listActiveAreas(),
  ]);
  const area = areas.find((x) => x.slug === sp.area);
  const services = [...new Map(everyVisit.map((v) => [v.serviceId, v.serviceName])).entries()].map(([id, name]) => ({ id, name }));
  const service = services.find((x) => String(x.id) === sp.service) ?? null;
  const pick = (list: typeof everyVisit) =>
    list.filter((v) => (!area || v.areaName === area.name) && (!service || v.serviceId === service.id));
  const visits = pick(everyVisit);
  const earlier = pick(everyEarlier);
  const partial = range.to >= today;
  const areaQuery = `${area ? `&area=${area.slug}` : ""}${service ? `&service=${service.id}` : ""}`;
  const a = buildAnalytics(visits);
  const b = buildAnalytics(earlier);
  const single = range.from === range.to;
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "Last 28 days", from: addDays(today, -27), to: today },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold">Parking analytics</h1>
        <p className="text-ink-soft">
          {single ? formatLagosDate(`${range.from}T12:00:00+01:00`) : `${range.from} to ${range.to}`} · {area ? area.name : "all car parks"} ·
          counted from the visit records
        </p>
      </div>

      <form className="space-y-3 rounded-card bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-medium">
            From
            <input type="date" name="from" defaultValue={range.from} required className={field} />
          </label>
          <label className="block font-medium">
            To
            <input type="date" name="to" defaultValue={range.to} required className={field} />
          </label>
          <label className="col-span-2 block font-medium">
            Car park
            <select name="area" defaultValue={area?.slug ?? ""} className={field}>
              <option value="">All car parks</option>
              {areas.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {services.length > 1 && (
            <label className="col-span-2 block font-medium">
              Service
              <select name="service" defaultValue={service ? String(service.id) : ""} className={field}>
                <option value="">All services</option>
                {services.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button className={primaryButton}>Show analytics</button>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {presets.map((p) => (
            <Link key={p.label} href={`/admin/analytics?from=${p.from}&to=${p.to}${areaQuery}`} className="font-semibold text-accent underline">
              {p.label}
            </Link>
          ))}
        </p>
        <a href={`/admin/reports/export?from=${range.from}&to=${range.to}${area ? `&area=${area.slug}` : ""}`} className="inline-flex items-center gap-2 font-semibold text-accent underline">
          <IconDownload className="h-5 w-5" />
          Export these visits (CSV)
        </a>
      </form>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total check-ins" value={a.checkedIn} change={percentChange(a.checkedIn, b.checkedIn)} id="a-checked-in" partial={partial} />
        <Kpi label="Total releases" value={a.released} change={percentChange(a.released, b.released)} id="a-released" partial={partial} />
        <Kpi label="Missed check-outs" value={a.missed} change={percentChange(a.missed, b.missed)} id="a-missed" lowerIsBetter partial={partial} />
      </section>

      <section aria-label="Stay and mix" className="grid gap-3 sm:grid-cols-3">
        <Plain
          id="a-average-stay"
          label="Average stay"
          value={a.averageStay === null ? "None yet" : formatDuration(a.averageStay)}
          note={`of ${a.released} released ${a.released === 1 ? "car" : "cars"}`}
        />
        <Plain
          id="a-missed-rate"
          label="Missed rate"
          value={`${a.checkedIn ? Math.round((a.missed / a.checkedIn) * 100) : 0}%`}
          note="of check-ins were never released"
        />
        <Plain
          id="a-members"
          label="Members' cars"
          value={`${a.checkedIn ? Math.round((a.members / a.checkedIn) * 100) : 0}%`}
          note={`${a.members} members · ${a.guests} guests`}
        />
      </section>

      {a.byDay.length > 1 && (
        <section aria-label="Check-ins by day" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Check-ins by day</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Busiest: {[...a.byDay].sort((x, y) => y.count - x.count || x.date.localeCompare(y.date))[0].date}.
          </p>
          <Bars rows={a.byDay.map((d) => ({ label: formatLagosDate(`${d.date}T12:00:00+01:00`), value: d.count }))} />
        </section>
      )}

      <section aria-label="Check-ins by time of day" className="rounded-card bg-card p-4 shadow-sm">
        <h2 className="text-lg font-bold">Check-ins by time of day</h2>
        <p className="mb-2 text-sm text-ink-soft">Every half hour, in Lagos time.</p>
        <TimeChart buckets={a.byTime} label="Check-ins by time of day" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Car park usage" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Car park usage</h2>
          <p className="mb-3 text-sm text-ink-soft">How many cars chose each car park.</p>
          {a.areaUsage.length === 0 ? (
            <p className="text-ink-soft">No check-ins in this period.</p>
          ) : (
            <Bars rows={a.areaUsage.map((u) => ({ label: u.areaName, value: u.count, note: `${u.percent}%` }))} />
          )}
        </section>

        <section aria-label="How visits ended" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Visit outcomes</h2>
          <p className="mb-3 text-sm text-ink-soft">Where every check-in stands now.</p>
          <Donut
            label="Visit outcomes"
            total={a.checkedIn}
            parts={[
              { label: "Currently parked", value: a.stillParked, color: "var(--color-success)" },
              { label: "Released", value: a.released, color: "var(--color-night-soft)" },
              { label: "Missed", value: a.missed, color: "var(--color-accent)" },
            ]}
          />
        </section>
      </div>

      <section aria-label="How long cars stay" className="rounded-card bg-card p-4 shadow-sm">
        <h2 className="text-lg font-bold">How long cars stay</h2>
        <p className="mb-3 text-sm text-ink-soft">From check-in to release, for cars already released.</p>
        {a.released === 0 ? (
          <p className="text-ink-soft">No cars released in this period.</p>
        ) : (
          <Bars rows={a.stayLengths.map((s) => ({ label: s.label, value: s.count }))} />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Peak periods" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Peak arrival times</h2>
          <p className="mb-3 text-sm text-ink-soft">The three busiest half hours.</p>
          {a.peaks.length === 0 ? (
            <p className="text-ink-soft">No check-ins in this period.</p>
          ) : (
            <ol className="grid grid-cols-3 gap-2 text-center">
              {a.peaks.map((p, i) => (
                <li key={p.start} className="rounded-2xl bg-page p-3">
                  <p className="text-xs font-medium text-ink-soft">{i === 0 ? "Busiest" : `No. ${i + 1}`}</p>
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-2xl font-extrabold">{p.count}</p>
                  <p className="text-xs text-ink-soft">check-ins</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-label="Which car park fills first" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Which car park fills first</h2>
          <p className="mb-3 text-sm text-ink-soft">
            The time by which half of each car park&apos;s cars had arrived. Earlier means it fills first.
          </p>
          {a.areaTiming.length === 0 ? (
            <p className="text-ink-soft">No check-ins in this period.</p>
          ) : (
            <ol className="divide-y divide-edge/15">
              {a.areaTiming.map((t, i) => (
                <li key={t.areaId} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="block font-semibold">
                      {i + 1}. <span data-area>{t.areaName}</span>
                    </span>
                    <span className="block text-sm text-ink-soft">First car at {t.first} · {t.count} cars</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xl font-extrabold">{t.half}</span>
                    <span className="block text-xs text-ink-soft">half full</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
