"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPin } from "@/components/icons";
import { field } from "@/components/ui";
import { STATION_COOKIE, STATION_MAX_AGE_SECONDS, type CarParkOption } from "@/lib/rules/station";

/**
 * "Which car park are you at?" Each car park has its own exit, so the attendant says once where they stand and
 * the phone remembers it for the shift. The scan screen then warns about a car that checked in at a different car
 * park. It never stops a release: a driver who scanned the wrong sign is an honest mistake.
 */
export function StationPicker({
  areas,
  station,
  variant = "bar",
}: {
  areas: CarParkOption[];
  station: string | null;
  variant?: "card" | "bar";
}) {
  const router = useRouter();
  const [value, setValue] = useState(station ?? "");
  if (areas.length === 0) return null;

  // Saved by the browser at once, so choosing and then tapping straight on to the scanner never loses it
  function change(slug: string) {
    setValue(slug);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = slug
      ? `${STATION_COOKIE}=${encodeURIComponent(slug)}; Path=/; Max-Age=${STATION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
      : `${STATION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    router.refresh();
  }

  const select = (
    <select
      value={value}
      onChange={(e) => change(e.target.value)}
      className={`${field} ${variant === "bar" ? "mt-0" : ""}`}
    >
      <option value="">Not chosen</option>
      {areas.map((a) => (
        <option key={a.slug} value={a.slug}>
          {a.name}
        </option>
      ))}
    </select>
  );

  if (variant === "bar") {
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-3 rounded-2xl bg-card px-4 py-2 shadow-sm">
          <IconPin className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <span className="shrink-0 text-sm font-semibold">You are at</span>
          <span className="min-w-0 flex-1">{select}</span>
        </label>
      </div>
    );
  }

  return (
    <section aria-label="Your car park" className="rounded-card bg-card p-4 shadow-sm">
      <label className="block">
        <span className="flex items-center gap-2 font-bold">
          <IconPin className="h-5 w-5 text-accent" aria-hidden />
          Which car park are you at?
        </span>
        <span className="mt-0.5 block text-sm text-ink-soft">
          Each car park has its own exit. We will warn you if a car checked in somewhere else.
        </span>
        {select}
      </label>
    </section>
  );
}
