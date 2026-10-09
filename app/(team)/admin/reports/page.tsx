import { IconDownload } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { field, outlineButton, primaryButton } from "@/components/ui";
import { listAlertKinds, listReportVisits } from "@/lib/db";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { buildReport, formatPlate, lagosDate, parseRange } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function Stat({ label, value, id, tone }: { label: string; value: string | number; id: string; tone?: "danger" }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className={`text-sm font-medium ${tone === "danger" ? "text-danger" : "text-ink-soft"}`}>{label}</p>
      <p data-testid={id} className={`text-3xl font-extrabold ${tone === "danger" ? "text-danger" : ""}`}>
        {value}
      </p>
    </div>
  );
}

const STATUS = {
  parked: { label: "Parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
} as const;

/** AD-4: counts per Sunday, service and car park, missed check-outs, releases without a pass, and a CSV. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const range = parseRange(sp.from, sp.to) ?? { from: addDays(today, -27), to: today };

  const [visits, alertKinds] = await Promise.all([
    listReportVisits(range.from, range.to),
    listAlertKinds(range.from, range.to),
  ]);
  const report = buildReport(visits, alertKinds);
  const t = report.totals;
  const recent = [...visits].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)).slice(0, 50);

  return (
    <>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <button className={primaryButton}>Show report</button>
          <a href={`/admin/reports/export?from=${range.from}&to=${range.to}`} className={outlineButton}>
            <IconDownload className="h-5 w-5" />
            Export CSV
          </a>
        </div>
      </form>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Checked in" value={t.checkedIn} id="r-checked-in" />
        <Stat label="Released" value={t.released} id="r-released" />
        <Stat label="Still parked" value={t.stillParked} id="r-parked" />
        <Stat
          label={`Missed check-outs (${t.missedPercent}%)`}
          value={t.missed}
          id="r-missed"
          tone={t.missed ? "danger" : undefined}
        />
      </section>
      <section aria-label="Exceptions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Released without a pass" value={t.releasedWithoutPass} id="r-no-pass" />
        <Stat label="Car already checked in" value={report.alerts.plateConflicts} id="r-conflicts" />
        <Stat label="Member car claimed by a guest" value={report.alerts.memberPlateClaims} id="r-member-claims" />
        <Stat label="Does not match" value={report.alerts.noMatch} id="r-no-match" />
      </section>

      {report.days.length === 0 ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">No visits between these dates.</p>
      ) : (
        <section aria-label="By day" className="space-y-3">
          <h2 className="px-1 text-lg font-bold">By day, service and car park</h2>
          {report.days.map((d) => (
            <article key={d.date} className="rounded-card bg-card p-4 shadow-sm">
              <h3 className="font-bold">
                {formatLagosDate(`${d.date}T12:00:00+01:00`)} · {d.checkedIn} checked in
              </h3>
              <ul className="mt-2 divide-y divide-edge/15">
                {d.services.map((s) => (
                  <li key={s.serviceId} className="py-2">
                    <p className="font-semibold">
                      {s.serviceName}
                      <span className="font-normal text-ink-soft">
                        {" "}
                        · in {s.checkedIn} · out {s.released} · parked {s.stillParked} · missed {s.missed}
                      </span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {s.areas.map((a) => `${a.areaName}: ${a.checkedIn}`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section aria-label="Transactions" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Transactions</h2>
          <p className="text-sm text-ink-soft">
            Showing {recent.length} of {visits.length}. Export the CSV for all of them.
          </p>
          <div className="mt-2 overflow-x-auto" role="region" aria-label="Transactions table, scroll sideways on a small screen" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-2 pr-3 font-medium">Vehicle</th>
                  <th className="py-2 pr-3 font-medium">Service</th>
                  <th className="py-2 pr-3 font-medium">Car park</th>
                  <th className="py-2 pr-3 font-medium">Checked in</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/15">
                {recent.map((v) => (
                  <tr key={v.reference + v.serviceDate}>
                    <td className="whitespace-nowrap py-2 pr-3 font-bold">{formatPlate(v.plate)}</td>
                    <td className="py-2 pr-3">{v.serviceName}</td>
                    <td className="py-2 pr-3">{v.areaName}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{formatLagosTime(v.checkedInAt)}</td>
                    <td className="py-2">
                      <StatusBadge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusBadge>
                      {v.releaseMethod === "search" && v.status === "released" && (
                        <span className="ml-1 text-xs text-ink-soft">no pass</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
