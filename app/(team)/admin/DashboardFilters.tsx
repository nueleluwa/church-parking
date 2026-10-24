"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconCalendar, IconGrid } from "@/components/icons";

type Option = { value: string; label: string };

/**
 * The two filters at the top of the dashboard: the period and the service. Choosing one reloads the dashboard with that choice in
 * the address (so it can be bookmarked or shared), and each choice is kept when the other changes.
 */
export function DashboardFilters({
  range,
  date,
  today,
  serviceId,
  ranges,
  services,
  dates,
}: {
  range: string;
  date: string;
  today: string;
  serviceId: string;
  ranges: Option[];
  services: Option[];
  dates: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(next: { range?: string; date?: string; service?: string }) {
    const r = next.range ?? range;
    const params = new URLSearchParams();
    if (r !== "today") params.set("range", r);
    const d = next.date ?? (r === "date" ? date : "");
    if (r === "date" && d) params.set("date", d);
    const sv = next.service ?? serviceId;
    if (sv) params.set("service", sv);
    const qs = params.toString();
    start(() => router.push(`/admin${qs ? `?${qs}` : ""}`));
  }

  const box = "flex min-h-14 items-center gap-3 rounded-xl border border-edge/15 bg-card px-4";
  const select = "min-w-0 flex-1 appearance-none bg-transparent py-2 pr-6 font-semibold focus:outline-none";
  return (
    <div role="group" aria-label="Dashboard filters" aria-busy={pending} className="grid w-full min-w-0 gap-3 min-[380px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap">
      <div className="min-w-0 sm:flex-none">
        <label className={`${box} focus-within:ring-4 focus-within:ring-blush`}>
          <IconCalendar aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
          <span className="min-w-0 flex-1">
            <span className="sr-only">Period</span>
            <select value={range} onChange={(e) => go({ range: e.target.value })} className={`${select} w-full`}>
              {ranges.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="-mt-1 block text-sm text-ink-soft">{dates}</span>
          </span>
        </label>
        {range === "date" && (
          <label className="mt-2 block text-sm font-medium">
            Date
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && go({ range: "date", date: e.target.value })}
              className="mt-1 block min-h-12 w-full rounded-xl border border-edge/25 bg-white px-3"
            />
          </label>
        )}
      </div>
      <label className={`${box} min-w-0 focus-within:ring-4 focus-within:ring-blush sm:flex-none`}>
        <IconGrid aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
        <span className="sr-only">Service</span>
        <select value={serviceId} onChange={(e) => go({ service: e.target.value })} className={`${select} w-full sm:min-w-52`}>
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
