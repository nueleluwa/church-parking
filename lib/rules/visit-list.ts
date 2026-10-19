import { completedStay, rangeDays } from "./analytics-report";
import { csvCell } from "./reports";
import { normalisePlate } from "./plates";

/**
 * The Visits screen's records and how they are described, in one place so the table and the export agree.
 *
 * A row is one VISIT (a car's stay: check-in and, if it happened, release), not one entry or exit event. Its status is one of:
 * - checked in: the visit is open (the car has been checked in and not released or closed);
 * - released: the car was released at the exit (a recorded release time);
 * - missed: the visit was closed without a release (the car was never released at the exit).
 * Duration is shown only for a released visit with a reliable check-in and release time. An open visit has no duration yet.
 */

export type VisitStatus = "parked" | "released" | "missed";

export type VisitListRow = {
  id: string;
  plate: string;
  make: string | null;
  colour: string | null;
  member: boolean;
  serviceId: number;
  serviceName: string;
  areaId: number;
  areaName: string;
  areaSlug: string;
  status: VisitStatus;
  checkedInAt: string;
  releasedAt: string | null;
  releaseMethod: "scan" | "search" | "sweep" | "midnight" | "self" | "staff_close" | null;
  releasedBy: string | null;
  reference: string;
  held: boolean;
};

export const VISIT_STATUSES: { value: VisitStatus; label: string; hint: string }[] = [
  { value: "parked", label: "Checked in", hint: "Open visits: checked in and not yet released" },
  { value: "released", label: "Released", hint: "Released at the exit" },
  { value: "missed", label: "Missed", hint: "Closed without a release" },
];

export const statusLabel = (s: VisitStatus) => VISIT_STATUSES.find((x) => x.value === s)!.label;

/** "checked in", "released" or "missed" from the address, or null for anything else. */
export function parseVisitStatus(value: string | null | undefined): VisitStatus | null {
  return VISIT_STATUSES.find((s) => s.value === value)?.value ?? null;
}

/** The plate typed in the search box, normalised the same way plates are stored, or "" when there is nothing usable. */
export function searchPlate(value: string | null | undefined): string {
  return normalisePlate((value ?? "").slice(0, 20));
}

/** A LIKE pattern for a plate search: any text around it, and look-alike characters (0 and O, 1 and I) match each other. */
export function plateLikePattern(plate: string): string {
  return `%${plate.replace(/[0O1I]/g, "_")}%`;
}

export const VISITS_PAGE_SIZE = 20;
export const MAX_VISIT_RANGE_DAYS = 366;

/** A date range from the address (or the older single `date`), or why it cannot be used. */
export function visitRange(
  from: string | undefined,
  to: string | undefined,
  date: string | undefined,
  today: string,
): { from: string; to: string; error: string | null } {
  const real = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  if (!from && !to && real(date)) return { from: date, to: date, error: null };
  if (!from && !to) return { from: today, to: today, error: null };
  const start = real(from) ? from : real(to) ? to : undefined;
  const end = real(to) ? to : real(from) ? from : undefined;
  if (!start || !end) return { from: today, to: today, error: "Those dates are not valid. Showing today instead." };
  if (start > end) return { from: today, to: today, error: "The start date must not be after the end date. Showing today instead." };
  if (rangeDays(start, end) > MAX_VISIT_RANGE_DAYS) {
    return { from: today, to: today, error: `Choose a period of up to ${MAX_VISIT_RANGE_DAYS} days. Showing today instead.` };
  }
  return { from: start, to: end, error: null };
}

/** Page numbers to show: the first, the last, and the ones around the current page, with gaps marked. */
export function pageNumbers(page: number, pages: number): (number | "gap")[] {
  if (pages <= 1) return [1];
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const numbers = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  numbers.forEach((n, i) => {
    if (i > 0 && n - numbers[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

// ---------- Describing a visit ----------

const ZONE = "Africa/Lagos";
const date = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "7 Oct 2026" and "12:14", in Lagos time. */
export function lagosParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: date.format(d), time: time.format(d) };
}

/** Minutes between check-in and release for a released visit, or null (open, missed, or an unreliable time). */
export function visitDuration(v: Pick<VisitListRow, "status" | "checkedInAt" | "releasedAt">): number | null {
  return completedStay(v);
}

/** "3m", "1h 4m" or "Under 1m". */
export function durationText(minutes: number): string {
  if (minutes < 1) return "Under 1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const METHODS: Record<string, string> = {
  scan: "Pass scanned",
  search: "Looked up, no pass scanned",
  sweep: "Closed in the sweep",
  midnight: "Closed at midnight",
  self: "Member checked out (exit sign)",
  staff_close: "Closed by staff",
};

const lagosStamp = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "");

const HEADERS = [
  "Service date",
  "Plate",
  "Type",
  "Service",
  "Parking area",
  "Entry (Lagos)",
  "Exit (Lagos)",
  "Duration (minutes)",
  "Status",
  "How it ended",
  "Released by",
  "Reference",
];

/** The visits as a CSV: the same status, entry, exit and duration as the table. No names or phone numbers. */
export function visitListToCsv(rows: VisitListRow[]): string {
  const lines = rows.map((v) =>
    [
      lagosStamp(v.checkedInAt).slice(0, 10),
      v.plate,
      v.member ? "Member" : "Guest",
      v.serviceName,
      v.areaName,
      lagosStamp(v.checkedInAt),
      lagosStamp(v.releasedAt),
      visitDuration(v) ?? "",
      statusLabel(v.status),
      v.status === "parked" ? "" : v.releaseMethod ? METHODS[v.releaseMethod] : "",
      v.releasedBy ?? "",
      v.reference,
    ]
      .map(csvCell)
      .join(","),
  );
  return `﻿${[HEADERS.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
