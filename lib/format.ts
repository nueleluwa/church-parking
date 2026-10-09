const ZONE = "Africa/Lagos";

/** "09:12" in Lagos time. Times are stored in UTC and always shown in Lagos time. */
export function formatLagosTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
}

/** "Sun 12 Oct 2026" in Lagos time. */
export function formatLagosDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .replace(",", "");
}

/** "2h 14m", "45m" or "Less than a minute". */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return "Less than a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "Today, 09:12", "Yesterday, 09:12" or "Sun 5 Oct, 10:04". `now` is a parameter so it can be tested. */
export function formatVisitTime(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(d);
  const when = new Date(iso);
  const dayDiff = Math.round((Date.parse(day(now)) - Date.parse(day(when))) / 86_400_000);
  const time = formatLagosTime(iso);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  const short = when
    .toLocaleDateString("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
  return `${short}, ${time}`;
}
