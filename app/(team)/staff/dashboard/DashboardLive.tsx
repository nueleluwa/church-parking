"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { Plate } from "@/components/Plate";
import type { DashboardData } from "@/lib/dashboard-data";
import { resolveAlertAction } from "../ops-actions";

const POLL_SECONDS = 3;

function Big({ label, value, id }: { label: string; value: number; id: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center shadow-sm">
      <p data-testid={id} className="text-3xl font-extrabold">{value}</p>
      <p className="text-sm font-medium text-ink-soft">{label}</p>
    </div>
  );
}

/** The same numbers, ignoring the timestamp, so an unchanged board is never redrawn. */
const fingerprint = (d: DashboardData) => JSON.stringify({ ...d, updatedAt: "" });

/**
 * The live board. It asks for fresh numbers every few seconds, so a check-in shows
 * up within 5 seconds. It only redraws when a number actually changed, and it
 * never reloads the page, so the chosen service and the scroll position stay put.
 */
export function DashboardLive({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const [offline, setOffline] = useState(false);
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

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        <span
          aria-hidden="true"
          className={`inline-block h-2.5 w-2.5 rounded-full ${offline ? "bg-danger" : "bg-night"}`}
        />
        <span data-testid="updated">{offline ? "No connection. Showing the last numbers." : `Live. Updated ${updated}`}</span>
      </p>

      {data.noServiceToday || !data.summary ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">
          There is no service today, so there is nothing to count yet.
        </p>
      ) : (
        <>
          <div role="group" aria-label="Choose a service" className="flex gap-2 overflow-x-auto pb-1">
            {data.services.map((s) => {
              const selected = s.id === data.serviceId;
              return (
                <button
                  key={s.id}
                  aria-pressed={selected}
                  onClick={() => pick(s.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-2xl border-2 px-4 py-2 text-left font-semibold ${
                    selected ? "border-edge bg-blush" : "border-transparent bg-card"
                  }`}
                >
                  {selected && <IconCheck className="h-5 w-5" />}
                  <span>
                    {s.name}
                    <span className="block text-xs font-medium text-ink-soft">{s.time}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Big id="total-checked-in" label="Cars checked in" value={data.summary.totals.checkedIn} />
            <Big id="total-left" label="Cars left" value={data.summary.totals.released} />
            <Big id="total-parked" label="Still parked" value={data.summary.totals.parked} />
          </div>
          {data.summary.totals.carriedOver > 0 && (
            <p className="rounded-2xl bg-panel px-4 py-3 font-medium">
              {data.summary.totals.carriedOver} {data.summary.totals.carriedOver === 1 ? "car is" : "cars are"} still
              here from an earlier service.
            </p>
          )}

          <ul className="grid gap-3 lg:grid-cols-3">
            {data.summary.areas.map((a) => (
              <li key={a.areaId} className="rounded-card bg-card p-4 shadow-sm">
                <h2 className="text-lg font-bold">{a.areaName}</h2>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dd className="text-2xl font-extrabold">{a.checkedIn}</dd>
                    <dt className="text-xs font-medium text-ink-soft">Checked in</dt>
                  </div>
                  <div>
                    <dd className="text-2xl font-extrabold">{a.released}</dd>
                    <dt className="text-xs font-medium text-ink-soft">Left</dt>
                  </div>
                  <div>
                    <dd className="text-2xl font-extrabold">{a.parked + a.carriedOver}</dd>
                    <dt className="text-xs font-medium text-ink-soft">Still parked</dt>
                  </div>
                </dl>
                {a.carriedOver > 0 && (
                  <p className="mt-2 text-center text-sm text-ink-soft">
                    Includes {a.carriedOver} from an earlier service
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p>
        <Link href="/admin/visits?status=parked" className="font-semibold text-accent underline">
          See every parked car
        </Link>
      </p>

      <section aria-label="Alerts">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
          <IconAlert className="h-6 w-6 text-danger" />
          Alerts {data.alerts.length > 0 && <span className="rounded-full bg-danger px-2 text-base text-white">{data.alerts.length}</span>}
        </h2>
        {data.alerts.length === 0 ? (
          <p className="rounded-card bg-card p-4 font-medium shadow-sm">No alerts. All clear.</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.alerts.map((al) => (
              <li key={al.id} className="rounded-card border-4 border-danger bg-card p-4">
                <p className="font-bold">{al.title}</p>
                {al.plate && <Plate plate={al.plate} size="md" align="start" className="mt-1" />}
                <p className="mt-1 truncate whitespace-nowrap text-sm text-ink-soft">
                  {al.when}
                  {al.where && ` · ${al.where}`}
                </p>
                <p className="mt-1 text-sm">{al.hint}</p>
                <button
                  onClick={() => resolve(al.id)}
                  className="mt-3 w-full rounded-full border-2 border-edge bg-white px-4 py-2 font-semibold"
                >
                  Mark as dealt with
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
