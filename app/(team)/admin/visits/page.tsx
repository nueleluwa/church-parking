import Link from "next/link";
import { IconAlert, IconCar, IconCheck, IconChevronRight, IconClock, IconLogout, IconSearch } from "@/components/icons";
import { PageNumbers } from "@/components/Pager";
import { VehicleImage } from "@/components/VehicleImage";
import { field } from "@/components/ui";
import { countParkedNowIn, countVisitsByStatus, listActiveAreas, listAllServices, searchVisits } from "@/lib/db";
import {
  VISITS_PAGE_SIZE,
  VISIT_STATUSES,
  describeVehicle,
  durationText,
  formatPlate,
  hasRole,
  lagosDate,
  lagosParts,
  pageNumbers,
  parseVisitStatus,
  searchPlate,
  statusLabel,
  visitDuration,
  visitRange,
  type VisitListRow,
  type VisitStatus,
} from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { DownloadButton } from "../reports/DownloadButton";

export const metadata = { title: "Visits" };
export const dynamic = "force-dynamic";

type Search = { from?: string; to?: string; date?: string; service?: string; area?: string; status?: string; q?: string; page?: string };

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A status in words and a small symbol, in the church's black, grey and red only. */
function Chip({ status, held }: { status: VisitStatus; held: boolean }) {
  const look =
    status === "parked"
      ? "border-edge/70 bg-white text-ink"
      : status === "released"
        ? "border-edge/15 bg-panel text-ink-soft"
        : "border-accent bg-white text-accent";
  const icon = status === "parked" ? <IconCheck className="h-3.5 w-3.5" /> : status === "released" ? <IconLogout className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold ${look}`}>
        {icon}
        {statusLabel(status)}
      </span>
      {held && <span className="whitespace-nowrap rounded-full border border-accent px-2.5 py-0.5 text-sm font-semibold text-accent">On hold</span>}
    </span>
  );
}

function Summary({
  label,
  value,
  note,
  href,
  id,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  href: string;
  id: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-edge/15 bg-card p-4 hover:bg-page">
      <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-page text-ink sm:flex">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-soft">{label}</span>
        <span data-testid={id} className="block text-3xl font-extrabold leading-tight">
          {value}
        </span>
        <span className="block text-xs text-ink-soft">{note}</span>
      </span>
      <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
    </Link>
  );
}

const inputClass = `${field} !mt-1 !py-2.5 !text-base`;

/**
 * Every visit, by dates, service, parking area, status and plate, a page at a time. A row is one visit (a car's stay), not an entry or an exit.
 * The totals count visits in the chosen dates; "Currently parked" is live and ignores them. Names and phone numbers are never listed.
 */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requireStaff("coordinator");
  const sp = await searchParams;
  const today = lagosDate(new Date());
  const range = visitRange(sp.from, sp.to, sp.date, today);

  const [areas, allServices] = await Promise.all([listActiveAreas(), listAllServices()]);
  const services = allServices.filter((s) => s.active || String(s.id) === sp.service);
  const area = areas.find((a) => a.slug === sp.area) ?? null;
  const service = services.find((s) => String(s.id) === sp.service) ?? null;
  const status = parseVisitStatus(sp.status);
  const plate = searchPlate(sp.q);
  const filter = { from: range.from, to: range.to, serviceId: service?.id ?? null, areaId: area?.id ?? null, status, plate };

  const [counts, parkedNow] = await Promise.all([countVisitsByStatus(filter), countParkedNowIn(filter.serviceId, filter.areaId)]);
  const periodTotal = counts.parked + counts.released + counts.missed;
  const matching = status ? counts[status] : periodTotal;
  const pages = Math.max(1, Math.ceil(matching / VISITS_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const { rows } = await searchVisits(filter, page, VISITS_PAGE_SIZE);
  const first = matching === 0 ? 0 : (page - 1) * VISITS_PAGE_SIZE + 1;
  const last = (page - 1) * VISITS_PAGE_SIZE + rows.length;

  const scope = (over: Partial<Search> = {}) => {
    const merged: Record<string, string> = {
      from: range.from,
      to: range.to,
      ...(service ? { service: String(service.id) } : {}),
      ...(area ? { area: area.slug } : {}),
      ...(status ? { status } : {}),
      ...(plate ? { q: plate } : {}),
      ...over,
    } as Record<string, string>;
    return new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
  };
  const href = (over: Partial<Search> = {}) => `/admin/visits?${scope(over)}`;
  const isAdmin = hasRole(staff.role, "admin");
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
  ];
  const periodNote = range.from === range.to ? "This day" : "This period";
  const filtersOn = Boolean(service || area || status || plate || sp.from || sp.to || sp.date);

  const view = (v: VisitListRow) => `/admin/visits/${v.id}`;
  const entry = (v: VisitListRow) => lagosParts(v.checkedInAt);

  return (
    <>
      <header>
        <h1 className="text-2xl font-extrabold">Visits</h1>
        <p className="text-ink-soft">View and manage all parking visits. Each visit represents a vehicle&apos;s entry and exit record.</p>
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary
          id="v-total"
          label="Total visits"
          value={periodTotal}
          note={counts.missed > 0 ? `${periodNote} · ${counts.missed} missed` : periodNote}
          href={href({ status: "", page: "" })}
          icon={<IconCar className="h-5 w-5" />}
        />
        <Summary id="v-checked-in" label="Checked in" value={counts.parked} note={`Open visits · ${periodNote.toLowerCase()}`} href={href({ status: "parked", page: "" })} icon={<IconCheck className="h-5 w-5" />} />
        <Summary id="v-released" label="Released" value={counts.released} note={`Released at the exit · ${periodNote.toLowerCase()}`} href={href({ status: "released", page: "" })} icon={<IconLogout className="h-5 w-5" />} />
        <Summary
          id="v-parked-now"
          label="Currently parked"
          value={parkedNow}
          note="On site right now, any date"
          href={`/admin/visits?${new URLSearchParams({ from: today, to: today, status: "parked", ...(service ? { service: String(service.id) } : {}), ...(area ? { area: area.slug } : {}) })}`}
          icon={<IconClock className="h-5 w-5" />}
        />
      </section>

      <form aria-label="Filters" className="space-y-3 rounded-2xl border border-edge/15 bg-card p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr]">
          <div className="col-span-2 grid grid-cols-2 gap-3 xl:col-span-1">
            <label className="block text-sm font-medium">
              From
              <input type="date" name="from" defaultValue={range.from} max={today} required className={`${inputClass} !px-3`} />
            </label>
            <label className="block text-sm font-medium">
              To
              <input type="date" name="to" defaultValue={range.to} max={today} required className={`${inputClass} !px-3`} />
            </label>
          </div>
          <label className="col-span-2 block text-sm font-medium xl:col-span-1">
            Service
            <select name="service" defaultValue={service ? String(service.id) : ""} className={inputClass}>
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Parking area
            <select name="area" defaultValue={area?.slug ?? ""} className={inputClass}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Status
            <select name="status" defaultValue={status ?? ""} className={inputClass}>
              <option value="">All statuses</option>
              {VISIT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium">
            Search by vehicle number
            <span className="relative mt-1 block">
              <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
              <input name="q" defaultValue={plate} autoComplete="off" autoCapitalize="characters" placeholder="Search by vehicle number…" className={`${field} !mt-0 !py-2.5 !pl-11 !text-base uppercase`} />
            </span>
          </label>
          <div className="flex gap-2">
            <Link href="/admin/visits" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-edge/70 bg-white px-6 font-semibold hover:bg-page sm:flex-none">
              Reset
            </Link>
            <button className="min-h-12 flex-1 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark sm:flex-none">Apply filters</button>
          </div>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {presets.map((p) => (
            <Link key={p.label} href={href({ from: p.from, to: p.to, page: "" })} className="font-semibold text-accent underline">
              {p.label}
            </Link>
          ))}
        </p>
        {range.error && (
          <p role="alert" className="font-semibold text-accent">
            {range.error}
          </p>
        )}
        <p className="text-xs text-ink-soft">
          Total, Checked in and Released count visits in the dates chosen. Currently parked is live: it counts every car on site now and ignores the dates.
        </p>
      </form>

      <section aria-label="Visits" className="rounded-2xl border border-edge/15 bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">
            Visits (<span data-testid="v-count">{matching}</span>)
          </h2>
          {isAdmin && (
            <DownloadButton
              outline
              label="Export"
              report="the visits shown"
              href={`/admin/reports/export?report=visit-list&${scope({ page: "" })}`}
            />
          )}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">
            No visits match these filters.{" "}
            {filtersOn && (
              <Link href="/admin/visits" className="font-semibold text-accent underline">
                Reset filters
              </Link>
            )}
          </p>
        ) : (
          <>
            <ul className="grid gap-3 xl:hidden">
              {rows.map((v) => {
                const d = visitDuration(v);
                return (
                  <li key={v.id}>
                    <Link href={view(v)} aria-label={`Visit of ${formatPlate(v.plate)}`} className="flex items-center gap-3 rounded-xl border border-edge/10 p-3 hover:bg-page">
                      <VehicleImage size="sm" />
                      <span className="min-w-0 flex-1">
                        <span data-plate className="block whitespace-nowrap text-lg font-extrabold">
                          {formatPlate(v.plate)}
                        </span>
                        <span className="block text-sm text-ink-soft">
                          <span data-area>{v.areaName}</span> · {v.serviceName}
                        </span>
                        <span className="block text-sm text-ink-soft">
                          {v.member ? "Member" : "Guest"} · {entry(v).date} {entry(v).time}
                          {v.releasedAt && ` → ${lagosParts(v.releasedAt).time}`}
                          {d !== null && ` · ${durationText(d)}`}
                        </span>
                        <span className="mt-1 block">
                          <Chip status={v.status} held={v.held} />
                        </span>
                      </span>
                      <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[56rem] text-left">
                <caption className="sr-only">Visits</caption>
                <thead className="border-b border-edge/20 text-sm text-ink-soft">
                  <tr>
                    {["Vehicle", "Type", "Service", "Parking area", "Entry time", "Exit time", "Duration", "Status", "Actions"].map((c) => (
                      <th key={c} scope="col" className="whitespace-nowrap px-2.5 py-3 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/15">
                  {rows.map((v) => {
                    const d = visitDuration(v);
                    const details = describeVehicle({ make: v.make, colour: v.colour });
                    return (
                      <tr key={v.id} className="hover:bg-page">
                        <td className="px-2.5 py-3">
                          <span className="flex items-center gap-3">
                            <VehicleImage size="sm" />
                            <span className="min-w-0">
                              <Link href={view(v)} aria-label={`Visit of ${formatPlate(v.plate)}`} data-plate className="block whitespace-nowrap text-lg font-extrabold underline-offset-2 hover:underline">
                                {formatPlate(v.plate)}
                              </Link>
                              {details && <span className="block truncate text-sm text-ink-soft">{details}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-3 whitespace-nowrap">{v.member ? "Member" : "Guest"}</td>
                        <td className="px-2.5 py-3">{v.serviceName}</td>
                        <td data-area className="px-2.5 py-3 whitespace-nowrap">
                          {v.areaName}
                        </td>
                        <td className="px-2.5 py-3 whitespace-nowrap">
                          <span className="block">{entry(v).date}</span>
                          <span className="block text-sm text-ink-soft">{entry(v).time}</span>
                        </td>
                        <td className="px-2.5 py-3 whitespace-nowrap">
                          {v.releasedAt ? (
                            <>
                              <span className="block">{lagosParts(v.releasedAt).date}</span>
                              <span className="block text-sm text-ink-soft">{lagosParts(v.releasedAt).time}</span>
                            </>
                          ) : (
                            <span className="text-ink-soft">{v.status === "parked" ? "Not yet released" : "-"}</span>
                          )}
                        </td>
                        <td className="px-2.5 py-3 whitespace-nowrap">{d === null ? <span className="text-ink-soft">-</span> : durationText(d)}</td>
                        <td className="px-2.5 py-3">
                          <Chip status={v.status} held={v.held} />
                        </td>
                        <td className="px-2.5 py-3">
                          <Link href={view(v)} aria-label={`View visit of ${formatPlate(v.plate)}`} className="inline-flex min-h-10 items-center rounded-lg border border-edge/30 bg-white px-4 font-semibold hover:bg-page">
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-soft" data-testid="v-showing">
                Showing {first}–{last} of {matching} {matching === 1 ? "visit" : "visits"}
              </p>
              <PageNumbers page={page} pages={pages} numbers={pageNumbers(page, pages)} href={(p) => href({ page: String(p) })} />
            </div>
          </>
        )}
      </section>
    </>
  );
}
