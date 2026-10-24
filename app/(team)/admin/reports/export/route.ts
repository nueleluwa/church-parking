import { NextResponse } from "next/server";
import { getSettings, listActiveAreas, listMatchingVisits, listReportVisits, logAudit, resolveVisitExtras } from "@/lib/db";
import { loadReportInput } from "@/lib/report-data";
import { buildReportPdf } from "@/lib/report-pdf";
import { buildWorkbook } from "@/lib/report-workbook";
import {
  MAX_REPORT_DAYS,
  buildReportTable,
  findReport,
  hasRole,
  parseRange,
  parseVisitStatus,
  searchPlate,
  rangeDays,
  reportFilename,
  tableToCsv,
  visitListToCsv,
  visitsToCsv,
  workbookFilename,
} from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * One report as a CSV (?report=...), every report in one Excel workbook (?report=all), or the designed PDF with charts (?report=pdf),
 * for a date range and an optional service.
 * Without ?report it is the older
 * visit-by-visit file the Visits screen links to. Admins only, and every export is written to the audit log.
 */
export async function GET(request: Request) {
  const staff = await currentStaff();
  if (!staff || !hasRole(staff.role, "admin")) return fail("Not allowed", 401);

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!range) return fail("Choose a start date that is not after the end date.");
  if (rangeDays(range.from, range.to) > MAX_REPORT_DAYS) return fail(`Choose a period of up to ${MAX_REPORT_DAYS} days.`);

  const serviceParam = url.searchParams.get("service");
  if (serviceParam && !/^\d{1,6}$/.test(serviceParam)) return fail("That service is not recognised.");
  const serviceId = serviceParam ? Number(serviceParam) : null;

  const reportId = url.searchParams.get("report");

  // The Visits screen's list: the visits matching its filters (not just the page on screen)
  if (reportId === "visit-list") {
    const areaSlug = url.searchParams.get("area");
    const area = areaSlug ? (await listActiveAreas()).find((a) => a.slug === areaSlug) : undefined;
    if (areaSlug && !area) return fail("That parking area is not recognised.");
    // The phone and "open longer than N hours" filters of the screen, worked out the same way so the file matches what was shown
    const extras = await resolveVisitExtras(
      { phone: url.searchParams.get("phone"), long: url.searchParams.get("long") },
      { isAdmin: true, longHours: (await getSettings()).longSessionHours, now: new Date() },
    );
    if (extras.phoneProblem) return fail(extras.phoneProblem);
    const status = extras.openBefore ? ("parked" as const) : parseVisitStatus(url.searchParams.get("status"));
    const plate = searchPlate(url.searchParams.get("q"));
    const rows = await listMatchingVisits({ from: range.from, to: range.to, serviceId, areaId: area?.id ?? null, status, plate, memberId: extras.memberId, openBefore: extras.openBefore });
    await logAudit(staff.id, null, "export_report", {
      after: { report: "visit-list", from: range.from, to: range.to, rows: rows.length, ...(serviceId !== null ? { service: serviceId } : {}), ...(area ? { area: area.slug } : {}), ...(status ? { status } : {}), ...(plate ? { search: true } : {}), ...(extras.phoneUsed ? { member_search: true } : {}), ...(extras.openBefore ? { open_longer: true } : {}) },
    });
    return new NextResponse(visitListToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="visits_${range.from === range.to ? range.from : `${range.from}_to_${range.to}`}${area ? `_${area.slug}` : ""}${status ? `_${status}` : ""}.csv"`,
        "X-Report-Rows": String(rows.length),
        "Cache-Control": "no-store",
      },
    });
  }

  // The designed PDF: the logo, key figures, charts and comparison tables
  if (reportId === "pdf") {
    const input = await loadReportInput(range, serviceId);
    if (!input) return fail("That service is not recognised.");
    const pdf = await buildReportPdf(input);
    await logAudit(staff.id, null, "export_report", {
      after: { report: "pdf", from: range.from, to: range.to, pages: pdf.pages, rows: input.visits.length, ...(serviceId !== null ? { service: serviceId } : {}) },
    });
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${workbookFilename(range, input.service, "pdf")}"`,
        "X-Report-Rows": String(input.visits.length),
        "Cache-Control": "no-store",
      },
    });
  }

  // Every report in one Excel file: a Contents sheet, then a sheet for each report
  if (reportId === "all") {
    const input = await loadReportInput(range, serviceId);
    if (!input) return fail("That service is not recognised.");
    const book = await buildWorkbook(input);
    await logAudit(staff.id, null, "export_report", {
      after: { report: "all", from: range.from, to: range.to, sheets: book.sheets, rows: book.rows, ...(serviceId !== null ? { service: serviceId } : {}) },
    });
    return new NextResponse(new Uint8Array(book.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${workbookFilename(range, input.service)}"`,
        "X-Report-Rows": String(book.rows),
        "Cache-Control": "no-store",
      },
    });
  }

  if (reportId) {
    const report = findReport(reportId);
    if (!report) return fail("That report is not recognised.");
    const input = await loadReportInput(range, serviceId);
    if (!input) return fail("That service is not recognised.");
    const table = buildReportTable(report.id, input);
    await logAudit(staff.id, null, "export_report", {
      after: { report: report.id, from: range.from, to: range.to, rows: table.rows.length, ...(serviceId !== null ? { service: serviceId } : {}) },
    });
    return new NextResponse(tableToCsv(table), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${reportFilename(report, range, input.service)}"`,
        "X-Report-Rows": String(table.rows.length),
        "Cache-Control": "no-store",
      },
    });
  }

  // The older visit-by-visit file
  const area = (await listActiveAreas()).find((a) => a.slug === url.searchParams.get("area"));
  const all = await listReportVisits(range.from, range.to);
  const visits = all.filter((v) => (!area || v.areaName === area.name) && (serviceId === null || v.serviceId === serviceId));
  await logAudit(staff.id, null, "export_report", {
    after: { from: range.from, to: range.to, rows: visits.length, ...(area ? { area: area.slug } : {}), ...(serviceId !== null ? { service: serviceId } : {}) },
  });
  return new NextResponse(visitsToCsv(visits), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="parking-${range.from}-to-${range.to}${area ? `-${area.slug}` : ""}${serviceId !== null ? `-service-${serviceId}` : ""}.csv"`,
      "X-Report-Rows": String(visits.length),
      "Cache-Control": "no-store",
    },
  });
}
