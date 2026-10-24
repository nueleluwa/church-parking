import Link from "next/link";
import { IconAlert, IconCar, IconCheck, IconChevronRight, IconClock, IconLogout, IconSearch } from "@/components/icons";
import { Chip } from "@/components/ds/Chip";
import { EmptyState } from "@/components/ds/EmptyState";
import { MetricCard, MetricRow } from "@/components/ds/MetricCard";
import { PageHeader } from "@/components/ds/PageHeader";
import { VehicleIdentity } from "@/components/ds/VehicleIdentity";
import { PageNumbers } from "@/components/Pager";
import { countParkedNowIn, countVisitsByStatus, getSettings, listActiveAreas, listAllServices, resolveVisitExtras, searchVisits } from "@/lib/db";
import {
  VISITS_PAGE_SIZE,
  VISIT_STATUSES,
  durationText,
  formatPlate,
  hasRole,
  isLongSession,
  lagosDate,
  lagosParts,
  longSessionLabel,
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

type Search = { from?: string; to?: string; date?: string; service?: string; area?: string; status?: string; q?: string; phone?: string; long?: string; page?: string };

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A visit's status in words and a small mark, in the church's black, grey and red only. */
function VisitChip({ status, held, longLabel }: { status: VisitStatus; held: boolean; longLabel?: string | null }) {
  const tone = status === "parked" ? "on" : status === "released" ? "off" : "alert";
  const icon = status === "parked" ? <IconCheck className="h-3.5 w-3.5" /> : status === "released" ? <IconLogout className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Chip tone={tone} icon={icon}>
        {statusLabel(status)}
      </Chip>
      {longLabel && <Chip tone="alert">{longLabel}</Chip>}
      {held && <Chip tone="alert">On hold</Chip>}
    </span>
  );
}

const inputClass = "input";

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
  const isAdmin = hasRole(staff.role, "admin");
  const longHours = (await getSettings()).longSessionHours;
  const now = new Date();
  // "Open longer than N hours" only ever means open visits, whatever status was asked for
  const long = sp.long === "1";
  const status = long ? ("parked" as VisitStatus) : parseVisitStatus(sp.status);
  const plate = searchPlate(sp.q);
  // The phone search is for administrators; coordinators do not see the box and the setting is ignored for them
  const extras = await resolveVisitExtras({ phone: sp.phone, long: sp.long }, { isAdmin, longHours, now });
  const filter = { from: range.from, to: range.to, serviceId: service?.id ?? null, areaId: area?.id ?? null, status, plate, memberId: extras.memberId, openBefore: extras.openBefore };

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
      ...(extras.phoneUsed ? { phone: (sp.phone ?? "").trim() } : {}),
      ...(long ? { long: "1" } : {}),
      ...over,
    } as Record<string, string>;
    return new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
  };
  const href = (over: Partial<Search> = {}) => `/admin/visits?${scope(over)}`;
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
  ];
  const periodNote = range.from === range.to ? "This day" : "This period";
  const filtersOn = Boolean(service || area || status || plate || long || extras.phoneUsed || sp.from || sp.to || sp.date);

  const view = (v: VisitListRow) => `/admin/visits/${v.id}`;
  const entry = (v: VisitListRow) => lagosParts(v.checkedInAt);

  return (
    <>
      <PageHeader title="Visits">View and manage all parking visits. Each visit represents a vehicle&apos;s entry and exit record.</PageHeader>

      <MetricRow>
        <MetricCard
          id="v-total"
          label="Total visits"
          value={periodTotal}
          note={counts.missed > 0 ? `${periodNote} · ${counts.missed} missed` : periodNote}
          href={href({ status: "", page: "" })}
          icon={<IconCar className="h-5 w-5" />}
        />
        <MetricCard id="v-checked-in" label="Checked in" value={counts.parked} note={`Open visits · ${periodNote.toLowerCase()}`} href={href({ status: "parked", page: "" })} icon={<IconCheck className="h-5 w-5" />} />
        <MetricCard id="v-released" label="Released" value={counts.released} note={`Released at the exit · ${periodNote.toLowerCase()}`} href={href({ status: "released", page: "" })} icon={<IconLogout className="h-5 w-5" />} />
        <MetricCard
          id="v-parked-now"
          label="Currently parked"
          value={parkedNow}
          note="On site right now, any date"
          href={`/admin/visits?${new URLSearchParams({ from: today, to: today, status: "parked", ...(service ? { service: String(service.id) } : {}), ...(area ? { area: area.slug } : {}) })}`}
          icon={<IconClock className="h-5 w-5" />}
        />
      </MetricRow>

      <form noValidate aria-label="Filters" className="space-y-4 rounded-2xl border border-edge/15 bg-card p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="flex flex-wrap gap-2 text-sm">
            {presets.map((p) => (
              <Link key={p.label} href={href({ from: p.from, to: p.to, page: "" })} className="btn btn-quiet">
                {p.label}
              </Link>
            ))}
          </p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="long" value="1" defaultChecked={long} className="h-5 w-5 accent-accent" />
            Only visits open longer than {longHours} hours
          </label>
        </div>
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
          {isAdmin && (
            <label className="block text-sm font-medium sm:w-56">
              Member&apos;s phone number
              <input name="phone" type="tel" inputMode="tel" defaultValue={extras.phoneUsed ? (sp.phone ?? "") : ""} autoComplete="off" placeholder="0803 123 4567" aria-invalid={Boolean(extras.phoneProblem)} className={inputClass} />
            </label>
          )}
          <label className="block flex-1 text-sm font-medium">
            Search by vehicle number
            <span className="relative mt-1 block">
              <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
              <input name="q" defaultValue={plate} autoComplete="off" autoCapitalize="characters" placeholder="Search by vehicle number…" className="input !mt-0 !pl-11 uppercase" />
            </span>
          </label>
          <div className="flex gap-2">
            <Link href="/admin/visits" className="btn btn-outline flex-1 sm:flex-none">
              Reset
            </Link>
            <button className="btn btn-primary flex-1 sm:flex-none">Apply filters</button>
          </div>
        </div>
        {extras.phoneProblem && (
          <p role="alert" className="font-semibold text-accent">
            {extras.phoneProblem}
          </p>
        )}
        {range.error && (
          <p role="alert" className="font-semibold text-accent">
            {range.error}
          </p>
        )}
        <p className="text-xs text-ink-soft">
          Total, Checked in and Released count visits in the dates chosen. Currently parked is live: it counts every car on site now and ignores the dates.
        </p>
      </form>

      <section aria-label="Visits" className="surface">
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
          <EmptyState
            action={
              filtersOn && (
                <Link href="/admin/visits" className="font-semibold text-accent underline">
                  Reset filters
                </Link>
              )
            }
          >
            No visits match these filters.
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-3 wide:hidden">
              {rows.map((v) => {
                const d = visitDuration(v);
                return (
                  <li key={v.id} className="min-w-0">
                    <Link href={view(v)} aria-label={`Visit of ${formatPlate(v.plate)}`} className="row-card">
                      <VehicleIdentity plate={v.plate} detail={false}>
                        <span className="t-support block">
                          <span data-area>{v.areaName}</span> · {v.serviceName}
                        </span>
                        <span className="t-support block">
                          {v.member ? "Member" : "Guest"} · {entry(v).date} {entry(v).time}
                          {v.releasedAt && ` → ${lagosParts(v.releasedAt).time}`}
                          {d !== null && ` · ${durationText(d)}`}
                        </span>
                        <span className="mt-1.5 block">
                          <VisitChip status={v.status} held={v.held} longLabel={isLongSession(v, now, longHours) ? longSessionLabel(longHours) : null} />
                        </span>
                      </VehicleIdentity>
                      <IconChevronRight aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-ink-soft" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto wide:block">
              <table className="dt min-w-[56rem]">
                <caption className="sr-only">Visits</caption>
                <thead>
                  <tr>
                    {["Vehicle", "Type", "Service", "Parking area", "Entry time", "Exit time", "Duration", "Status", "Actions"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const d = visitDuration(v);
                    return (
                      <tr key={v.id}>
                        <td className="dt-td max-w-[20rem]">
                          <VehicleIdentity plate={v.plate} make={v.make} colour={v.colour} href={view(v)} ariaLabel={`Visit of ${formatPlate(v.plate)}`} />
                        </td>
                        <td className="dt-td whitespace-nowrap">{v.member ? "Member" : "Guest"}</td>
                        <td className="dt-td">{v.serviceName}</td>
                        <td data-area className="dt-td whitespace-nowrap">
                          {v.areaName}
                        </td>
                        <td className="dt-td whitespace-nowrap">
                          <span className="block">{entry(v).date}</span>
                          <span className="block text-sm text-ink-soft">{entry(v).time}</span>
                        </td>
                        <td className="dt-td whitespace-nowrap">
                          {v.releasedAt ? (
                            <>
                              <span className="block">{lagosParts(v.releasedAt).date}</span>
                              <span className="block text-sm text-ink-soft">{lagosParts(v.releasedAt).time}</span>
                            </>
                          ) : (
                            <span className="text-ink-soft">{v.status === "parked" ? "Not yet released" : "-"}</span>
                          )}
                        </td>
                        <td className="dt-td whitespace-nowrap">{d === null ? <span className="text-ink-soft">-</span> : durationText(d)}</td>
                        <td className="dt-td">
                          <VisitChip status={v.status} held={v.held} longLabel={isLongSession(v, now, longHours) ? longSessionLabel(longHours) : null} />
                        </td>
                        <td className="dt-td">
                          <Link href={view(v)} aria-label={`View visit of ${formatPlate(v.plate)}`} className="btn btn-quiet">
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
