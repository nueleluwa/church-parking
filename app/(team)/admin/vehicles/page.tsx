import Link from "next/link";
import { AdminTable, cell } from "@/components/AdminTable";
import { IconChevronRight } from "@/components/icons";
import { Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { field, primaryButton } from "@/components/ui";
import { listActiveAreas, listVehicles } from "@/lib/db";
import { formatVisitTime } from "@/lib/format";
import { formatPlate, normalisePlate } from "@/lib/rules";
import { describeVehicle } from "@/lib/rules/vehicle";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Vehicles" };
export const dynamic = "force-dynamic";

const STATUS = {
  parked: { label: "Parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
} as const;

const FILTERS = [
  { value: "", label: "All cars" },
  { value: "parked", label: "Parked" },
  { value: "released", label: "Released" },
  { value: "missed", label: "Missed" },
] as const;

const TYPES = [
  { value: "", label: "All types" },
  { value: "member", label: "Members" },
  { value: "guest", label: "Guests" },
] as const;

const SORTS = [
  { value: "recent", label: "Last seen" },
  { value: "visits", label: "Most visits" },
  { value: "plate", label: "Plate" },
] as const;

const PAGE_SIZE = 30;

/** Every car the church has seen. Search by plate; filter by type, car park or last visit; sort; page. Owners' names and numbers are never listed. */
type Search = { q?: string; status?: string; type?: string; area?: string; sort?: string; page?: string };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const q = normalisePlate((sp.q ?? "").slice(0, 20));
  const status = FILTERS.some((f) => f.value && f.value === sp.status) ? (sp.status as keyof typeof STATUS) : "";
  const type = TYPES.some((t) => t.value && t.value === sp.type) ? (sp.type as "member" | "guest") : "";
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as (typeof SORTS)[number]["value"]) : "recent";
  const areas = await listActiveAreas();
  const area = areas.find((a) => a.slug === sp.area);

  // The latest cars (or the plate matches), then narrowed down and sorted here
  const all = await listVehicles(q, 300);
  const narrowed = all.filter(
    (v) =>
      (!status || v.lastStatus === status) &&
      (!type || (type === "member" ? v.isMember : !v.isMember)) &&
      (!area || v.lastAreaName === area.name),
  );
  const vehicles = [...narrowed].sort((a, b) =>
    sort === "visits" ? b.visits - a.visits || (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") : sort === "plate" ? a.plate.localeCompare(b.plate) : (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""),
  );
  const pages = Math.max(1, Math.ceil(vehicles.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const pageRows = vehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const href = (next: Partial<Search>) => {
    const merged = { q, status, type, area: area?.slug ?? "", sort: sort === "recent" ? "" : sort, page: "", ...next };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]).toString();
    return `/admin/vehicles${qs ? `?${qs}` : ""}`;
  };
  const pill = (on: boolean) =>
    `rounded-full border-2 px-4 py-2 font-semibold ${on ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"}`;

  const members = vehicles.filter((v) => v.isMember).length;
  const repeat = vehicles.filter((v) => v.visits > 1).length;

  return (
    <>
      <p className="text-ink-soft">
        {q ? "Cars matching your search." : "The cars seen most recently."} Open a car to see its latest visit. Names and phone
        numbers are not shown here.
      </p>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Cars shown", value: vehicles.length },
          { label: "Members' cars", value: members },
          { label: "Guest cars", value: vehicles.length - members },
          { label: "Seen more than once", value: repeat },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-sm font-medium text-ink-soft">{c.label}</p>
            <p className="text-3xl font-extrabold">{c.value}</p>
          </div>
        ))}
      </section>

      <form className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm lg:max-w-xl lg:flex-row lg:items-end">
        {status && <input type="hidden" name="status" value={status} />}
        {type && <input type="hidden" name="type" value={type} />}
        {area && <input type="hidden" name="area" value={area.slug} />}
        {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
        <label className="block flex-1 font-medium">
          Plate number
          <input name="q" defaultValue={q} autoComplete="off" autoCapitalize="characters" className={`${field} uppercase`} />
        </label>
        <button className={`${primaryButton} lg:w-32`}>Search</button>
      </form>

      <div className="space-y-2">
        <nav aria-label="Show cars by their last visit" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.value} href={href({ status: f.value })} aria-current={f.value === status ? "true" : undefined} className={pill(f.value === status)}>
              {f.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Type" className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Link key={t.value} href={href({ type: t.value })} aria-current={t.value === type ? "true" : undefined} className={pill(t.value === type)}>
              {t.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Last car park" className="flex flex-wrap gap-2">
          <Link href={href({ area: "" })} aria-current={!area ? "true" : undefined} className={pill(!area)}>
            All car parks
          </Link>
          {areas.map((a) => (
            <Link key={a.slug} href={href({ area: a.slug })} aria-current={a.slug === area?.slug ? "true" : undefined} className={pill(a.slug === area?.slug)}>
              {a.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-ink-soft">Sort:</span>
          {SORTS.map((o) => (
            <Link
              key={o.value}
              href={href({ sort: o.value === "recent" ? "" : o.value })}
              aria-current={o.value === sort ? "true" : undefined}
              className={`rounded-full px-3 py-1 font-semibold ${o.value === sort ? "bg-panel text-ink" : "text-accent underline"}`}
            >
              {o.label}
            </Link>
          ))}
        </nav>
      </div>

      {vehicles.length === 0 ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">
          {q ? "No car found with that plate." : status ? `No ${STATUS[status].label.toLowerCase()} cars in the latest records.` : "No cars yet."}
        </p>
      ) : (
        <>
          <ul className="grid items-start gap-3 lg:hidden">
            {pageRows.map((v) => {
              const details = describeVehicle({ make: v.make, colour: v.colour });
              const body = (
                <>
                  <VehicleImage size="sm" />
                  <span className="min-w-0 flex-1">
                    <span data-plate className="block whitespace-nowrap text-lg font-extrabold">
                      {formatPlate(v.plate)}
                    </span>
                    <span className="block truncate text-sm text-ink-soft">{details ?? "No details"}</span>
                    <span className="block text-sm text-ink-soft">
                      {v.isMember ? "Member" : "Guest"} · {v.visits} {v.visits === 1 ? "visit" : "visits"}
                      {v.lastSeen && ` · last ${formatVisitTime(v.lastSeen)}`}
                    </span>
                  </span>
                  {v.lastStatus && (
                    <StatusBadge tone={STATUS[v.lastStatus].tone} className="shrink-0">
                      {STATUS[v.lastStatus].label}
                    </StatusBadge>
                  )}
                  {v.lastVisitId && <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />}
                </>
              );
              const row = "flex items-center gap-3 rounded-card bg-card p-3 shadow-sm";
              return (
                <li key={v.id}>
                  {v.lastVisitId ? (
                    <Link href={`/admin/visits/${v.lastVisitId}`} aria-label={`Latest visit of ${formatPlate(v.plate)}`} className={`${row} hover:bg-page`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={row}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <AdminTable label="Cars" columns={["Plate", "Car", "Type", "Visits", "Last seen", "Car park", "Last visit"]}>
            {pageRows.map((v) => (
              <tr key={v.id} className="hover:bg-page">
                <td className={cell}>
                  {v.lastVisitId ? (
                    <Link
                      href={`/admin/visits/${v.lastVisitId}`}
                      aria-label={`Latest visit of ${formatPlate(v.plate)}`}
                      data-plate
                      className="whitespace-nowrap text-lg font-extrabold underline-offset-2 hover:underline"
                    >
                      {formatPlate(v.plate)}
                    </Link>
                  ) : (
                    <span data-plate className="whitespace-nowrap text-lg font-extrabold">
                      {formatPlate(v.plate)}
                    </span>
                  )}
                </td>
                <td className={`${cell} text-ink-soft`}>{describeVehicle({ make: v.make, colour: v.colour }) ?? "No details"}</td>
                <td className={cell}>{v.isMember ? "Member" : "Guest"}</td>
                <td className={cell}>{v.visits}</td>
                <td className={`${cell} whitespace-nowrap`}>{v.lastSeen ? formatVisitTime(v.lastSeen) : "-"}</td>
                <td data-area className={`${cell} whitespace-nowrap`}>{v.lastAreaName ?? "-"}</td>
                <td className={cell}>
                  {v.lastStatus ? <StatusBadge tone={STATUS[v.lastStatus].tone}>{STATUS[v.lastStatus].label}</StatusBadge> : "-"}
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
