/**
 * The Sweep screen's rules, in one place.
 *
 * A sweep is a reconciliation, not a checkout. About 30 minutes after a service ends, a team lead walks the car parks and, for each car
 * still recorded as parked, records one of two outcomes:
 * - "Still here": the car is on site. Its visit stays open and is carried forward; it is checked again after the next service.
 * - "Gone": the car has gone but was never released at the exit. The visit is closed as a MISSED check-out. This is not a release.
 * A real release (the car leaving, verified against its pass or by lookup) is only ever done at the exit by an attendant, so the
 * sweep never releases a car and the normal release checks cannot be bypassed from here.
 *
 * "Overstaying" means a car is still recorded as parked 30 minutes or more after the end of the service it was checked in for.
 * "No check-in record" (a car present with no visit) cannot be detected by the system, so it is not counted anywhere.
 */

export const SWEEP_DELAY_MINUTES = 30;

export type OnSiteVisit = {
  id: string;
  plate: string;
  make: string | null;
  colour: string | null;
  member: boolean;
  serviceId: number;
  serviceName: string;
  /** "HH:MM" or "HH:MM:SS", Lagos time. */
  serviceStart: string;
  serviceEnd: string;
  /** The Lagos date the visit belongs to. */
  serviceDate: string;
  areaId: number;
  areaName: string;
  areaSlug: string;
  checkedInAt: string;
  held: boolean;
  /** The services whose sweep already marked this car "Still here". */
  stillHereIn: number[];
};

const hhmm = (t: string) => t.slice(0, 5);

/** The moment a visit's service ends (Lagos is UTC+1 all year). */
export function serviceEndInstant(v: Pick<OnSiteVisit, "serviceDate" | "serviceEnd">): number {
  return Date.parse(`${v.serviceDate}T${hhmm(v.serviceEnd)}:00+01:00`);
}

/** Still recorded as parked 30 or more minutes after its service ended. */
export function isOverstaying(v: Pick<OnSiteVisit, "serviceDate" | "serviceEnd">, nowMs: number): boolean {
  return nowMs >= serviceEndInstant(v) + SWEEP_DELAY_MINUTES * 60_000;
}

export function elapsedMinutes(v: Pick<OnSiteVisit, "checkedInAt">, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(v.checkedInAt)) / 60_000));
}

const toMinutes = (t: string) => {
  const [h, m] = hhmm(t).split(":");
  return Number(h) * 60 + Number(m);
};

/** How long the car's service is scheduled to last, in minutes. */
export function serviceLength(v: Pick<OnSiteVisit, "serviceStart" | "serviceEnd">): number {
  return Math.max(0, toMinutes(v.serviceEnd) - toMinutes(v.serviceStart));
}

/** Parked for longer than its service lasts. */
export function longerThanService(v: OnSiteVisit, nowMs: number): boolean {
  return elapsedMinutes(v, nowMs) > serviceLength(v);
}

/** Marked "Still here" in the sweep of the service the car was checked in for (or in a chosen service's sweep). */
export function markedStillHere(v: OnSiteVisit, sweepServiceId: number = v.serviceId): boolean {
  return v.stillHereIn.includes(sweepServiceId);
}

export type SweepStatus = "on-site" | "overstaying";
export const sweepStatus = (v: OnSiteVisit, nowMs: number): SweepStatus => (isOverstaying(v, nowMs) ? "overstaying" : "on-site");

export type SweepFilter = {
  areaSlug: string;
  serviceId: number | null;
  /** "within": parked no longer than its service lasts. "longer": parked for longer than that. */
  timing: "" | "within" | "longer";
  /** "onsite": not yet overdue. "overstaying": overdue. "stillhere": already marked Still here. */
  status: "" | "onsite" | "overstaying" | "stillhere";
  /** A normalised plate, or "". */
  plate: string;
};

export function filterOnSite(rows: OnSiteVisit[], f: SweepFilter, nowMs: number): OnSiteVisit[] {
  // Look-alike characters match each other (0 and O, 1 and I), as in every other plate search
  const like = f.plate ? new RegExp(f.plate.replace(/[0O]/g, "[0O]").replace(/[1I]/g, "[1I]")) : null;
  return rows.filter(
    (v) =>
      (!f.areaSlug || v.areaSlug === f.areaSlug) &&
      (f.serviceId === null || v.serviceId === f.serviceId) &&
      (f.timing === "" || (f.timing === "longer") === longerThanService(v, nowMs)) &&
      (f.status === "" ||
        (f.status === "stillhere" && markedStillHere(v)) ||
        (f.status === "overstaying" && isOverstaying(v, nowMs)) ||
        (f.status === "onsite" && !isOverstaying(v, nowMs))) &&
      (!like || like.test(v.plate)),
  );
}

export type SweepSort = "oldest" | "newest" | "area";
export const SWEEP_SORTS: { value: SweepSort; label: string }[] = [
  { value: "oldest", label: "Entry time (oldest first)" },
  { value: "newest", label: "Entry time (newest first)" },
  { value: "area", label: "Parking area" },
];

/** Sorted by the real timestamps (never by the text shown on screen). */
export function sortOnSite(rows: OnSiteVisit[], sort: SweepSort): OnSiteVisit[] {
  const time = (v: OnSiteVisit) => Date.parse(v.checkedInAt);
  return [...rows].sort((a, b) =>
    sort === "newest" ? time(b) - time(a) || a.plate.localeCompare(b.plate) : sort === "area" ? a.areaName.localeCompare(b.areaName) || time(a) - time(b) : time(a) - time(b) || a.plate.localeCompare(b.plate),
  );
}

/**
 * The cars an end-of-service sweep for one service should look at: still parked, checked in for that service or an earlier one, and not
 * yet marked "Still here" in that sweep (the same list the sweep has always used).
 */
export function sweepCandidates(rows: OnSiteVisit[], service: { id: number; startsAt: string }): OnSiteVisit[] {
  return rows.filter((v) => hhmm(v.serviceStart) <= hhmm(service.startsAt) && !markedStillHere(v, service.id));
}

/** The four numbers at the top. Cars are counted once each, by plate, so a duplicate record can never count a car twice. */
export function sweepSummary(rows: OnSiteVisit[], nowMs: number): { onSite: number; overstaying: number } {
  const onSite = new Set(rows.map((v) => v.plate));
  const overstaying = new Set(rows.filter((v) => isOverstaying(v, nowMs)).map((v) => v.plate));
  return { onSite: onSite.size, overstaying: overstaying.size };
}

/** "4h 18m", "10m" or "Under 1m". */
export function elapsedText(minutes: number): string {
  if (minutes < 1) return "Under 1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const serviceTimes = (v: Pick<OnSiteVisit, "serviceStart" | "serviceEnd">) => `${hhmm(v.serviceStart)} – ${hhmm(v.serviceEnd)}`;

// ---------- Bulk marking ----------

export type BulkItem = { visitId: string; ok: boolean; message?: string };

/** What a bulk "Still here" did, in words that never claim more than happened. */
export function describeBulk(items: BulkItem[]): { ok: boolean; message: string } {
  const failed = items.filter((i) => !i.ok);
  const done = items.length - failed.length;
  if (items.length === 0) return { ok: false, message: "No cars were selected." };
  if (failed.length === 0) return { ok: true, message: `${done} ${done === 1 ? "car" : "cars"} marked Still here.` };
  if (done === 0) return { ok: false, message: `No cars were marked. ${failed[0].message ?? "Please try again."}` };
  return {
    ok: false,
    message: `${done} of ${items.length} cars marked Still here. ${failed.length} could not be marked (${[...new Set(failed.map((f) => f.message ?? "please try again"))].join("; ")}).`,
  };
}
