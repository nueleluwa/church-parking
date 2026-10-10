import Link from "next/link";
import { AdminTable, cell } from "@/components/AdminTable";
import { IconDownload } from "@/components/icons";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { field, outlineButton, primaryButton } from "@/components/ui";
import { listActiveAreas, listAlertKinds, listReportVisits } from "@/lib/db";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { buildReport, formatPlate, lagosDate, parseRange } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const VIEWS = [
  { value: "service", label: "Service report" },
  { value: "area", label: "Car park report" },
  { value: "exceptions", label: "Exceptions" },
  { value: "visitors", label: "Visitor list" },
] as const;

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
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; area?: string; page?: string; view?: string }> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const range = parseRange(sp.from, sp.to) ?? { from: addDays(today, -27), to: today };

  const [everyVisit, alertKinds, areas] = await Promise.all([
    listReportVisits(range.from, range.to),
    listAlertKinds(range.from, range.to),
    listActiveAreas(),
  ]);
  // One car park, or all of them. The CSV follows the same choice.
  const area = areas.find((a) => a.slug === sp.area);
  const visits = area ? everyVisit.filter((v) => v.areaName === area.name) : everyVisit;
  const report = buildReport(visits, alertKinds);
  const t = report.totals;
  const sorted = [...visits].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const view = VIEWS.some((v) => v.value === sp.view) ? (sp.view as (typeof VIEWS)[number]["value"]) : "service";
  const reportHref = (next: { page?: string; view?: string }) =>
    `/admin/reports?${new URLSearchParams({
      from: range.from,
      to: range.to,
      ...(area ? { area: area.slug } : {}),
      ...((next.view ?? view) !== "service" ? { view: next.view ?? view } : {}),
      ...(next.page ? { page: next.page } : {}),
    })}`;
  // Each active car park, even one with no visits in these dates
  const byArea = areas
    .filter((a) => !area || a.slug === area.slug)
    .map((a) => {
      const mine = visits.filter((v) => v.areaName === a.name);
      const missed = mine.filter((v) => v.status === "missed").length;
      return {
        name: a.name,
        checkedIn: mine.length,
        released: mine.filter((v) => v.status === "released").length,
        parked: mine.filter((v) => v.status === "parked").length,
        missed,
        missedPercent: mine.length ? Math.round((missed / mine.length) * 100) : 0,
      };
    });
  const noPass = sorted.filter((v) => v.status === "released" && v.releaseMethod === "search").slice(0, 40);
  const missedList = sorted.filter((v) => v.status === "missed").slice(0, 40);

  return (
    <>
      <form className="space-y-3 rounded-card bg-card p-4 shadow-sm">
        {view !== "service" && <input type="hidden" name="view" value={view} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <label className="block font-medium">
            From
            <input type="date" name="from" defaultValue={range.from} required className={field} />
          </label>
          <label className="block font-medium">
            To
            <input type="date" name="to" defaultValue={range.to} required className={field} />
          </label>
          <label className="col-span-2 block font-medium lg:col-span-1">
            Car park
            <select name="area" defaultValue={area?.slug ?? ""} className={field}>
              <option value="">All car parks</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button className={primaryButton}>Show report</button>
          <a href={`/admin/reports/export?from=${range.from}&to=${range.to}${area ? `&area=${area.slug}` : ""}`} className={outlineButton}>
            <IconDownload className="h-5 w-5" />
            Export CSV
          </a>
          <PrintButton />
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

      <nav aria-label="Report" className="flex flex-wrap gap-2 border-b border-edge/20 pb-2">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={reportHref({ view: v.value })}
            aria-current={v.value === view ? "page" : undefined}
            className={`rounded-full px-4 py-2 font-semibold ${v.value === view ? "bg-accent text-white" : "text-ink hover:bg-panel"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "area" && (
        <section aria-label="By car park" className="space-y-3">
          <h2 className="px-1 text-lg font-bold">By car park</h2>
          <ul className="grid gap-3 lg:hidden">
            {byArea.map((a) => (
              <li key={a.name} className="rounded-card bg-card p-4 shadow-sm">
                <p data-area className="font-bold">{a.name}</p>
                <p className="text-sm text-ink-soft">
                  in {a.checkedIn} · out {a.released} · parked {a.parked} · missed {a.missed} ({a.missedPercent}%)
                </p>
              </li>
            ))}
          </ul>
          <AdminTable label="By car park" columns={["Car park", "Checked in", "Released", "Still parked", "Missed", "Missed %"]}>
            {byArea.map((a) => (
              <tr key={a.name}>
                <td data-area className={`${cell} font-bold`}>{a.name}</td>
                <td className={cell}>{a.checkedIn}</td>
                <td className={cell}>{a.released}</td>
                <td className={cell}>{a.parked}</td>
                <td className={cell}>{a.missed}</td>
                <td className={cell}>{a.missedPercent}%</td>
              </tr>
            ))}
          </AdminTable>
        </section>
      )}

      {view === "exceptions" && (
        <section aria-label="Exception lists" className="grid items-start gap-4 lg:grid-cols-2">
          {[
            { title: "Released without a pass", empty: "None in these dates.", list: noPass },
            { title: "Missed check-outs", empty: "None in these dates.", list: missedList },
          ].map((group) => (
            <div key={group.title} className="space-y-2 rounded-card bg-card p-4 shadow-sm">
              <h2 className="text-lg font-bold">{group.title}</h2>
              {group.list.length === 0 ? (
                <p className="text-ink-soft">{group.empty}</p>
              ) : (
                <ul className="divide-y divide-edge/15">
                  {group.list.map((v) => (
                    <li key={v.reference + v.serviceDate}>
                      <Link href={`/admin/visits/${v.id}`} aria-label={`Visit details for ${formatPlate(v.plate)}`} className="flex items-center justify-between gap-3 py-2 hover:bg-page">
                        <span className="min-w-0">
                          <span data-plate className="block whitespace-nowrap font-bold">{formatPlate(v.plate)}</span>
                          <span className="block text-sm text-ink-soft">
                            <span data-area>{v.areaName}</span> · {v.serviceDate} · {v.serviceName}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold">{formatLagosTime(v.checkedInAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {view === "service" &&
        (report.days.length === 0 ? (
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
      ))}

      {view === "visitors" && rows.length === 0 && (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">No visits between these dates.</p>
      )}
      {view === "visitors" && rows.length > 0 && (
        <section aria-label="Transactions" className="space-y-3">
          <div>
            <h2 className="px-1 text-lg font-bold">Transactions</h2>
            <p className="px-1 text-sm text-ink-soft">
              {visits.length} {visits.length === 1 ? "visit" : "visits"}, newest first. Export the CSV for all of them.
            </p>
          </div>
          <ul className="grid gap-3 lg:hidden">
            {rows.map((v) => (
              <li key={v.reference + v.serviceDate}>
                <Link
                  href={`/admin/visits/${v.id}`}
                  aria-label={`Visit details for ${formatPlate(v.plate)}`}
                  className="flex items-center gap-3 rounded-card bg-card p-3 shadow-sm hover:bg-page"
                >
                  <span className="min-w-0 flex-1">
                    <span data-plate className="block whitespace-nowrap font-extrabold">
                      {formatPlate(v.plate)}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      <span data-area>{v.areaName}</span> · {v.serviceName}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      {v.serviceDate} · in {formatLagosTime(v.checkedInAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusBadge>
                    {v.releaseMethod === "search" && v.status === "released" && <span className="text-xs text-ink-soft">no pass</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <AdminTable label="Transactions" columns={["Vehicle", "Day", "Service", "Car park", "Checked in", "Status"]}>
            {rows.map((v) => (
              <tr key={v.reference + v.serviceDate} className="hover:bg-page">
                <td className={cell}>
                  <Link href={`/admin/visits/${v.id}`} aria-label={`Visit details for ${formatPlate(v.plate)}`} className="whitespace-nowrap font-bold underline">
                    {formatPlate(v.plate)}
                  </Link>
                </td>
                <td className={`${cell} whitespace-nowrap`}>{v.serviceDate}</td>
                <td className={cell}>{v.serviceName}</td>
                <td data-area className={`${cell} whitespace-nowrap`}>{v.areaName}</td>
                <td className={`${cell} whitespace-nowrap`}>{formatLagosTime(v.checkedInAt)}</td>
                <td className={cell}>
                  <StatusBadge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusBadge>
                  {v.releaseMethod === "search" && v.status === "released" && <span className="ml-1 text-xs text-ink-soft">no pass</span>}
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pager page={page} pages={pages} href={(p) => reportHref({ page: String(p) })} />
        </section>
      )}
    </>
  );
}
