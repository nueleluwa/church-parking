export const TIME_ZONE = "Africa/Lagos";

/** How early a driver can check in for the next service (decision D-07). */
const LEAD_MINUTES = 30;

export type ServiceWindow = {
  id: number;
  weekday: number; // 0 = Sunday
  starts_at: string; // "HH:MM" or "HH:MM:SS", Lagos local time
  ends_at: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lagosParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAYS.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** Today's date in Africa/Lagos, as "YYYY-MM-DD". */
export function lagosDate(now: Date): string {
  return lagosParts(now).date;
}

/**
 * R-1: pick the next service that starts within 30 minutes. Otherwise the
 * service in progress. Otherwise the next service that day. Returns null
 * when there is no service left today.
 */
export function pickService<T extends ServiceWindow>(now: Date, services: T[]): T | null {
  const { weekday, minutes } = lagosParts(now);
  const today = services
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at));

  const startingSoon = today.find((s) => {
    const start = toMinutes(s.starts_at);
    return start >= minutes && start - minutes <= LEAD_MINUTES;
  });
  if (startingSoon) return startingSoon;

  const inProgress = today.find(
    (s) => toMinutes(s.starts_at) <= minutes && minutes < toMinutes(s.ends_at),
  );
  if (inProgress) return inProgress;

  return today.find((s) => toMinutes(s.starts_at) > minutes) ?? null;
}

/**
 * The services a driver can check in for right now: today's services that
 * have not finished yet. Empty after the last service ends, or on a day with
 * no service.
 */
export function servicesForCheckIn<T extends ServiceWindow>(now: Date, services: T[]): T[] {
  const { weekday, minutes } = lagosParts(now);
  return services
    .filter((s) => s.weekday === weekday && toMinutes(s.ends_at) > minutes)
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at));
}

/** True if the service runs on today's weekday in Lagos, finished or not. */
export function hasServiceToday<T extends ServiceWindow>(now: Date, services: T[]): boolean {
  const { weekday } = lagosParts(now);
  return services.some((s) => s.weekday === weekday);
}
