"use client";

import { useToast } from "@/components/ds/Toast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { IconAlert, IconCheck, IconClock } from "@/components/icons";
import { Chip as DsChip } from "@/components/ds/Chip";
import { VehicleIdentity } from "@/components/ds/VehicleIdentity";
import { elapsedText, formatPlate, SWEEP_SORTS, type SweepSort } from "@/lib/rules";
import { sweepAction, sweepStillHereManyAction } from "../ops-actions";

export type BoardRow = {
  id: string;
  plate: string;
  detail: string | null;
  member: boolean;
  serviceId: number;
  serviceName: string;
  serviceTimes: string;
  areaName: string;
  /** Entry time, already in Lagos time. */
  entryDate: string;
  entryTime: string;
  checkedInAt: string;
  /** Minutes on site when the page was made. */
  elapsed: number;
  overstaying: boolean;
  stillHere: boolean;
  held: boolean;
};

export type SweepServiceOption = { id: number; label: string; endsAt: string; ended: boolean };

const PAGE_SIZE = 20;

/** The time on site, counting up by itself every half minute without reloading the page. */
function Elapsed({ since, initial }: { since: string; initial: number }) {
  const [minutes, setMinutes] = useState(initial);
  useEffect(() => {
    const tick = setInterval(() => setMinutes(Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60_000))), 30_000);
    return () => clearInterval(tick);
  }, [since]);
  return <span suppressHydrationWarning>{elapsedText(minutes)}</span>;
}

function Chip({ row }: { row: BoardRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <DsChip tone={row.overstaying ? "alert" : "on"} icon={row.overstaying ? <IconAlert className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}>
        {row.overstaying ? "Overstaying" : "On site"}
      </DsChip>
      {row.stillHere && <DsChip tone="off">Marked still here</DsChip>}
      {row.held && <DsChip tone="alert">On hold</DsChip>}
    </span>
  );
}

const outline = "btn btn-quiet";

/**
 * The cars on site, with the actions a sweep allows. Marking a car "Still here" keeps its visit open; marking it "Gone" closes it as a missed
 * check-out, one car at a time and after a confirmation. Nothing here releases a car: that is done at the exit, against the pass.
 */
export function SweepBoard({
  rows,
  total,
  sort,
  sweepService,
  services,
  anyFilter,
}: {
  rows: BoardRow[];
  /** All cars on site, before any filter. */
  total: number;
  sort: SweepSort;
  /** The service whose end-of-service sweep is being reviewed, if one is. */
  sweepService: { id: number; name: string } | null;
  services: SweepServiceOption[];
  anyFilter: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [gone, setGone] = useState<Set<string>>(new Set()); // closed as missed in this view
  const [here, setHere] = useState<Set<string>>(new Set()); // marked still here in this view
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ kind: "gone"; id: string } | { kind: "many" } | null>(null);
  const toast = useToast();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  /** The message next to the list, and a toast: both only after the server has answered. */
  const notify = (ok: boolean, message: string) => {
    setNotice({ ok, message });
    if (ok) toast.success("Sweep updated.");
  };
  const [pending, start] = useTransition();
  const [pick, setPick] = useState(services[0]?.id ? String(services[0].id) : "");

  const visible = useMemo(() => rows.filter((r) => !gone.has(r.id)), [rows, gone]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const first = visible.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const last = (current - 1) * PAGE_SIZE + shown.length;
  const stillHere = (r: BoardRow) => r.stillHere || here.has(r.id);
  const chosen = visible.filter((r) => selected.has(r.id));
  const onPage = shown.every((r) => selected.has(r.id)) && shown.length > 0;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((s) => {
      const next = new Set(s);
      for (const r of shown) {
        if (onPage) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  function markHere(id: string) {
    start(async () => {
      const r = await sweepAction(id, false, sweepService?.id ?? rows.find((x) => x.id === id)!.serviceId);
      if (r.ok) {
        setHere((h) => new Set(h).add(id));
        notify(true, "Marked Still here. The visit stays open.");
        router.refresh();
      } else {
        notify(false, r.message);
      }
    });
  }

  function confirmGone(id: string) {
    setConfirm(null);
    start(async () => {
      const r = await sweepAction(id, true, sweepService?.id ?? rows.find((x) => x.id === id)!.serviceId);
      if (r.ok) {
        setGone((g) => new Set(g).add(id));
        setSelected((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        notify(true, "Closed as a missed check-out. This is not a release.");
        router.refresh();
      } else {
        notify(false, r.message);
      }
    });
  }

  function confirmMany() {
    const ids = chosen.map((r) => r.id);
    setConfirm(null);
    start(async () => {
      const r = await sweepStillHereManyAction(ids, sweepService?.id ?? null);
      setHere((h) => new Set([...h, ...r.done]));
      // Anything that could not be marked stays selected, so it can be looked at again
      setSelected(new Set(r.failed.map((f) => f.visitId)));
      notify(r.ok, r.message);
      router.refresh();
    });
  }

  function changeSort(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "oldest") next.delete("sort");
    else next.set("sort", value);
    router.replace(`/staff/sweep${next.toString() ? `?${next}` : ""}`);
  }

  const goneRow = confirm?.kind === "gone" ? rows.find((r) => r.id === confirm.id) : null;
  const picked = services.find((s) => String(s.id) === pick);

  const actions = (r: BoardRow, withView = true) => (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => markHere(r.id)} disabled={pending || stillHere(r)} className={outline}>
        {stillHere(r) ? "Still here ✓" : "Still here"}
      </button>
      <button type="button" onClick={() => setConfirm({ kind: "gone", id: r.id })} disabled={pending} className={outline}>
        Gone
      </button>
      {withView && (
        <Link href={`/admin/visits/${r.id}`} aria-label={`View visit of ${formatPlate(r.plate)}`} className={outline}>
          View
        </Link>
      )}
    </div>
  );

  return (
    <div className="grid items-start gap-4 min-[1700px]:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Vehicles on site" className="surface">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">
              Vehicles on site (<span data-testid="board-count">{visible.length}</span>)
            </h2>
            <p className="text-sm text-ink-soft">
              {sweepService
                ? `Cars still parked from ${sweepService.name} or earlier that are not yet marked in its sweep.`
                : "Vehicles currently parked and awaiting check-out at the exit."}
            </p>
          </div>
          <label className="block text-sm font-medium text-ink-soft">
            Sort by
            <select value={sort} onChange={(e) => changeSort(e.target.value)} className="ml-2 min-h-10 rounded-lg border border-edge/30 bg-white px-2 font-semibold text-ink">
              {SWEEP_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={`mb-3 rounded-xl border p-3 font-medium ${notice.ok ? "border-edge/30 bg-page" : "border-accent bg-white text-accent"}`}>
            {notice.message}
          </p>
        )}

        {goneRow && (
          <div role="alertdialog" aria-label="Please confirm" className="mb-3 space-y-3 rounded-xl border-2 border-edge bg-white p-4">
            <p className="font-semibold">
              Mark {formatPlate(goneRow.plate)} as gone? Its visit will be closed as a missed check-out, because the car left without being released.
              This is not a release.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => confirmGone(goneRow.id)} disabled={pending} className="min-h-11 rounded-full bg-accent px-5 font-semibold text-white hover:bg-accent-dark">
                Yes, mark as gone
              </button>
              <button type="button" onClick={() => setConfirm(null)} className="min-h-11 rounded-full border-2 border-edge/70 bg-white px-5 font-semibold hover:bg-page">
                Cancel
              </button>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">
            {total === 0 ? "No cars are recorded as parked. All clear." : anyFilter ? "No vehicles match these filters." : "No cars left to check. All done."}
          </p>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={onPage} onChange={togglePage} className="h-5 w-5 accent-[var(--color-accent)]" />
              Select all {shown.length} on this page
            </label>

            <ul className="grid gap-3 wide:hidden">
              {shown.map((r) => (
                <li key={r.id} className="rounded-xl border border-edge/10 p-3">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${formatPlate(r.plate)}`} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
                    <VehicleIdentity plate={r.plate} detail={false}>
                      <span className="t-support block">
                        {r.serviceName} · {r.serviceTimes}
                      </span>
                      <span className="t-support block">
                        <span data-area>{r.areaName}</span> · {r.entryDate} {r.entryTime}
                      </span>
                      <span className="t-support flex items-center gap-1">
                        <IconClock className="h-4 w-4" /> <Elapsed since={r.checkedInAt} initial={r.elapsed} />
                      </span>
                      <span className="mt-1.5 block">
                        <Chip row={{ ...r, stillHere: stillHere(r) }} />
                      </span>
                    </VehicleIdentity>
                  </div>
                  <div className="mt-3">{actions(r)}</div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto wide:block">
              <table className="dt min-w-[46rem]">
                <caption className="sr-only">Vehicles on site</caption>
                <thead>
                  <tr>
                    <th scope="col" className="dt-th w-9">
                      <input type="checkbox" checked={onPage} onChange={togglePage} aria-label="Select all on this page" className="h-5 w-5 accent-[var(--color-accent)]" />
                    </th>
                    {["Vehicle", "Service", "Parking area", "Entry time", "Duration", "Status", "Actions"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td className="dt-td">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${formatPlate(r.plate)}`} className="h-5 w-5 accent-[var(--color-accent)]" />
                      </td>
                      <td className="dt-td max-w-[20rem]">
                        <VehicleIdentity plate={r.plate} summary={r.detail} href={`/admin/visits/${r.id}`} ariaLabel={`View visit of ${formatPlate(r.plate)}`} />
                      </td>
                      <td className="dt-td">
                        <span className="block">{r.serviceName}</span>
                        <span className="block text-sm text-ink-soft">{r.serviceTimes}</span>
                      </td>
                      <td data-area className="dt-td whitespace-nowrap">
                        {r.areaName}
                      </td>
                      <td className="dt-td whitespace-nowrap">
                        <span className="block">{r.entryDate}</span>
                        <span className="block text-sm text-ink-soft">{r.entryTime}</span>
                      </td>
                      <td className="dt-td whitespace-nowrap">
                        <Elapsed since={r.checkedInAt} initial={r.elapsed} />
                      </td>
                      <td className="dt-td">
                        <Chip row={{ ...r, stillHere: stillHere(r) }} />
                      </td>
                      <td className="dt-td">{actions(r, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-soft" data-testid="board-showing">
                Showing {first}–{last} of {visible.length} {visible.length === 1 ? "vehicle" : "vehicles"}
              </p>
              {pages > 1 && (
                <nav aria-label="Pages" className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-edge/20 bg-white font-semibold disabled:text-ink-soft/40">
                    ‹
                  </button>
                  <span className="px-2 text-sm font-semibold" aria-current="page">
                    Page {current} of {pages}
                  </span>
                  <button type="button" onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page" className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-edge/20 bg-white font-semibold disabled:text-ink-soft/40">
                    ›
                  </button>
                </nav>
              )}
            </div>
          </>
        )}
      </section>

      <aside aria-label="Sweep actions" className="space-y-4 surface">
        <div>
          <h2 className="text-lg font-extrabold">Sweep actions</h2>
          <p className="text-sm text-ink-soft">Record what you find. A car is released only at the exit, against its pass.</p>
        </div>

        <section aria-label="End-of-service sweep" className="space-y-2 rounded-xl border border-edge/15 p-3">
          <h3 className="font-bold">End-of-service sweep</h3>
          <p className="text-sm text-ink-soft">
            About 30 minutes after a service ends, review the cars still recorded as parked. Mark each one still here, or gone.
          </p>
          {services.length === 0 ? (
            <p className="text-sm font-medium">There is no service today.</p>
          ) : (
            <>
              <label className="block text-sm font-medium">
                Service
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-edge/30 bg-white px-2 font-semibold">
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              {picked && !picked.ended && <p className="text-sm text-ink-soft">This service ends at {picked.endsAt}. The sweep is for after it ends, but you can review the cars now.</p>}
              <button
                type="button"
                onClick={() => router.push(`/staff/sweep?sweep=${pick}`)}
                className="min-h-11 w-full rounded-full bg-accent px-4 font-semibold text-white hover:bg-accent-dark"
              >
                Review cars from this service
              </button>
            </>
          )}
          {sweepService && (
            <p className="text-sm">
              Reviewing {sweepService.name}.{" "}
              <Link href="/staff/sweep" className="font-semibold text-accent underline">
                Back to all cars on site
              </Link>
            </p>
          )}
        </section>

        <section aria-label="Reconcile selected" className="space-y-2 rounded-xl border border-edge/15 p-3">
          <h3 className="font-bold">Mark selected as still here</h3>
          <p className="text-sm text-ink-soft">Keeps each selected visit open. Cars that have gone are marked Gone one at a time, so none is closed by mistake.</p>
          <p className="text-sm font-semibold" data-testid="selected-count">
            {chosen.length} {chosen.length === 1 ? "vehicle" : "vehicles"} selected
          </p>
          {confirm?.kind === "many" ? (
            <div role="alertdialog" aria-label="Please confirm" className="space-y-2 rounded-xl border-2 border-edge bg-white p-3">
              <p className="text-sm font-semibold">
                Mark these {chosen.length} {chosen.length === 1 ? "car" : "cars"} as Still here? Their visits stay open.
              </p>
              <ul className="max-h-40 overflow-y-auto rounded-lg bg-page p-2 text-sm font-semibold">
                {chosen.map((r) => (
                  <li key={r.id} className="whitespace-nowrap">
                    {formatPlate(r.plate)} <span className="font-normal text-ink-soft">· {r.areaName}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={confirmMany} disabled={pending} className="min-h-11 rounded-full bg-accent px-4 font-semibold text-white hover:bg-accent-dark">
                  Yes, mark them
                </button>
                <button type="button" onClick={() => setConfirm(null)} className="min-h-11 rounded-full border-2 border-edge/70 bg-white px-4 font-semibold hover:bg-page">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirm({ kind: "many" })}
                disabled={chosen.length === 0 || pending}
                className="min-h-11 flex-1 rounded-full bg-accent px-4 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-panel disabled:text-ink-soft"
              >
                Mark selected as still here
              </button>
              {chosen.length > 0 && (
                <button type="button" onClick={() => setSelected(new Set())} className="min-h-11 rounded-full border-2 border-edge/70 bg-white px-4 font-semibold hover:bg-page">
                  Clear
                </button>
              )}
            </div>
          )}
        </section>

        <section aria-label="Notes" className="space-y-2">
          <h3 className="font-bold">Notes</h3>
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">Cannot find a vehicle?</span> Check Live Parking to see whether it was already checked out, or look it up by plate, phone or reference.
          </p>
          <div className="grid gap-2">
            <Link href="/staff/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-edge/70 bg-white px-4 font-semibold hover:bg-page">
              Go to Live Parking
            </Link>
            <Link href="/staff/search" className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-edge/70 bg-white px-4 font-semibold hover:bg-page">
              Look a car up
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
