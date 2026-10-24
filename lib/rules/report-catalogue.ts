import { describeAlert } from "./alerts";
import { clock, lagosMinutes } from "./analytics";
import { completedStay, rangeDays } from "./analytics-report";
import { csvCell, type ReportVisit } from "./reports";

/**
 * The reports an admin can download. Each is a real calculation over the visit and alert records, and every one is
 * CSV only: no PDF is generated, so none is offered. Reports never contain drivers' names or phone numbers.
 *
 * How the records are treated, for every report:
 * - A visit belongs to the service date it was checked in on (Lagos), and to the service it was checked in for.
 * - "Cars checked in" counts visits, so a car that came twice counts twice.
 * - "Cars left" counts visits released at the exit (a recorded check-out). A car that left without being scanned has none.
 * - "Not checked out" counts visits with no recorded check-out: closed as missed, or still parked.
 * - "Currently parked" is a live snapshot taken when the file is made. It is not a count for the dates chosen.
 * - Alerts are never merged or dropped: every alert raised in the period is listed, resolved or not.
 * - Times are Lagos time. Averages use only completed visits with a reliable stay (see completedStay).
 */

export type ReportCategoryId = "activity" | "vehicles" | "members" | "services" | "areas" | "alerts";

export const CATEGORIES: { id: ReportCategoryId; name: string; description: string }[] = [
  { id: "activity", name: "Parking activity", description: "Check-ins, check-outs and parking activity." },
  { id: "vehicles", name: "Vehicle details", description: "Vehicle history and visit records." },
  { id: "members", name: "Members", description: "Member vehicle activity and exceptions." },
  { id: "services", name: "Services", description: "Service-level parking activity and comparisons." },
  { id: "areas", name: "Parking areas", description: "Parking area usage and comparisons." },
  { id: "alerts", name: "Alerts and exceptions", description: "Security alerts, conflicts and operational exceptions." },
];

export const CATEGORY_INTRO: Record<ReportCategoryId, string> = {
  activity: "Check-ins, check-outs and parking activity for the selected period.",
  vehicles: "Visit records for vehicles in the selected period. Plates only: no names or phone numbers.",
  members: "Activity of members' cars in the selected period, and cars a guest tried to check in under a member's plate.",
  services: "Activity for each service in the selected period, and how the services compare.",
  areas: "Activity for each parking area in the selected period, and the cars parked in each right now.",
  alerts: "Missed check-outs, conflicts and other exceptions raised in the selected period.",
};

export type ReportId =
  | "parking-summary"
  | "activity-by-day"
  | "hourly-activity"
  | "area-activity"
  | "service-activity"
  | "vehicle-visit-history"
  | "checkin-checkout-records"
  | "vehicle-activity"
  | "member-vehicle-activity"
  | "member-visits"
  | "member-exceptions"
  | "service-by-day"
  | "service-comparison"
  | "service-by-hour"
  | "area-by-day"
  | "area-comparison"
  | "current-by-area"
  | "missed-checkouts"
  | "conflicts"
  | "released-without-scan"
  | "held-cars"
  | "credential-replacements";

export type ReportDef = { id: ReportId; category: ReportCategoryId; name: string; description: string; formats: readonly ["csv"] };

const csv = ["csv"] as const;

/** A visit whose check-out code was replaced this many times or more appears in the replacement report. */
export const REPEAT_REPLACEMENTS = 2;

/** How a released visit was released, in words, for the visit report. */
const RELEASE_LABEL: Record<string, string> = {
  scan: "Pass scanned",
  search: "Looked up, no pass scanned",
  self: "Member checked out (exit sign)",
  staff_close: "Closed by staff",
};
export const REPORTS: ReportDef[] = [
  { id: "parking-summary", category: "activity", name: "Parking summary", description: "Check-ins, check-outs, cars with no check-out, unique vehicles and average stay, plus the cars parked right now.", formats: csv },
  { id: "activity-by-day", category: "activity", name: "Vehicle activity by day", description: "Daily check-ins, check-outs and cars with no recorded check-out.", formats: csv },
  { id: "hourly-activity", category: "activity", name: "Hourly activity", description: "Check-ins and check-outs grouped by hour of the day.", formats: csv },
  { id: "area-activity", category: "activity", name: "Parking area activity", description: "Check-ins and check-outs by parking area, with the cars parked there right now.", formats: csv },
  { id: "service-activity", category: "activity", name: "Service activity", description: "Check-ins, check-outs and the busiest hour for each service.", formats: csv },
  { id: "vehicle-visit-history", category: "vehicles", name: "Vehicle visit history", description: "Every visit, by plate, with its service, parking area, status and length of stay.", formats: csv },
  { id: "checkin-checkout-records", category: "vehicles", name: "Check-in and check-out records", description: "Each visit's check-in and check-out times, how it was released and by whom.", formats: csv },
  { id: "vehicle-activity", category: "vehicles", name: "Vehicle activity", description: "One row per vehicle: visits, check-outs, first and last visit and car parks used.", formats: csv },
  { id: "member-vehicle-activity", category: "members", name: "Member vehicle activity", description: "One row per member's car: visits, check-outs and last visit.", formats: csv },
  { id: "member-visits", category: "members", name: "Member vehicle visits", description: "Every visit by a member's car, with service, parking area and status.", formats: csv },
  { id: "member-exceptions", category: "members", name: "Member car claims by guests", description: "Times a guest tried to check in under a member's number plate.", formats: csv },
  { id: "service-by-day", category: "services", name: "Service activity by day", description: "Check-ins and check-outs for each service on each day.", formats: csv },
  { id: "service-comparison", category: "services", name: "Service comparison", description: "Services side by side: share of check-ins, check-outs, average stay and busiest hour.", formats: csv },
  { id: "service-by-hour", category: "services", name: "Service activity by hour", description: "Check-ins and check-outs for each service, hour by hour.", formats: csv },
  { id: "area-by-day", category: "areas", name: "Parking area activity by day", description: "Check-ins and check-outs for each parking area on each day.", formats: csv },
  { id: "area-comparison", category: "areas", name: "Parking area comparison", description: "Parking areas side by side: share of check-ins, check-outs, missed check-outs and average stay.", formats: csv },
  { id: "current-by-area", category: "areas", name: "Cars parked now, by area", description: "Live snapshot of the cars parked right now in each parking area and service. Not limited to the dates.", formats: csv },
  { id: "missed-checkouts", category: "alerts", name: "Missed check-outs", description: "Visits closed as missed: the car was never released at the exit.", formats: csv },
  { id: "conflicts", category: "alerts", name: "Vehicle and member conflicts", description: "Second check-ins of a car already checked in, and guests using a member's plate. Resolved and open.", formats: csv },
  { id: "released-without-scan", category: "alerts", name: "Releases without a scanned pass", description: "Cars released after a lookup by plate, phone or reference, with no pass scanned.", formats: csv },
  { id: "credential-replacements", category: "alerts", name: "Check-out code replaced more than once", description: "Visits whose phone check-out code was replaced two or more times by a repeat check-in. Worth a look: it can mean someone else is checking in with a member's number.", formats: csv },
  { id: "held-cars", category: "alerts", name: "Cars held: does not match", description: "Times an attendant held a car because the driver or car did not match. Resolved and open.", formats: csv },
];

export const reportsIn = (category: ReportCategoryId) => REPORTS.filter((r) => r.category === category);
export const findReport = (id: string | null | undefined) => REPORTS.find((r) => r.id === id) ?? null;

// ---------- Inputs and output ----------

export type ReportAlert = {
  id: number;
  kind: string;
  plate: string | null;
  createdAt: string;
  resolvedAt: string | null;
  areaName: string | null;
  serviceId: number | null;
  serviceName: string | null;
};

export type ReportInput = {
  range: { from: string; to: string };
  /** The chosen service (the visits and alerts given are already limited to it), or null for all services. */
  service: { id: number; name: string } | null;
  visits: ReportVisit[];
  alerts: ReportAlert[];
  /** Cars parked at the moment the file is made. */
  parkedNow: { areaId: number; areaName: string; serviceId: number; serviceName: string }[];
  /** Every active parking area, so one with no activity still has a row. */
  areas: { id: number; name: string }[];
  generatedAt: Date;
};

export type Table = { headers: string[]; rows: (string | number)[][] };

export const MAX_REPORT_DAYS = 366;

// ---------- Helpers ----------

const lagosStamp = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "");
const lagosDateOf = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10);
const hourOf = (iso: string) => Math.floor(lagosMinutes(iso) / 60);
const hourLabel = (h: number) => `${clock(h * 60)} – ${clock((h + 1) * 60)}`;
const driverType = (v: ReportVisit) => (v.isGuest ? "Guest" : "Member");
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const eachDay = (range: { from: string; to: string }) => {
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  return days;
};
const left = (v: ReportVisit) => v.status === "released" && v.releasedAt !== null;
const average = (visits: ReportVisit[]): number | "" => {
  const stays = visits.map(completedStay).filter((m): m is number => m !== null);
  return stays.length ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length) : "";
};
const percent = (part: number, whole: number) => (whole === 0 ? "" : Math.round((part / whole) * 100));
const busiest = (visits: ReportVisit[]): { label: string; count: number } | null => {
  const hours = new Map<number, number>();
  for (const v of visits) hours.set(hourOf(v.checkedInAt), (hours.get(hourOf(v.checkedInAt)) ?? 0) + 1);
  const top = [...hours.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return top ? { label: hourLabel(top[0]), count: top[1] } : null;
};
const status = (v: ReportVisit) => (v.status === "released" ? "Released" : v.status === "missed" ? "Missed" : "Parked");
const byPlateThenTime = (a: ReportVisit, b: ReportVisit) => a.plate.localeCompare(b.plate) || a.checkedInAt.localeCompare(b.checkedInAt);
const alertState = (a: ReportAlert) => (a.resolvedAt ? "Resolved" : "Open");

function visitRows(visits: ReportVisit[]): Table {
  return {
    headers: ["Date", "Plate", "Driver type", "Service", "Parking area", "Status", "Checked in (Lagos)", "Checked out (Lagos)", "Stay (minutes)", "Reference"],
    rows: [...visits].sort(byPlateThenTime).map((v) => [v.serviceDate, v.plate, driverType(v), v.serviceName, v.areaName, status(v), lagosStamp(v.checkedInAt), lagosStamp(v.releasedAt), completedStay(v) ?? "", v.reference]),
  };
}

function perVehicle(visits: ReportVisit[]): Table {
  const cars = new Map<string, ReportVisit[]>();
  for (const v of visits) cars.set(v.plate, [...(cars.get(v.plate) ?? []), v]);
  return {
    headers: ["Plate", "Visits", "Cars left", "Not checked out", "First check-in (Lagos)", "Last check-in (Lagos)", "Parking areas used", "Driver type"],
    rows: [...cars.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([plate, list]) => {
        const times = list.map((v) => v.checkedInAt).sort();
        const kinds = new Set(list.map(driverType));
        return [
          plate,
          list.length,
          list.filter(left).length,
          list.filter((v) => !left(v)).length,
          lagosStamp(times[0]),
          lagosStamp(times[times.length - 1]),
          [...new Set(list.map((v) => v.areaName))].sort().join("; "),
          kinds.size > 1 ? "Member and guest" : [...kinds][0],
        ];
      }),
  };
}

type Group = { key: string; name: string; visits: ReportVisit[] };
function group(visits: ReportVisit[], by: "area" | "service", include: { id: number; name: string }[] = []): Group[] {
  const map = new Map<string, Group>(include.map((x) => [String(x.id), { key: String(x.id), name: x.name, visits: [] }]));
  for (const v of visits) {
    const key = String(by === "area" ? v.areaId : v.serviceId);
    const g = map.get(key) ?? { key, name: by === "area" ? v.areaName : v.serviceName, visits: [] };
    g.visits.push(v);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.visits.length - a.visits.length || a.name.localeCompare(b.name));
}

const perDay = (visits: ReportVisit[], day: string) => ({
  checkedIn: visits.filter((v) => v.serviceDate === day).length,
  left: visits.filter((v) => left(v) && lagosDateOf(v.releasedAt!) === day).length,
  notOut: visits.filter((v) => v.serviceDate === day && !left(v)).length,
});
const perHour = (visits: ReportVisit[], h: number) => ({
  checkedIn: visits.filter((v) => hourOf(v.checkedInAt) === h).length,
  left: visits.filter((v) => left(v) && hourOf(v.releasedAt!) === h).length,
});

// ---------- The reports ----------

/** Works out one report's table. The visits and alerts in `input` must already be limited to the chosen service. */
export function buildReportTable(id: ReportId, input: ReportInput): Table {
  const { visits, alerts, range } = input;
  const days = eachDay(range);

  switch (id) {
    case "parking-summary": {
      const unique = new Set(visits.map((v) => v.plate)).size;
      return {
        headers: ["Measure", "Value", "How it is counted"],
        rows: [
          ["Period (Lagos dates)", `${range.from} to ${range.to}`, `${rangeDays(range.from, range.to)} days`],
          ["Service", input.service?.name ?? "All services", ""],
          ["Cars checked in", visits.length, "Visits in the period. A car that came twice counts twice."],
          ["Cars left", visits.filter(left).length, "Visits released at the exit (a recorded check-out)."],
          ["Not checked out", visits.filter((v) => !left(v)).length, "Visits with no recorded check-out: closed as missed, or still parked."],
          ["Unique vehicles", unique, "Different number plates in the period."],
          ["Average stay (minutes)", average(visits), "Completed visits only (checked in and released)."],
          ["Cars parked right now (live)", input.parkedNow.length, "Counted when this file was made. Not limited to the dates chosen."],
          ["File made (Lagos)", lagosStamp(input.generatedAt.toISOString()), ""],
        ],
      };
    }
    case "activity-by-day":
      return {
        headers: ["Date", "Cars checked in", "Cars left", "Not checked out"],
        rows: days.map((d) => {
          const c = perDay(visits, d);
          return [d, c.checkedIn, c.left, c.notOut];
        }),
      };
    case "hourly-activity":
      return {
        headers: ["Hour (Lagos)", "Cars checked in", "Cars left"],
        rows: Array.from({ length: 24 }, (_, h) => {
          const c = perHour(visits, h);
          return [hourLabel(h), c.checkedIn, c.left];
        }),
      };
    case "area-activity":
      return {
        headers: ["Parking area", "Cars checked in", "Cars left", "Not checked out", "Cars parked right now (live)"],
        rows: group(visits, "area", input.areas).map((g) => [
          g.name,
          g.visits.length,
          g.visits.filter(left).length,
          g.visits.filter((v) => !left(v)).length,
          input.parkedNow.filter((p) => String(p.areaId) === g.key).length,
        ]),
      };
    case "service-activity":
      return {
        headers: ["Service", "Cars checked in", "Cars left", "Not checked out", "Unique vehicles", "Busiest hour", "Check-ins in the busiest hour"],
        rows: group(visits, "service").map((g) => {
          const top = busiest(g.visits);
          return [g.name, g.visits.length, g.visits.filter(left).length, g.visits.filter((v) => !left(v)).length, new Set(g.visits.map((v) => v.plate)).size, top?.label ?? "", top?.count ?? ""];
        }),
      };
    case "vehicle-visit-history":
      return visitRows(visits);
    case "checkin-checkout-records":
      return {
        headers: ["Reference", "Plate", "Checked in (Lagos)", "Checked out (Lagos)", "How released", "Released by", "Status"],
        rows: [...visits]
          .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))
          .map((v) => [v.reference, v.plate, lagosStamp(v.checkedInAt), lagosStamp(v.releasedAt), v.status === "released" ? RELEASE_LABEL[v.releaseMethod ?? "scan"] ?? "Pass scanned" : "", v.releasedByName ?? "", status(v)]),
      };
    case "vehicle-activity":
      return perVehicle(visits);
    case "member-vehicle-activity":
      return perVehicle(visits.filter((v) => !v.isGuest));
    case "member-visits":
      return visitRows(visits.filter((v) => !v.isGuest));
    case "member-exceptions":
      return alertTable(alerts.filter((a) => a.kind === "member_plate_claim"));
    case "service-by-day": {
      const services = group(visits, "service");
      return {
        headers: ["Date", "Service", "Cars checked in", "Cars left", "Not checked out"],
        rows: days.flatMap((d) => services.map((s) => [d, s.name, ...Object.values(perDay(s.visits, d))])).filter((r) => (r[2] as number) + (r[3] as number) + (r[4] as number) > 0),
      };
    }
    case "service-comparison":
      return {
        headers: ["Service", "Cars checked in", "Share of check-ins (%)", "Cars left", "Not checked out", "Average stay (minutes)", "Busiest hour"],
        rows: group(visits, "service").map((g) => [g.name, g.visits.length, percent(g.visits.length, visits.length), g.visits.filter(left).length, g.visits.filter((v) => !left(v)).length, average(g.visits), busiest(g.visits)?.label ?? ""]),
      };
    case "service-by-hour": {
      const services = group(visits, "service");
      return {
        headers: ["Service", "Hour (Lagos)", "Cars checked in", "Cars left"],
        rows: services.flatMap((s) => Array.from({ length: 24 }, (_, h) => [s.name, hourLabel(h), perHour(s.visits, h).checkedIn, perHour(s.visits, h).left])).filter((r) => (r[2] as number) + (r[3] as number) > 0),
      };
    }
    case "area-by-day": {
      const areas = group(visits, "area", input.areas);
      return {
        headers: ["Date", "Parking area", "Cars checked in", "Cars left", "Not checked out"],
        rows: days.flatMap((d) => areas.map((a) => [d, a.name, ...Object.values(perDay(a.visits, d))])).filter((r) => (r[2] as number) + (r[3] as number) + (r[4] as number) > 0),
      };
    }
    case "area-comparison":
      return {
        headers: ["Parking area", "Cars checked in", "Share of check-ins (%)", "Cars left", "Missed check-outs", "Average stay (minutes)"],
        rows: group(visits, "area", input.areas).map((g) => [g.name, g.visits.length, percent(g.visits.length, visits.length), g.visits.filter(left).length, g.visits.filter((v) => v.status === "missed").length, average(g.visits)]),
      };
    case "current-by-area": {
      const counts = new Map<string, { area: string; service: string; count: number }>();
      for (const p of input.parkedNow) {
        const key = `${p.areaId}:${p.serviceId}`;
        counts.set(key, { area: p.areaName, service: p.serviceName, count: (counts.get(key)?.count ?? 0) + 1 });
      }
      return {
        headers: ["Parking area", "Service", "Cars parked now", "As at (Lagos)"],
        rows: [...counts.values()].sort((a, b) => a.area.localeCompare(b.area) || a.service.localeCompare(b.service)).map((c) => [c.area, c.service, c.count, lagosStamp(input.generatedAt.toISOString())]),
      };
    }
    case "missed-checkouts":
      return {
        headers: ["Date", "Plate", "Driver type", "Service", "Parking area", "Checked in (Lagos)", "Reference"],
        rows: visits.filter((v) => v.status === "missed").sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)).map((v) => [v.serviceDate, v.plate, driverType(v), v.serviceName, v.areaName, lagosStamp(v.checkedInAt), v.reference]),
      };
    case "conflicts":
      return alertTable(alerts.filter((a) => a.kind === "plate_conflict" || a.kind === "member_plate_claim"), true);
    case "released-without-scan":
      return {
        headers: ["Date", "Plate", "Service", "Parking area", "Checked in (Lagos)", "Released (Lagos)", "Released by", "Reference"],
        rows: visits.filter((v) => v.status === "released" && v.releaseMethod === "search").sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)).map((v) => [v.serviceDate, v.plate, v.serviceName, v.areaName, lagosStamp(v.checkedInAt), lagosStamp(v.releasedAt), v.releasedByName ?? "", v.reference]),
      };
    case "credential-replacements":
      return {
        headers: ["Date", "Plate", "Service", "Parking area", "Checked in (Lagos)", "Times the code was replaced", "Status", "Reference"],
        rows: visits
          .filter((v) => (v.credentialReissues ?? 0) >= REPEAT_REPLACEMENTS)
          .sort((a, b) => (b.credentialReissues ?? 0) - (a.credentialReissues ?? 0) || a.checkedInAt.localeCompare(b.checkedInAt))
          .map((v) => [v.serviceDate, v.plate, v.serviceName, v.areaName, lagosStamp(v.checkedInAt), v.credentialReissues ?? 0, status(v), v.reference]),
      };
    case "held-cars":
      return alertTable(alerts.filter((a) => a.kind === "no_match"));
  }
}

function alertTable(alerts: ReportAlert[], withKind = false): Table {
  return {
    headers: ["Raised (Lagos)", ...(withKind ? ["What happened"] : []), "Plate", "Parking area", "Service", "Status", "Resolved (Lagos)"],
    rows: [...alerts]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a) => [lagosStamp(a.createdAt), ...(withKind ? [describeAlert(a.kind).title] : []), a.plate ?? "", a.areaName ?? "", a.serviceName ?? "", alertState(a), lagosStamp(a.resolvedAt)]),
  };
}

// ---------- Files ----------

/** A table as CSV, with the BOM that makes Excel read it as UTF-8. Cells that could run as formulas are neutralised. */
export function tableToCsv(table: Table): string {
  return `﻿${[table.headers, ...table.rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** A safe file name: the report, the dates and (if chosen) the service, in plain letters, digits and dashes. */
export function reportFilename(report: Pick<ReportDef, "id">, range: { from: string; to: string }, service: { name: string } | null): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const dates = range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
  return `${report.id}_${dates}${service ? `_${slug(service.name)}` : ""}.csv`;
}

// ---------- One workbook with every report ----------

/** The sheet that comes first in the workbook and lists the others. */
export const CONTENTS_SHEET = "Contents";

/**
 * A name Excel accepts for a sheet: no \ / ? * [ ] :, at most 31 characters, and different (ignoring capitals) from every name
 * already taken. `taken` is added to.
 */
export function sheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Report";
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export type WorkbookSheet = { sheet: string; report: ReportDef; table: Table };

/** Every report as a table, in the order of the catalogue, each with a sheet name that is safe and unique. */
export function workbookSheets(input: ReportInput): WorkbookSheet[] {
  const taken = new Set([CONTENTS_SHEET.toLowerCase()]);
  return REPORTS.map((report) => ({ sheet: sheetName(report.name, taken), report, table: buildReportTable(report.id, input) }));
}

/** The workbook's file name: the dates and (if chosen) the service, in plain letters, digits and dashes. */
export function workbookFilename(range: { from: string; to: string }, service: { name: string } | null): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const dates = range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
  return `parking-reports_${dates}${service ? `_${slug(service.name)}` : ""}.xlsx`;
}
