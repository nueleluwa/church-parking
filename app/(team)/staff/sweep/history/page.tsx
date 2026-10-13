import Link from "next/link";
import { IconAlert, IconCheck, IconChevronRight } from "@/components/icons";
import { PageNumbers } from "@/components/Pager";
import { VehicleIdentity } from "@/components/ds/VehicleIdentity";
import { field } from "@/components/ui";
import { listSweepHistory, type SweepHistoryRow } from "@/lib/db";
import { formatPlate, lagosDate, lagosParts, pageNumbers, parseRange, rangeDays } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Sweep history" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const OUTCOMES = {
  still_here: { label: "Still here", note: "Visit kept open and carried forward" },
  gone: { label: "Gone", note: "Closed as a missed check-out (not a release)" },
} as const;

const inputClass = `${field} !mt-1 !py-2.5 !text-base`;

function Outcome({ row }: { row: SweepHistoryRow }) {
  const gone = row.outcome === "gone";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold ${gone ? "border-accent bg-white text-accent" : "border-edge/70 bg-white text-ink"}`}>
      {gone ? <IconAlert className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
      {OUTCOMES[row.outcome].label}
    </span>
  );
}

/**
 * Every Still here and Gone a team lead recorded in a sweep, newest first, from the audit log. A Gone is a missed check-out, not a release.
 * To correct an earlier outcome, open the visit: corrections there are recorded with a reason and never replace the original entry.
 */
export default async function SweepHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; outcome?: string; page?: string }> }) {
  await requireStaff("coordinator");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const asked = parseRange(sp.from, sp.to);
  const tooLong = asked !== null && rangeDays(asked.from, asked.to) > 366;
  const error = (sp.from || sp.to) && (!asked || tooLong) ? (tooLong ? "Choose a period of up to 366 days. Showing the last 7 days instead." : "Those dates are not valid. Showing the last 7 days instead.") : null;
  const range = asked && !tooLong ? asked : { from: addDays(today, -6), to: today };
  const outcome = sp.outcome === "still_here" || sp.outcome === "gone" ? sp.outcome : null;

  const first = await listSweepHistory({ ...range, outcome }, 1, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const { rows, total } = page === 1 ? first : await listSweepHistory({ ...range, outcome }, page, PAGE_SIZE);

  const scope = (over: Record<string, string> = {}) =>
    new URLSearchParams(Object.entries({ from: range.from, to: range.to, ...(outcome ? { outcome } : {}), ...over }).filter(([, v]) => v)).toString();
  const href = (p: number) => `/staff/sweep/history?${scope({ page: String(p) })}`;
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-page">Sweep history</h1>
          <p className="text-ink-soft">What was recorded in each sweep: who, when, and the outcome.</p>
        </div>
        <Link href="/staff/sweep" className="inline-flex min-h-12 items-center rounded-full border-2 border-edge/70 bg-white px-5 font-semibold hover:bg-page">
          Back to Sweep
        </Link>
      </header>

      <form noValidate aria-label="Filters" className="rounded-2xl border border-edge/15 bg-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
          <label className="block text-sm font-medium">
            From
            <input type="date" name="from" defaultValue={range.from} max={today} required className={`${inputClass} !px-3`} />
          </label>
          <label className="block text-sm font-medium">
            To
            <input type="date" name="to" defaultValue={range.to} max={today} required className={`${inputClass} !px-3`} />
          </label>
          <label className="col-span-2 block text-sm font-medium sm:col-span-1">
            Outcome
            <select name="outcome" defaultValue={outcome ?? ""} className={inputClass}>
              <option value="">All outcomes</option>
              <option value="still_here">Still here</option>
              <option value="gone">Gone (missed check-out)</option>
            </select>
          </label>
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <Link href="/staff/sweep/history" className="btn btn-outline flex-1">
              Reset
            </Link>
            <button className="btn btn-primary flex-1">Apply</button>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 font-semibold text-accent">
            {error}
          </p>
        )}
      </form>

      <section aria-label="Sweep outcomes" className="surface">
        <h2 className="mb-3 text-xl font-extrabold">
          Sweep outcomes (<span data-testid="history-count">{total}</span>)
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">No sweep outcomes were recorded in these dates.</p>
        ) : (
          <>
            <ul className="grid gap-3 wide:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/visits/${r.visitId}`} aria-label={`Visit of ${formatPlate(r.plate)}`} className="row-card">
                    <VehicleIdentity plate={r.plate} detail={false}>
                      <span className="t-support block">
                        <span data-area>{r.areaName}</span> · {r.serviceName}
                      </span>
                      <span className="t-support block">
                        {lagosParts(r.at).date} {lagosParts(r.at).time} · {r.staff ?? "The system"}
                      </span>
                      <span className="mt-1.5 block">
                        <Outcome row={r} />
                      </span>
                    </VehicleIdentity>
                    <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto wide:block">
              <table className="dt min-w-[46rem]">
                <caption className="sr-only">Sweep outcomes</caption>
                <thead>
                  <tr>
                    {["When", "Vehicle", "Service", "Parking area", "Outcome", "Recorded by", "What it means"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="dt-td whitespace-nowrap">
                        <span className="block">{lagosParts(r.at).date}</span>
                        <span className="block text-sm text-ink-soft">{lagosParts(r.at).time}</span>
                      </td>
                      <td className="dt-td max-w-[20rem]">
                        <VehicleIdentity plate={r.plate} detail={false} href={`/admin/visits/${r.visitId}`} ariaLabel={`Visit of ${formatPlate(r.plate)}`} />
                      </td>
                      <td className="dt-td">{r.serviceName}</td>
                      <td data-area className="dt-td whitespace-nowrap">
                        {r.areaName}
                      </td>
                      <td className="dt-td">
                        <Outcome row={r} />
                      </td>
                      <td className="dt-td">{r.staff ?? "The system"}</td>
                      <td className="dt-td text-sm text-ink-soft">
                        {OUTCOMES[r.outcome].note}
                        {r.sweepServiceName && <span className="block">Sweep of {r.sweepServiceName}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-soft" data-testid="history-showing">
                Showing {start}–{start + rows.length - 1} of {total} {total === 1 ? "outcome" : "outcomes"}
              </p>
              <PageNumbers page={page} pages={pages} numbers={pageNumbers(page, pages)} href={href} />
            </div>
          </>
        )}
      </section>
    </>
  );
}
