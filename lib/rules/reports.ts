/** One visit as the reports see it. No names or phone numbers: reports never need them. */
export type ReportVisit = {
  id: string;
  serviceDate: string;
  serviceId: number;
  serviceName: string;
  areaId: number;
  areaName: string;
  status: "parked" | "released" | "missed";
  releaseMethod: "scan" | "search" | "sweep" | "midnight" | "self" | "staff_close" | null;
  plate: string;
  reference: string;
  checkedInAt: string;
  releasedAt: string | null;
  releasedByName: string | null;
  isGuest: boolean;
  /** Times a repeat check-in replaced the visit's checkout code (phone check-in). Absent or 0 for every other visit. */
  credentialReissues?: number;
};

export type Counts = { checkedIn: number; released: number; stillParked: number; missed: number };

export type ReportArea = Counts & { areaId: number; areaName: string };
export type ReportService = Counts & { serviceId: number; serviceName: string; areas: ReportArea[] };
export type ReportDay = Counts & { date: string; services: ReportService[] };

export type Report = {
  days: ReportDay[];
  totals: Counts & {
    /** Missed check-outs as a share of all visits, as a whole percentage. */
    missedPercent: number;
    /** Cars released by search, with no pass scanned. */
    releasedWithoutPass: number;
  };
  alerts: { plateConflicts: number; memberPlateClaims: number; noMatch: number };
};

const zero = (): Counts => ({ checkedIn: 0, released: 0, stillParked: 0, missed: 0 });

function add(c: Counts, status: ReportVisit["status"]) {
  c.checkedIn += 1;
  if (status === "released") c.released += 1;
  else if (status === "missed") c.missed += 1;
  else c.stillParked += 1;
}

/**
 * The report numbers, counted from the visit records themselves. A visit is counted under the
 * service it was checked in for, so a car that carries over is never counted twice.
 */
export function buildReport(visits: ReportVisit[], alertKinds: string[] = []): Report {
  const days = new Map<string, ReportDay & { _s: Map<number, ReportService & { _a: Map<number, ReportArea> }> }>();
  const totals = zero();
  let withoutPass = 0;

  for (const v of visits) {
    add(totals, v.status);
    if (v.status === "released" && v.releaseMethod === "search") withoutPass += 1;

    let day = days.get(v.serviceDate);
    if (!day) {
      day = { date: v.serviceDate, ...zero(), services: [], _s: new Map() };
      days.set(v.serviceDate, day);
    }
    add(day, v.status);

    let svc = day._s.get(v.serviceId);
    if (!svc) {
      svc = { serviceId: v.serviceId, serviceName: v.serviceName, ...zero(), areas: [], _a: new Map() };
      day._s.set(v.serviceId, svc);
    }
    add(svc, v.status);

    let area = svc._a.get(v.areaId);
    if (!area) {
      area = { areaId: v.areaId, areaName: v.areaName, ...zero() };
      svc._a.set(v.areaId, area);
    }
    add(area, v.status);
  }

  const out: ReportDay[] = [...days.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      date: d.date,
      checkedIn: d.checkedIn,
      released: d.released,
      stillParked: d.stillParked,
      missed: d.missed,
      services: [...d._s.values()]
        .sort((a, b) => a.serviceId - b.serviceId)
        .map((s) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          checkedIn: s.checkedIn,
          released: s.released,
          stillParked: s.stillParked,
          missed: s.missed,
          areas: [...s._a.values()].sort((a, b) => a.areaId - b.areaId),
        })),
    }));

  return {
    days: out,
    totals: {
      ...totals,
      missedPercent: totals.checkedIn === 0 ? 0 : Math.round((totals.missed / totals.checkedIn) * 100),
      releasedWithoutPass: withoutPass,
    },
    alerts: {
      plateConflicts: alertKinds.filter((k) => k === "plate_conflict").length,
      memberPlateClaims: alertKinds.filter((k) => k === "member_plate_claim").length,
      noMatch: alertKinds.filter((k) => k === "no_match").length,
    },
  };
}

/**
 * One spreadsheet cell. Quotes are doubled, and a cell that starts with = + - or @ gets a
 * leading apostrophe so Excel never runs it as a formula.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADERS = [
  "Date",
  "Service",
  "Car park",
  "Plate",
  "Reference",
  "Driver type",
  "Status",
  "Release method",
  "Checked in",
  "Released or closed",
  "Released by",
];

/** The visits as CSV. No names or phone numbers. Times are ISO, in UTC. */
export function visitsToCsv(visits: ReportVisit[]): string {
  const rows = visits.map((v) =>
    [
      v.serviceDate,
      v.serviceName,
      v.areaName,
      v.plate,
      v.reference,
      v.isGuest ? "Guest" : "Member",
      v.status,
      v.releaseMethod ?? "",
      v.checkedInAt,
      v.releasedAt ?? "",
      v.releasedByName ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  // The BOM makes Excel read the file as UTF-8
  return `﻿${[HEADERS.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

/** A date range from the page address, or null if it is not two real dates in order. */
export function parseRange(from: string | null | undefined, to: string | null | undefined): { from: string; to: string } | null {
  const ok = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  if (!ok(from) || !ok(to) || from > to) return null;
  return { from, to };
}
