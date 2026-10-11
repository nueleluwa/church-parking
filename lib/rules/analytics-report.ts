import { percentChange, clock, lagosMinutes } from "./analytics";
import type { ReportVisit } from "./reports";

/**
 * The numbers behind the Analytics screen. Every one is worked out from the visit records themselves
 * (check-in time, release time, status, service, car park, plate). Nothing is estimated, and nothing
 * is taken from today's live counts. Definitions:
 *
 * - Cars checked in: the number of visits in the period (a car that came twice counts twice).
 * - Cars left: visits released at the exit (a recorded check-out time). A car that left without being
 *   released is not counted, because the system never saw it go.
 * - Average parking duration: check-in to release, over released visits only. A visit whose release time
 *   is missing, before its check-in, or more than a day after it is left out as unreliable.
 * - Unique vehicles: different plates in the period.
 */

const DAY = 24 * 60;

/** Minutes between check-in and release for a completed visit, or null when it is not a reliable stay. */
export function completedStay(v: Pick<ReportVisit, "status" | "checkedInAt" | "releasedAt">): number | null {
  if (v.status !== "released" || !v.releasedAt) return null;
  const minutes = (Date.parse(v.releasedAt) - Date.parse(v.checkedInAt)) / 60_000;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > DAY) return null;
  return Math.round(minutes);
}

export type Kpis = {
  checkedIn: number;
  left: number;
  /** Average of the reliable stays, in minutes, or null when there are none. */
  averageStay: number | null;
  /** How many stays the average is made from. */
  stays: number;
  uniqueVehicles: number;
};

export function buildKpis(visits: ReportVisit[]): Kpis {
  const stays = visits.map(completedStay).filter((m): m is number => m !== null);
  return {
    checkedIn: visits.length,
    left: visits.filter((v) => v.status === "released" && v.releasedAt).length,
    averageStay: stays.length ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length) : null,
    stays: stays.length,
    uniqueVehicles: new Set(visits.map((v) => v.plate)).size,
  };
}

/** Change against the period before, or null when either side cannot be worked out (no baseline, no completed visits). */
export function change(now: number | null, before: number | null): number | null {
  if (now === null || before === null) return null;
  return percentChange(now, before);
}

// ---------- Time ----------

const lagosDateOf = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** Days in a range, counting both ends. */
export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

// ---------- Vehicle activity ----------

export type ActivityBucket = {
  key: string;
  label: string;
  checkedIn: number;
  left: number;
  /** Cars with no recorded check-out: by the end of this hour (one day), or over the whole day or week (longer ranges). */
  notOut: number;
};
export type Activity = { grain: "hour" | "day" | "week"; buckets: ActivityBucket[] };

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Check-ins and check-outs over time. One day: by the hour, from the first to the last hour with activity, and
 * "notOut" is the number of cars checked in and not yet checked out at the end of that hour. Up to 45 days: one bar
 * a day. Longer: one bar a week (weeks start on Monday).
 */
export function activitySeries(visits: ReportVisit[], range: { from: string; to: string }): Activity {
  const days = rangeDays(range.from, range.to);

  if (days === 1) {
    const inHour = new Map<number, number>();
    const outHour = new Map<number, number>();
    for (const v of visits) {
      const h = Math.floor(lagosMinutes(v.checkedInAt) / 60);
      inHour.set(h, (inHour.get(h) ?? 0) + 1);
      if (v.status === "released" && v.releasedAt) {
        const o = Math.floor(lagosMinutes(v.releasedAt) / 60);
        outHour.set(o, (outHour.get(o) ?? 0) + 1);
      }
    }
    const hours = [...inHour.keys(), ...outHour.keys()];
    if (hours.length === 0) return { grain: "hour", buckets: [] };
    const first = Math.min(...hours);
    const last = Math.max(...hours);
    const buckets: ActivityBucket[] = [];
    let running = 0;
    for (let h = first; h <= last; h++) {
      const i = inHour.get(h) ?? 0;
      const o = outHour.get(h) ?? 0;
      running += i - o;
      buckets.push({ key: hourLabel(h), label: hourLabel(h), checkedIn: i, left: o, notOut: running });
    }
    return { grain: "hour", buckets };
  }

  const weekStart = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  const grain = days <= 45 ? "day" : "week";
  const keyOf = (date: string) => (grain === "day" ? date : weekStart(date));
  const buckets = new Map<string, ActivityBucket>();
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const key = keyOf(d);
    if (!buckets.has(key)) buckets.set(key, { key, label: grain === "day" ? shortDate(key) : `Week of ${shortDate(key)}`, checkedIn: 0, left: 0, notOut: 0 });
  }
  for (const v of visits) {
    const b = buckets.get(keyOf(v.serviceDate));
    if (!b) continue;
    b.checkedIn += 1;
    if (v.status === "released" && v.releasedAt) {
      const out = buckets.get(keyOf(lagosDateOf(v.releasedAt)));
      if (out) out.left += 1;
    } else {
      b.notOut += 1;
    }
  }
  return { grain, buckets: [...buckets.values()] };
}

// ---------- Rankings ----------

export type Ranked = { id: number; name: string; count: number };

/** Check-ins per car park or per service, most first (ties by name). Names given in `include` appear even with no check-ins. */
export function rankBy(visits: ReportVisit[], by: "area" | "service", include: { id: number; name: string }[] = []): Ranked[] {
  const counts = new Map<number, Ranked>(include.map((x) => [x.id, { id: x.id, name: x.name, count: 0 }]));
  for (const v of visits) {
    const id = by === "area" ? v.areaId : v.serviceId;
    const name = by === "area" ? v.areaName : v.serviceName;
    const row = counts.get(id) ?? { id, name, count: 0 };
    row.count += 1;
    counts.set(id, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------- Average parking duration ----------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Average stay for each day of the week (Monday first), from the day the car was checked in. A day with no completed visits has no average. */
export function durationByWeekday(visits: ReportVisit[]): { label: string; average: number | null; count: number }[] {
  const sums = WEEKDAYS.map(() => ({ total: 0, count: 0 }));
  for (const v of visits) {
    const stay = completedStay(v);
    if (stay === null) continue;
    const index = (new Date(`${v.serviceDate}T00:00:00Z`).getUTCDay() + 6) % 7;
    sums[index].total += stay;
    sums[index].count += 1;
  }
  return WEEKDAYS.map((label, i) => ({ label, average: sums[i].count ? Math.round(sums[i].total / sums[i].count) : null, count: sums[i].count }));
}

// ---------- Peak hours ----------

export type PeakHour = { start: number; label: string; count: number };

/**
 * The busiest hours by number of check-ins (Lagos time). This is arrivals, not cars on site: how many cars were
 * on site at once cannot be told reliably, because a car that left without being released has no departure time.
 */
export function peakHours(visits: ReportVisit[], n = 3): PeakHour[] {
  const hours = new Map<number, number>();
  for (const v of visits) {
    const h = Math.floor(lagosMinutes(v.checkedInAt) / 60);
    hours.set(h, (hours.get(h) ?? 0) + 1);
  }
  return [...hours.entries()]
    .map(([h, count]) => ({ start: h * 60, label: `${clock(h * 60)} – ${clock((h + 1) * 60)}`, count }))
    .sort((a, b) => b.count - a.count || a.start - b.start)
    .slice(0, n);
}

/** A stay for a number card: "2h 14m", "45m", or "Under 1m" for a very short one. */
export function formatStay(minutes: number): string {
  if (minutes < 1) return "Under 1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "1 Oct 2026 – 7 Oct 2026", or one date for a single day. */
export function describeRange(from: string, to: string): string {
  const full = (d: string) => `${shortDate(d)} ${d.slice(0, 4)}`;
  return from === to ? full(from) : `${full(from)} – ${full(to)}`;
}

/** "vs previous week" and so on, for the comparison under each number. */
export function previousLabel(days: number): string {
  if (days === 1) return "vs the day before";
  if (days === 7) return "vs previous week";
  return `vs previous ${days} days`;
}
