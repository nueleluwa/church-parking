import type { ReportVisit } from "./reports";

/** Width of one bar in the check-ins chart. */
export const BUCKET_MINUTES = 30;

export type Bucket = { start: number; label: string; count: number };
export type AreaShare = { areaId: number; areaName: string; count: number; percent: number };
export type AreaTiming = { areaId: number; areaName: string; count: number; first: string; half: string };

export type Analytics = {
  checkedIn: number;
  released: number;
  missed: number;
  stillParked: number;
  /** Check-ins by time of day (Lagos time), every half hour from the first to the last arrival. */
  byTime: Bucket[];
  /** The three busiest half-hours, busiest first. */
  peaks: Bucket[];
  areaUsage: AreaShare[];
  /** Per car park: when its first car arrived and when half of its cars had arrived. Earlier half = fills first. */
  areaTiming: AreaTiming[];
};

/** Minutes since midnight in Lagos. Lagos is UTC+1 all year, with no clock changes. */
export function lagosMinutes(iso: string): number {
  const d = new Date(iso);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 60) % 1440;
}

export const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const bucketLabel = (start: number) => `${clock(start)} – ${clock(start + BUCKET_MINUTES)}`;

/** The numbers behind the Analytics screen, worked out from the visit records themselves. */
export function buildAnalytics(visits: ReportVisit[]): Analytics {
  const checkedIn = visits.length;
  const released = visits.filter((v) => v.status === "released").length;
  const missed = visits.filter((v) => v.status === "missed").length;
  const stillParked = checkedIn - released - missed;

  const times = visits.map((v) => lagosMinutes(v.checkedInAt));
  const byTime: Bucket[] = [];
  if (times.length > 0) {
    const first = Math.floor(Math.min(...times) / BUCKET_MINUTES) * BUCKET_MINUTES;
    const last = Math.floor(Math.max(...times) / BUCKET_MINUTES) * BUCKET_MINUTES;
    for (let start = first; start <= last; start += BUCKET_MINUTES) {
      byTime.push({ start, label: bucketLabel(start), count: 0 });
    }
    for (const t of times) byTime[Math.floor((t - first) / BUCKET_MINUTES)].count += 1;
  }
  const peaks = byTime
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || a.start - b.start)
    .slice(0, 3);

  const byArea = new Map<number, { name: string; minutes: number[] }>();
  for (const v of visits) {
    const entry = byArea.get(v.areaId) ?? { name: v.areaName, minutes: [] };
    entry.minutes.push(lagosMinutes(v.checkedInAt));
    byArea.set(v.areaId, entry);
  }
  const areaUsage = [...byArea.entries()]
    .map(([areaId, a]) => ({
      areaId,
      areaName: a.name,
      count: a.minutes.length,
      percent: checkedIn === 0 ? 0 : Math.round((a.minutes.length / checkedIn) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.areaId - b.areaId);
  const areaTiming = [...byArea.entries()]
    .map(([areaId, a]) => {
      const sorted = [...a.minutes].sort((x, y) => x - y);
      return {
        areaId,
        areaName: a.name,
        count: sorted.length,
        first: clock(sorted[0]),
        half: clock(sorted[Math.ceil(sorted.length / 2) - 1]),
      };
    })
    .sort((a, b) => a.half.localeCompare(b.half) || a.areaId - b.areaId);

  return { checkedIn, released, missed, stillParked, byTime, peaks, areaUsage, areaTiming };
}

/** Change against the period before, as a whole percentage, or null when there is nothing to compare with. */
export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** The period of the same length that ended the day before `from`. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  const length = Math.round((t - f) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(f - length * day), to: iso(f - day) };
}
