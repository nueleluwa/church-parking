import Link from "next/link";
import { AdminTable, cell } from "@/components/AdminTable";
import { IconChevronRight, IconDownload } from "@/components/icons";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { field, outlineButton, primaryButton } from "@/components/ui";
import { listActiveAreas, listVisitsOn, type DayVisit } from "@/lib/db";
import { formatDuration, formatLagosDate, formatLagosTime } from "@/lib/format";
import { formatPlate, hasRole, lagosDate, normalisePlate } from "@/lib/rules";
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

const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "long", label: "Longest stay" },
] as const;

type Search = { date?: string; area?: string; status?: string; service?: string; q?: string; sort?: string; page?: string };

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Minutes from check-in to release, or to now while the car is still here. */
const stay = (v: DayVisit, now: number) => Math.max(0, Math.round(((v.releasedAt ? Date.parse(v.releasedAt) : now) - Date.parse(v.checkedInAt)) / 60_000));

/**
 * Every visit on one day, with a summary, search by plate, and filters for car park, service and status. Open a visit for its details,
 * or to release, hold or correct it. Admins can also export the day. Names and phone numbers are never listed.
 */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requireStaff("coordinator");
  const sp = await searchParams;
  const now = new Date().getTime();
  const today = lagosDate(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const areas = await listActiveAreas();
  const area = areas.find((a) => a.slug === sp.area)?.slug ?? "";
  const status = FILTERS.some((f) => f.value && f.value === sp.status) ? (sp.status as keyof typeof STATUS) : "";
  const q = normalisePlate((sp.q ?? "").slice(0, 20));
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as (typeof SORTS)[number]["value"]) : "new";

  // Look-alike characters match each other (0 and O, 1 and I), as in the vehicle search
  const plateLike = q ? new RegExp(q.replace(/[0O]/g, "[0O]").replace(/[1I]/g, "[1I]")) : null;

  const all = await listVisitsOn(date);
  const services = [...new Map(all.map((v) => [v.serviceId, v.serviceName])).entries()].map(([id, name]) => ({ id, name }));
  const service = services.find((s) => String(s.id) === sp.service)?.id ?? null;

  // The status buttons count what they would list, so they follow every other filter but not themselves
  const base = all.filter(
    (v) =>
      (!area || v.areaSlug === area) &&
      (service === null || v.serviceId === service) &&
      (!plateLike || plateLike.test(v.plate)),
  );
  const count = (s: string) => (s ? base.filter((v) => v.status === s).length : base.length);
  const filtered = status ? base.filter((v) => v.status === status) : base;
  const shown = [...filtered].sort((a, b) =>
    sort === "old" ? a.checkedInAt.localeCompare(b.checkedInAt) : sort === "long" ? stay(b, now) - stay(a, now) : b.checkedInAt.localeCompare(a.checkedInAt),
  );

  const released = base.filter((v) => v.status === "released");
  const averageStay = released.length ? Math.round(released.reduce((sum, v) => sum + stay(v, now), 0) / released.length) : null;

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (next: Partial<Search>) => {
    const merged = {
      date: date === today ? "" : date,
      area,
      status,
      service: service === null ? "" : String(service),
      q,
      sort: sort === "new" ? "" : sort,
      page: "",
      ...next,
    };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]).toString();
    return `/admin/visits${qs ? `?${qs}` : ""}`;
  };
  const pill = (on: boolean) =>
    `rounded-full border-2 px-4 py-2 font-semibold ${on ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"}`;
  const isAdmin = hasRole(staff.role, "admin");
  const exportHref = `/admin/reports/export?from=${date}&to=${date}${area ? `&area=${area}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Visits</h1>
          <p className="text-ink-soft">
            {date === today ? "Today" : formatLagosDate(`${date}T12:00:00+01:00`)} · {base.length} {base.length === 1 ? "visit" : "visits"}
            {area ? ` in ${areas.find((a) => a.slug === area)?.name}` : ""}
          </p>
        </div>
        <nav aria-label="Day" className="flex items-center gap-2">
          <Link href={href({ date: addDays(date, -1) })} className={pill(false)} aria-label="Previous day">
            ← Previous day
          </Link>
          {date < today && (
            <Link href={href({ date: addDays(date, 1) === today ? "" : addDays(date, 1) })} className={pill(false)} aria-label="Next day">
              Next day →
            </Link>
          )}
          {date !== today && (
            <Link href={href({ date: "" })} className={pill(false)}>
              Today
            </Link>
          )}
        </nav>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Visits", value: base.length },
          { label: "Parked now", value: count("parked") },
          { label: "Released", value: count("released") },
          { label: "Missed", value: count("missed"), danger: count("missed") > 0 },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-card p-4 shadow-sm">
            <p className={`text-sm font-medium ${c.danger ? "text-danger" : "text-ink-soft"}`}>{c.label}</p>
            <p className={`text-3xl font-extrabold ${c.danger ? "text-danger" : ""}`}>{c.value}</p>
          </div>
        ))}
        {averageStay !== null && (
          <p className="col-span-2 text-sm text-ink-soft lg:col-span-4">
            Average stay of the {released.length} released {released.length === 1 ? "car" : "cars"}: {formatDuration(averageStay)}
          </p>
        )}
      </section>

      <form className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm lg:flex-row lg:items-end">
        {area && <input type="hidden" name="area" value={area} />}
        {status && <input type="hidden" name="status" value={status} />}
        {service !== null && <input type="hidden" name="service" value={service} />}
        {sort !== "new" && <input type="hidden" name="sort" value={sort} />}
        <label className="block font-medium">
          Day
          <input type="date" name="date" defaultValue={date} max={today} className={field} />
        </label>
        <label className="block flex-1 font-medium">
          Plate number
          <input name="q" defaultValue={q} autoComplete="off" autoCapitalize="characters" className={`${field} uppercase`} />
        </label>
        <button className={`${primaryButton} lg:w-32`}>Show</button>
        {isAdmin && (
          <a href={exportHref} className={`${outlineButton} lg:w-auto lg:px-6`}>
            <IconDownload className="h-5 w-5" />
            Export CSV
          </a>
        )}
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
        {services.length > 1 && (
          <nav aria-label="Service" className="flex flex-wrap gap-2">
            <Link href={href({ service: "" })} aria-current={service === null ? "true" : undefined} className={pill(service === null)}>
              All services
            </Link>
            {services.map((s) => (
              <Link key={s.id} href={href({ service: String(s.id) })} aria-current={s.id === service ? "true" : undefined} className={pill(s.id === service)}>
                {s.name}
              </Link>
            ))}
          </nav>
        )}
        <nav aria-label="Status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.value} href={href({ status: f.value })} aria-current={f.value === status ? "true" : undefined} className={pill(f.value === status)}>
              {f.label} ({count(f.value)})
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-ink-soft">Sort:</span>
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={href({ sort: s.value === "new" ? "" : s.value })}
              aria-current={s.value === sort ? "true" : undefined}
              className={`rounded-full px-3 py-1 font-semibold ${s.value === sort ? "bg-panel text-ink" : "text-accent underline"}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
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
                      {v.releasedAt && ` · out ${formatLagosTime(v.releasedAt)}`} · {formatDuration(stay(v, now))}
                      {v.status === "parked" && " so far"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusBadge>
                    {v.held && <StatusBadge tone="danger">On hold</StatusBadge>}
                  </span>
                  <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>

          <AdminTable label="Visits" columns={["Plate", "Car park", "Service", "Type", "In", "Out", "Stay", "Status"]}>
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
                <td className={`${cell} whitespace-nowrap`}>
                  {formatDuration(stay(v, now))}
                  {v.status === "parked" && <span className="text-sm text-ink-soft"> so far</span>}
                </td>
                <td className={cell}>
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusBadge>
                    {v.held && <StatusBadge tone="danger">On hold</StatusBadge>}
                  </span>
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
