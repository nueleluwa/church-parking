import { NextResponse } from "next/server";
import { listActiveAreas, listReportVisits, logAudit } from "@/lib/db";
import { loadReportInput } from "@/lib/report-data";
import {
  MAX_REPORT_DAYS,
  buildReportTable,
  findReport,
  hasRole,
  parseRange,
  rangeDays,
  reportFilename,
  tableToCsv,
  visitsToCsv,
} from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * One report as a CSV (?report=...), for a date range and an optional service. Without ?report it is the older
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
