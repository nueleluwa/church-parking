import Link from "next/link";
import { IconAlert, IconCar, IconLogout, IconSearch } from "@/components/icons";
import { field } from "@/components/ui";
import { countReleasedToday, listActiveAreas, listActiveServices, listOnSite } from "@/lib/db";
import {
  describeVehicle,
  elapsedMinutes,
  filterOnSite,
  isOverstaying,
  lagosDate,
  lagosParts,
  markedStillHere,
  searchPlate,
  serviceEndInstant,
  serviceTimes,
  servicesToday,
  sortOnSite,
  sweepCandidates,
  sweepSummary,
  type SweepFilter,
  type SweepSort,
} from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { SweepBoard, type BoardRow } from "./SweepBoard";

export const metadata = { title: "Sweep" };
export const dynamic = "force-dynamic";

type Search = { area?: string; service?: string; timing?: string; status?: string; q?: string; sort?: string; sweep?: string };

const hhmm = (t: string) => t.slice(0, 5);
const inputClass = `${field} !mt-1 !py-2.5 !text-base`;

function Summary({ label, value, note, icon, id, href }: { label: string; value: string; note: string; icon: React.ReactNode; id: string; href?: string }) {
  const body = (
    <>
      <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-page text-ink sm:flex">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-soft">{label}</span>
        <span data-testid={id} className="block text-3xl font-extrabold leading-tight">
          {value}
        </span>
        <span className="block text-xs text-ink-soft">{note}</span>
      </span>
    </>
  );
  const box = "flex items-center gap-3 rounded-2xl border border-edge/15 bg-card p-4";
  return href ? (
    <Link href={href} className={`${box} hover:bg-page`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/**
 * Sweep: the cars still recorded as parked, and what a team lead can record about them (Still here, or Gone). It reconciles; it never
 * releases a car. See lib/rules/sweep.ts for what each word means.
 */
export default async function SweepPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("coordinator");
  const sp = await searchParams;
  const now = new Date();
  const nowMs = now.getTime();
  const today = lagosDate(now);

  const [all, releasedToday, areas, activeServices] = await Promise.all([listOnSite(), countReleasedToday(today), listActiveAreas(), listActiveServices()]);
  const todays = servicesToday(now, activeServices);
  const summary = sweepSummary(all, nowMs);

  const sweepService = activeServices.find((s) => String(s.id) === sp.sweep) ?? null;
  const base = sweepService ? sweepCandidates(all, { id: sweepService.id, startsAt: sweepService.starts_at }) : all;

  const filter: SweepFilter = {
    areaSlug: areas.find((a) => a.slug === sp.area)?.slug ?? "",
    serviceId: activeServices.find((s) => String(s.id) === sp.service)?.id ?? null,
    timing: sp.timing === "within" || sp.timing === "longer" ? sp.timing : "",
    status: sp.status === "onsite" || sp.status === "overstaying" || sp.status === "stillhere" ? sp.status : "",
    plate: searchPlate(sp.q),
  };
  const sort: SweepSort = sp.sort === "newest" || sp.sort === "area" ? sp.sort : "oldest";
  const rows = sortOnSite(filterOnSite(base, filter, nowMs), sort);
  const anyFilter = Boolean(filter.areaSlug || filter.serviceId !== null || filter.timing || filter.status || filter.plate);

  const board: BoardRow[] = rows.map((v) => {
    const entry = lagosParts(v.checkedInAt);
    return {
      id: v.id,
      plate: v.plate,
      detail: describeVehicle({ make: v.make, colour: v.colour }),
      member: v.member,
      serviceId: v.serviceId,
      serviceName: v.serviceName,
      serviceTimes: serviceTimes(v),
      areaName: v.areaName,
      entryDate: entry.date,
      entryTime: entry.time,
      checkedInAt: v.checkedInAt,
      elapsed: elapsedMinutes(v, nowMs),
      overstaying: isOverstaying(v, nowMs),
      stillHere: markedStillHere(v),
      held: v.held,
    };
  });

  const options = todays.map((s) => ({
    id: s.id,
    label: `${s.name} (${hhmm(s.starts_at)} – ${hhmm(s.ends_at)})`,
    endsAt: hhmm(s.ends_at),
    ended: nowMs >= serviceEndInstant({ serviceDate: today, serviceEnd: s.ends_at }),
  }));

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Sweep</h1>
          <p className="text-ink-soft">Manage vehicles still on site and record their check-out.</p>
        </div>
        <Link href="/staff/sweep/history" className="inline-flex min-h-12 items-center rounded-full border-2 border-edge/70 bg-white px-5 font-semibold hover:bg-page">
          View sweep history
        </Link>
      </header>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary id="sw-on-site" label="Vehicles on site" value={String(summary.onSite)} note="Currently parked" icon={<IconCar className="h-5 w-5" />} href="/staff/sweep" />
        <Summary
          id="sw-overstaying"
          label="Overstaying"
          value={String(summary.overstaying)}
          note="30+ minutes after the service ended"
          icon={<IconAlert className="h-5 w-5" />}
          href="/staff/sweep?status=overstaying"
        />
        <Summary id="sw-no-record" label="No check-in record" value="Not tracked" note="Cars with no visit are added at the exit" icon={<IconSearch className="h-5 w-5" />} href="/staff/register" />
        <Summary id="sw-released" label="Released today" value={String(releasedToday)} note="Released at the exit today" icon={<IconLogout className="h-5 w-5" />} />
      </section>

      <form aria-label="Filters" className="space-y-3 rounded-2xl border border-edge/15 bg-card p-4">
        {sweepService && <input type="hidden" name="sweep" value={sweepService.id} />}
        {sort !== "oldest" && <input type="hidden" name="sort" value={sort} />}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <label className="block text-sm font-medium">
            Parking area
            <select name="area" defaultValue={filter.areaSlug} className={inputClass}>
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Service
            <select name="service" defaultValue={filter.serviceId === null ? "" : String(filter.serviceId)} className={inputClass}>
              <option value="">All services</option>
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Duration
            <select name="timing" defaultValue={filter.timing} className={inputClass}>
              <option value="">All durations</option>
              <option value="within">Within its service time</option>
              <option value="longer">Longer than its service</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Status
            <select name="status" defaultValue={filter.status} className={inputClass}>
              <option value="">All statuses</option>
              <option value="onsite">On site</option>
              <option value="overstaying">Overstaying</option>
              <option value="stillhere">Marked still here</option>
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium">
            Search by vehicle number
            <span className="relative mt-1 block">
              <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
              <input name="q" defaultValue={filter.plate} autoComplete="off" autoCapitalize="characters" placeholder="Search by vehicle number…" className={`${field} !mt-0 !py-2.5 !pl-11 !text-base uppercase`} />
            </span>
          </label>
          <div className="flex gap-2">
            <Link href={sweepService ? `/staff/sweep?sweep=${sweepService.id}` : "/staff/sweep"} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-edge/70 bg-white px-6 font-semibold hover:bg-page sm:flex-none">
              Reset
            </Link>
            <button className="min-h-12 flex-1 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark sm:flex-none">Apply filters</button>
          </div>
        </div>
        <p className="text-xs text-ink-soft">
          Overstaying means still recorded as parked 30 or more minutes after the service the car checked in for ended. Duration compares the time on site with the length of that service.
        </p>
      </form>

      <SweepBoard
        // A new filter or sort starts a fresh selection; a refresh after an action keeps it
        key={`${sweepService?.id ?? "all"}|${filter.areaSlug}|${filter.serviceId}|${filter.timing}|${filter.status}|${filter.plate}|${sort}`}
        rows={board}
        total={all.length}
        sort={sort}
        sweepService={sweepService ? { id: sweepService.id, name: sweepService.name } : null}
        services={options}
        anyFilter={anyFilter}
      />
    </>
  );
}
