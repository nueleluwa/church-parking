import { GetForm } from "@/components/ds/GetForm";
import Link from "next/link";
import { IconAlert, IconCalendar, IconCar, IconPin, IconReport, IconTrend, IconUsers } from "@/components/icons";
import { listAllServices } from "@/lib/db";
import {
  CATEGORIES,
  MAX_REPORT_DAYS,
  REPORTS,
  lagosDate,
  parseRange,
  rangeDays,
  reportsIn,
  type ReportCategoryId,
} from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { DownloadButton } from "./DownloadButton";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ICONS: Record<ReportCategoryId, React.ReactNode> = {
  activity: <IconTrend className="h-6 w-6" />,
  vehicles: <IconCar className="h-6 w-6" />,
  members: <IconUsers className="h-6 w-6" />,
  services: <IconCalendar className="h-6 w-6" />,
  areas: <IconPin className="h-6 w-6" />,
  alerts: <IconAlert className="h-6 w-6" />,
};

const input = "input";

/**
 * AD-4: pick a kind of report, set the dates and service, and download each report as a CSV. The reports are defined in
 * lib/rules/report-catalogue.ts. Each download is made fresh from the visit and alert records when it is asked for.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; service?: string; category?: string }>;
}) {
  await requireStaff("admin");
  const sp = await searchParams;
  const today = lagosDate(new Date());

  const fallback = { from: addDays(today, -6), to: today };
  const asked = parseRange(sp.from, sp.to);
  const given = Boolean(sp.from || sp.to);
  const tooLong = asked !== null && rangeDays(asked.from, asked.to) > MAX_REPORT_DAYS;
  const rangeError = given && !asked ? "Choose a start date that is not after the end date." : tooLong ? `Choose a period of up to ${MAX_REPORT_DAYS} days.` : null;
  const range = asked && !tooLong ? asked : fallback;

  const services = (await listAllServices()).filter((s) => s.active || String(s.id) === sp.service);
  const service = services.find((s) => String(s.id) === sp.service) ?? null;
  const category = CATEGORIES.find((c) => c.id === sp.category) ?? CATEGORIES[0];
  const reports = reportsIn(category.id);

  const scope = `from=${range.from}&to=${range.to}${service ? `&service=${service.id}` : ""}`;
  const categoryHref = (id: string) => `/admin/reports?category=${id}&${scope}`;
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "Last 28 days", from: addDays(today, -27), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="lg:max-w-[16rem]">
          <h1 className="t-page">Reports</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft">Generate and download reports from your parking data.</p>
        </div>

        <GetForm noValidate aria-label="Report filters" className="w-full space-y-2 lg:w-auto">
          <input type="hidden" name="category" value={category.id} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-[10rem_10rem_11rem_auto] lg:items-end">
            <label className="block text-sm font-medium">
              From
              <input type="date" name="from" defaultValue={range.from} max={today} required className={`${input}`} />
            </label>
            <label className="block text-sm font-medium">
              To
              <input type="date" name="to" defaultValue={range.to} max={today} required className={`${input}`} />
            </label>
            <label className="col-span-2 block text-sm font-medium lg:col-span-1">
              Service
              <select name="service" defaultValue={service ? String(service.id) : ""} className={input}>
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-dark col-span-2 lg:col-span-1">Apply</button>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:justify-end">
            {presets.map((p) => (
              <Link
                key={p.label}
                href={`/admin/reports?category=${category.id}&from=${p.from}&to=${p.to}${service ? `&service=${service.id}` : ""}`}
                className="font-semibold text-accent underline"
              >
                {p.label}
              </Link>
            ))}
            {(service || given) && (
              <Link href={`/admin/reports?category=${category.id}`} className="font-semibold text-ink-soft underline">
                Reset filters
              </Link>
            )}
          </p>
        </GetForm>
      </header>

      {rangeError && (
        <p role="alert" className="rounded-2xl border border-accent bg-blush/60 p-3 font-semibold text-accent">
          {rangeError} Downloads are switched off until the dates are fixed.
        </p>
      )}

      <section aria-label="All reports in one file" className="surface flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="t-section">All reports in one file</h2>
          <p className="t-support mt-1">
            An Excel workbook with a sheet for each of the {REPORTS.length} reports, or a designed PDF with charts and the key figures, for the
            dates and service chosen above. Neither contains drivers&apos; names or phone numbers.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <DownloadButton
            href={`/admin/reports/export?report=pdf&${scope}`}
            report="the report with charts"
            label="Download PDF report"
            format="PDF"
            disabled={rangeError !== null}
          />
          <DownloadButton
            href={`/admin/reports/export?report=all&${scope}`}
            report="all reports"
            label="Download everything (Excel)"
            format="Excel"
            outline
            disabled={rangeError !== null}
          />
        </div>
      </section>

      <nav aria-label="Report categories">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const on = c.id === category.id;
            return (
              <li key={c.id}>
                <Link
                  href={categoryHref(c.id)}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full items-start gap-3 rounded-2xl border p-4 ${on ? "border-accent bg-blush/50" : "border-edge/15 bg-card hover:bg-page"}`}
                >
                  <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${on ? "bg-white text-accent" : "bg-page text-ink"}`}>
                    {ICONS[c.id]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{c.name}</span>
                    <span className="block text-sm text-ink-soft">{c.description}</span>
                  </span>
                  <span
                    aria-label={`${reportsIn(c.id).length} reports`}
                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold ${on ? "bg-accent text-white" : "bg-page text-ink"}`}
                  >
                    {reportsIn(c.id).length}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-label={`${category.name} reports`} className="surface">
        <h2 className="mb-4 text-xl font-extrabold">{category.name} reports</h2>

        <div aria-hidden="true" className="hidden rounded-t-xl bg-page px-4 py-2.5 text-sm font-semibold text-ink-soft lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_5rem_11rem] lg:gap-4">
          <span>Report name</span>
          <span>Description</span>
          <span>Format</span>
          <span className="text-right">Actions</span>
        </div>
        <ul className="divide-y divide-edge/15 rounded-xl border border-edge/10 lg:rounded-t-none">
          {reports.map((r) => (
            <li key={r.id} data-report={r.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_5rem_11rem] lg:items-center lg:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
                  <IconReport className="h-5 w-5" />
                </span>
                <h3 className="font-bold">{r.name}</h3>
              </div>
              <p className="text-sm text-ink-soft lg:text-base">{r.description}</p>
              <p className="flex flex-wrap gap-1">
                {r.formats.map((f) => (
                  <span key={f} className="rounded-lg border border-edge/40 px-2.5 py-1 text-sm font-bold uppercase">
                    {f}
                  </span>
                ))}
              </p>
              <DownloadButton href={`/admin/reports/export?report=${r.id}&${scope}`} report={r.name} disabled={rangeError !== null} />
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-start gap-2 text-sm text-ink-soft">
          <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-soft text-xs font-bold">
            i
          </span>
          <span>
            Each report is worked out from the application&apos;s records when you download it, for the dates and service chosen above. Times are Lagos time. Figures marked
            &quot;right now&quot; or &quot;live&quot; are taken at that moment and are not limited to the dates. Reports are CSV files and contain no drivers&apos; names or phone numbers.
          </span>
        </p>
      </section>
    </>
  );
}
