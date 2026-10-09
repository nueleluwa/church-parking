import Link from "next/link";
import { Bars, Donut, TimeChart } from "@/components/charts";
import { field, primaryButton } from "@/components/ui";
import { listReportVisits } from "@/lib/db";
import { formatLagosDate } from "@/lib/format";
import { buildAnalytics, lagosDate, parseRange, percentChange, previousRange } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function Kpi({ label, value, change, id, lowerIsBetter }: { label: string; value: number; change: number | null; id: string; lowerIsBetter?: boolean }) {
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
      {change !== null && <p className="text-xs text-ink-soft">compared with the period before</p>}
    </div>
  );
}

/** AD-5: peak arrival times, which car park fills first, and how visits ended. All from the visit records. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const range = parseRange(sp.from, sp.to) ?? { from: today, to: today };
  const before = previousRange(range.from, range.to);

  const [visits, earlier] = await Promise.all([
    listReportVisits(range.from, range.to),
    listReportVisits(before.from, before.to),
  ]);
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
          {single ? formatLagosDate(`${range.from}T12:00:00+01:00`) : `${range.from} to ${range.to}`} · counted from the
          visit records
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
        </div>
        <button className={primaryButton}>Show analytics</button>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {presets.map((p) => (
            <Link key={p.label} href={`/admin/analytics?from=${p.from}&to=${p.to}`} className="font-semibold text-accent underline">
              {p.label}
            </Link>
          ))}
        </p>
      </form>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total check-ins" value={a.checkedIn} change={percentChange(a.checkedIn, b.checkedIn)} id="a-checked-in" />
        <Kpi label="Total releases" value={a.released} change={percentChange(a.released, b.released)} id="a-released" />
        <Kpi label="Missed check-outs" value={a.missed} change={percentChange(a.missed, b.missed)} id="a-missed" lowerIsBetter />
      </section>

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
