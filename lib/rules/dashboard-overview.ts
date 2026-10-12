/**
 * The main Dashboard's date filter. Dates are Lagos dates (Africa/Lagos), written YYYY-MM-DD.
 *
 * Every figure that counts activity (cars checked in, cars left, per-area counts, recent activity) covers the VISITS whose
 * service date falls in the chosen period, the same definition the Visits screen uses, so a card and the list it opens agree.
 * "Currently parked" and "Active alerts" are LIVE: they describe right now and do not change with the date.
 */

export type DashboardRange = "today" | "yesterday" | "7d" | "30d" | "date";

export const DASHBOARD_RANGES: { value: DashboardRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "date", label: "Choose a date" },
];

export type DashboardPeriod = {
  range: DashboardRange;
  from: string;
  to: string;
  /** The chosen day when `range` is "date", otherwise "" (for the date box). */
  date: string;
  /** True when the period ends today, so the live numbers and the period describe the same day. */
  includesToday: boolean;
  /** "Today", "Yesterday", "Last 7 days", "Last 30 days" or the date. */
  label: string;
  /** The same period in a sentence: "today", "yesterday", "in the last 7 days", "on 5 Oct 2026". */
  words: string;
  /** The dates themselves: "Mon, 12 Oct 2026" or "6 Oct to 12 Oct 2026". */
  dates: string;
};

const real = (d: string | undefined): d is string => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};

export const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const short = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const long = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const at = (d: string) => new Date(`${d}T12:00:00Z`);

/** "Mon, 12 Oct 2026" */
export const dayText = (d: string): string => day.format(at(d)).replace(",", ",");

/**
 * Read the period from the address. Anything unknown or in the future falls back to today, so a hand-typed address can never show
 * a day that has not happened.
 */
export function parseDashboardPeriod(sp: { range?: string; date?: string }, today: string): DashboardPeriod {
  const range: DashboardRange = DASHBOARD_RANGES.some((r) => r.value === sp.range) ? (sp.range as DashboardRange) : "today";
  let from = today;
  let to = today;
  let date = "";
  if (range === "yesterday") {
    from = to = addDays(today, -1);
  } else if (range === "7d") {
    from = addDays(today, -6);
  } else if (range === "30d") {
    from = addDays(today, -29);
  } else if (range === "date") {
    // A missing, impossible or future date becomes today, but the date box stays open so another day can be chosen
    date = real(sp.date) && sp.date <= today ? sp.date : today;
    from = to = date;
  }
  const single = from === to;
  const label = range === "date" ? long.format(at(from)) : DASHBOARD_RANGES.find((r) => r.value === range)!.label;
  const words =
    range === "today"
      ? "today"
      : range === "yesterday"
        ? "yesterday"
        : range === "date"
          ? `on ${long.format(at(from))}`
          : `in the ${label.toLowerCase()}`;
  const dates = single ? dayText(from) : `${short.format(at(from))} to ${long.format(at(to))}`;
  return { range, from, to, date, includesToday: to === today, label, words, dates };
}

/** The first moment of a Lagos day, as an ISO time (Lagos is UTC+1 all year). */
export const lagosDayStart = (d: string): string => `${d}T00:00:00+01:00`;
