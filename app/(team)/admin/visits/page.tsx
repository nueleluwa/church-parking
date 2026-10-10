import Link from "next/link";
import { AdminTable, cell } from "@/components/AdminTable";
import { IconChevronRight } from "@/components/icons";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { field, outlineButton } from "@/components/ui";
import { listActiveAreas, listVisitsOn } from "@/lib/db";
import { formatLagosTime } from "@/lib/format";
import { formatPlate, lagosDate } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Visits" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const STATUS = {
  parked: { label: "Parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
} as const;

const FILTERS = [
  { value: "", label: "All" },
  { value: "parked", label: "Parked" },
  { value: "released", label: "Released" },
  { value: "missed", label: "Missed" },
] as const;

type Search = { date?: string; area?: string; status?: string; page?: string };

/** Every visit on one day (today to begin with), by car park and status. Open a visit for its details, or to release, hold or correct it. */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("coordinator");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const areas = await listActiveAreas();
  const area = areas.find((a) => a.slug === sp.area)?.slug ?? "";
  const status = FILTERS.some((f) => f.value && f.value === sp.status) ? (sp.status as keyof typeof STATUS) : "";

  const all = await listVisitsOn(date);
  // The counts at the top follow the car park filter, so each status button shows what it would list
  const inArea = area ? all.filter((v) => v.areaSlug === area) : all;
  const count = (s: string) => (s ? inArea.filter((v) => v.status === s).length : inArea.length);
  const shown = status ? inArea.filter((v) => v.status === status) : inArea;

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (next: Partial<Search>) => {
    const merged = { date: date === today ? "" : date, area, status, page: "", ...next };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]).toString();
    return `/admin/visits${qs ? `?${qs}` : ""}`;
  };
  const pill = (on: boolean) =>
    `rounded-full border-2 px-4 py-2 font-semibold ${on ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"}`;

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold">Visits</h1>
        <p className="text-ink-soft">
          {date === today ? "Today" : date} · {inArea.length} {inArea.length === 1 ? "visit" : "visits"}
          {area ? ` in ${areas.find((a) => a.slug === area)?.name}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form className="flex items-end gap-3 rounded-card bg-card p-4 shadow-sm">
          {area && <input type="hidden" name="area" value={area} />}
          {status && <input type="hidden" name="status" value={status} />}
          <label className="block font-medium">
            Day
            <input type="date" name="date" defaultValue={date} max={today} className={field} />
          </label>
          <button className={`${outlineButton} !w-auto px-6`}>Show</button>
        </form>

        <div className="space-y-2">
          <nav aria-label="Car park" className="flex flex-wrap gap-2">
            <Link href={href({ area: "" })} aria-current={!area ? "true" : undefined} className={pill(!area)}>
              All car parks
            </Link>
            {areas.map((a) => (
              <Link key={a.slug} href={href({ area: a.slug })} aria-current={a.slug === area ? "true" : undefined} className={pill(a.slug === area)}>
                {a.name}
              </Link>
            ))}
          </nav>
          <nav aria-label="Status" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link key={f.value} href={href({ status: f.value })} aria-current={f.value === status ? "true" : undefined} className={pill(f.value === status)}>
                {f.label} ({count(f.value)})
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">No visits match.</p>
      ) : (
        <>
          <ul className="grid gap-3 lg:hidden">
            {rows.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/admin/visits/${v.id}`}
                  aria-label={`Visit of ${formatPlate(v.plate)}`}
                  className="flex items-center gap-3 rounded-card bg-card p-3 shadow-sm hover:bg-page"
                >
                  <span className="min-w-0 flex-1">
                    <span data-plate className="block whitespace-nowrap text-lg font-extrabold">
                      {formatPlate(v.plate)}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      <span data-area>{v.areaName}</span> · {v.serviceName}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      {v.member ? "Member" : "Guest"} · in {formatLagosTime(v.checkedInAt)}
                      {v.releasedAt && ` · out ${formatLagosTime(v.releasedAt)}`}
                    </span>
                  </span>
                  <StatusBadge tone={STATUS[v.status].tone} className="shrink-0">
                    {STATUS[v.status].label}
                  </StatusBadge>
                  <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>

          <AdminTable label="Visits" columns={["Plate", "Car park", "Service", "Type", "In", "Out", "Status"]}>
            {rows.map((v) => (
              <tr key={v.id} className="hover:bg-page">
                <td className={cell}>
                  <Link
                    href={`/admin/visits/${v.id}`}
                    aria-label={`Visit of ${formatPlate(v.plate)}`}
                    data-plate
                    className="whitespace-nowrap text-lg font-extrabold underline-offset-2 hover:underline"
                  >
                    {formatPlate(v.plate)}
                  </Link>
                </td>
                <td data-area className={`${cell} whitespace-nowrap`}>{v.areaName}</td>
                <td className={cell}>{v.serviceName}</td>
                <td className={cell}>{v.member ? "Member" : "Guest"}</td>
                <td className={`${cell} whitespace-nowrap`}>{formatLagosTime(v.checkedInAt)}</td>
                <td className={`${cell} whitespace-nowrap`}>{v.releasedAt ? formatLagosTime(v.releasedAt) : "-"}</td>
                <td className={cell}>
                  <StatusBadge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusBadge>
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pager page={page} pages={pages} href={(p) => href({ page: String(p) })} />
        </>
      )}
    </>
  );
}
