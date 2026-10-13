"use client";

import { EmptyState } from "@/components/ds/EmptyState";
import { MetricCard, MetricRow } from "@/components/ds/MetricCard";
import { PageHeader } from "@/components/ds/PageHeader";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert, IconCar, IconChevronRight, IconClock, IconLogout, IconSearch } from "@/components/icons";
import { Plate } from "@/components/Plate";
import type { DashboardData } from "@/lib/dashboard-data";
import { resolveAlertAction } from "../ops-actions";

const POLL_SECONDS = 3;

/** The same numbers, ignoring the timestamp, so an unchanged board is never redrawn. */
const fingerprint = (d: DashboardData) => JSON.stringify({ ...d, updatedAt: "" });

/**
 * The live board. It asks for fresh numbers every few seconds, so a check-in shows
 * up within 5 seconds. It only redraws when a number actually changed, and it
 * never reloads the page, so the chosen service and the scroll position stay put.
 * Counts only: there is no capacity or "spaces left" figure (D-05).
 */
export function DashboardLive({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(fingerprint(initial));
  const latest = useRef(0); // ignores an old reply that arrives after a newer one

  const load = useCallback(
    async (id: number | null) => {
      const ticket = ++latest.current;
      try {
        const res = await fetch(`/staff/dashboard/data${id ? `?service=${id}` : ""}`, { cache: "no-store" });
        if (ticket !== latest.current) return;
        if (res.status === 401) {
          // The session ended: go to sign-in once, instead of showing a false "No connection"
          router.replace("/staff/signin");
          return;
        }
        if (!res.ok) throw new Error("bad response");
        const next: DashboardData = await res.json();
        if (ticket !== latest.current) return;
        setOffline(false);
        setUpdatedAt(next.updatedAt);
        const print = fingerprint(next);
        if (print !== shown.current) {
          shown.current = print;
          setData(next);
        }
      } catch {
        if (ticket === latest.current) setOffline(true);
      }
    },
    [router],
  );

  // Asks again every few seconds while the screen is showing.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(serviceId);
    }, POLL_SECONDS * 1000);
    return () => clearInterval(id);
  }, [load, serviceId]);

  function pick(id: number) {
    setServiceId(id);
    void load(id);
  }

  async function refresh() {
    setRefreshing(true);
    await load(serviceId);
    setRefreshing(false);
  }

  async function resolve(id: number) {
    setData((d) => {
      const next = { ...d, alerts: d.alerts.filter((a) => a.id !== id) };
      shown.current = fingerprint(next);
      return next;
    });
    await resolveAlertAction(id);
    void load(serviceId);
  }

  const updated = new Date(updatedAt).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const totals = data.summary?.totals;
  // Still parked counts every car that is here now, including any left from an earlier service, so it matches the car park cards
  const stillParked = totals ? totals.parked + totals.carriedOver : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Live Parking"
        actions={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <p className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-edge/15 bg-card px-4 text-sm font-medium sm:w-auto">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${offline ? "bg-ink-soft" : "bg-accent"}`} />
            <span data-testid="updated">{offline ? "No connection. Showing the last numbers." : `Live · Updated ${updated}`}</span>
          </p>
          {data.services.length > 0 && (
            <label className="block w-full min-w-0 rounded-xl border border-edge/15 bg-card px-3 py-1.5 sm:w-auto">
              <span className="block text-xs font-medium text-ink-soft">Service</span>
              <select
                value={data.serviceId ?? ""}
                onChange={(e) => pick(Number(e.target.value))}
                className="w-full max-w-full bg-transparent font-semibold focus:outline-none sm:max-w-[24rem]"
              >
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.time}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="btn btn-primary w-full sm:w-auto"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        }
      >
        Real-time view of vehicle activity across all car parks.
      </PageHeader>

      {data.noServiceToday || !data.summary ? (
        <EmptyState>There is no service today, so there is nothing to count yet.</EmptyState>
      ) : (
        <>
          <MetricRow>
            <MetricCard id="total-checked-in" label="Cars checked in" value={totals!.checkedIn} note="Across all car parks" icon={<IconCar className="h-5 w-5" />} />
            <MetricCard id="total-left" label="Cars left" value={totals!.released} note="Released at the exit" icon={<IconLogout className="h-5 w-5" />} />
            <MetricCard
              id="total-parked"
              label="Still parked"
              value={stillParked}
              note={totals!.carriedOver > 0 ? `Includes ${totals!.carriedOver} from an earlier service` : "Currently on site"}
              icon={<IconClock className="h-5 w-5" />}
            />
            <MetricCard
              id="total-alerts"
              label="Active alerts"
              value={data.alerts.length}
              alert={data.alerts.length > 0}
              note={
                data.alerts.length > 0 ? (
                  <a href="#alerts" className="font-semibold text-accent underline">
                    Need attention
                  </a>
                ) : (
                  "All clear"
                )
              }
              icon={<IconAlert className="h-5 w-5" />}
            />
          </MetricRow>

          <section aria-label="Parking areas" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="t-section">Parking Areas</h2>
              <Link
                href="/admin/visits?status=parked"
                className="btn btn-quiet"
              >
                View all vehicles
              </Link>
            </div>
            <ul className="grid gap-3 sm:gap-4 md:grid-cols-3">
              {data.summary.areas.map((a) => {
                const slug = data.areaSlugs[a.areaId];
                const body = (
                  <>
                    <span className="flex items-center justify-between gap-2">
                      <h3 data-area className="t-card">{a.areaName}</h3>
                      {slug && <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />}
                    </span>
                    <dl className="mt-3 grid grid-cols-3 divide-x divide-edge/15 border-t border-edge/15 pt-3 text-center">
                      <div className="px-1">
                        <dd className="text-2xl font-extrabold">{a.checkedIn}</dd>
                        <dt className="text-xs font-medium text-ink-soft">Checked in</dt>
                      </div>
                      <div className="px-1">
                        <dd className="text-2xl font-extrabold">{a.released}</dd>
                        <dt className="text-xs font-medium text-ink-soft">Left</dt>
                      </div>
                      <div className="px-1">
                        <dd className="text-2xl font-extrabold">{a.parked + a.carriedOver}</dd>
                        <dt className="text-xs font-medium text-ink-soft">Still parked</dt>
                      </div>
                    </dl>
                    {a.carriedOver > 0 && (
                      <span className="mt-2 block text-center text-xs text-ink-soft">Includes {a.carriedOver} from an earlier service</span>
                    )}
                  </>
                );
                return (
                  <li key={a.areaId}>
                    {slug ? (
                      <Link
                        href={`/admin/visits?area=${slug}&status=parked`}
                        aria-label={`${a.areaName}: see the cars parked here`}
                        className="surface block !p-4 transition hover:bg-page sm:!p-5"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="surface !p-4 sm:!p-5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <section id="alerts" aria-label="Alerts" className="space-y-3 scroll-mt-4">
        <h2 className="t-section flex items-center gap-2">
          <IconAlert className="h-6 w-6 text-accent" />
          Alerts ({data.alerts.length})
        </h2>
        {data.alerts.length === 0 ? (
          <EmptyState>No alerts. All clear.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {data.alerts.map((al) => (
              <li key={al.id} className="rounded-2xl border border-edge/10 border-l-4 border-l-danger bg-blush/60 p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="font-bold">{al.title}</p>
                    <p className="text-sm text-ink-soft">
                      {al.when}
                      {al.area && ` · ${al.area}`}
                      {al.service && ` · ${al.service}`}
                    </p>
                    <p className="mt-1 text-sm">{al.hint}</p>
                  </div>
                  {al.plate && (
                    <div className="min-w-44 rounded-xl border border-edge/15 bg-white px-3 py-2">
                      <Plate plate={al.plate} size="md" align="start" variant="plain" />
                      {al.vehicle && <p className="truncate text-sm text-ink-soft">{al.vehicle}</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={al.investigateHref}
                      className="btn btn-danger"
                    >
                      <IconSearch aria-hidden="true" className="h-5 w-5" />
                      Investigate
                    </Link>
                    <button
                      type="button"
                      onClick={() => resolve(al.id)}
                      className="btn btn-quiet !rounded-full"
                    >
                      Mark as dealt with
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
