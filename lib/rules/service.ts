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

/** Today's services (finished or not), in order. Used by the dashboard and the sweep. */
export function servicesToday<T extends ServiceWindow>(now: Date, services: T[]): T[] {
  const { weekday } = lagosParts(now);
  return services
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at));
}

/**
 * The service the coordinator most likely wants: the one running now (or
 * starting soon), otherwise the one that finished most recently, otherwise
 * the first of the day.
 */
export function defaultDashboardService<T extends ServiceWindow>(now: Date, services: T[]): T | null {
  const today = servicesToday(now, services);
  if (today.length === 0) return null;
  const { minutes } = lagosParts(now);
  const current = pickService(now, today);
  if (current) return current;
  const finished = today.filter((s) => toMinutes(s.ends_at) <= minutes);
  return finished.length ? finished[finished.length - 1] : today[0];
}

export type ServiceStanding = "active" | "next" | "finished";

/**
 * How each of today's services stands right now: active (running now), next (the first one still
 * to come), finished, or later (not the first still to come). Used for the attendant's service
 * card and the Service Information screen.
 */
export function serviceStandings<T extends ServiceWindow>(
  now: Date,
  services: T[],
): { service: T; standing: ServiceStanding | "later" }[] {
  const { minutes } = lagosParts(now);
  let nextFound = false;
  return servicesToday(now, services).map((service) => {
    if (toMinutes(service.starts_at) <= minutes && minutes < toMinutes(service.ends_at)) {
      return { service, standing: "active" as const };
    }
    if (toMinutes(service.ends_at) <= minutes) return { service, standing: "finished" as const };
    if (!nextFound) {
      nextFound = true;
      return { service, standing: "next" as const };
    }
    return { service, standing: "later" as const };
  });
}

export type ServiceProgress = "off" | "active" | "upcoming" | "completed" | "other-day";

/**
 * Where a service stands right now, for the Services screen: on now, still to come today, finished today,
 * or simply not today (it runs on another weekday). A service that is switched off is just "off".
 */
export function serviceProgress(now: Date, s: { weekday: number; starts_at: string; ends_at: string; active: boolean }): ServiceProgress {
  if (!s.active) return "off";
  const t = lagosParts(now);
  if (s.weekday !== t.weekday) return "other-day";
  if (t.minutes < toMinutes(s.starts_at)) return "upcoming";
  if (t.minutes >= toMinutes(s.ends_at)) return "completed";
  return "active";
}
