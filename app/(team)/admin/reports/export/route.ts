import { NextResponse } from "next/server";
import { listActiveAreas, listReportVisits, logAudit } from "@/lib/db";
import { hasRole, parseRange, visitsToCsv } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

/** CSV of every visit in a date range (AD-4). Admins only, and every export is written to the audit log. */
export async function GET(request: Request) {
  const staff = await currentStaff();
  if (!staff || !hasRole(staff.role, "admin")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!range) return NextResponse.json({ error: "Choose a start and end date." }, { status: 400 });

  const area = (await listActiveAreas()).find((a) => a.slug === url.searchParams.get("area"));
  const all = await listReportVisits(range.from, range.to);
  const serviceParam = url.searchParams.get("service");
  const serviceId = serviceParam && /^\d{1,6}$/.test(serviceParam) ? Number(serviceParam) : null;
  const visits = all.filter((v) => (!area || v.areaName === area.name) && (serviceId === null || v.serviceId === serviceId));
  await logAudit(staff.id, null, "export_report", { after: { from: range.from, to: range.to, rows: visits.length, ...(area ? { area: area.slug } : {}), ...(serviceId !== null ? { service: serviceId } : {}) } });

  return new NextResponse(visitsToCsv(visits), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="parking-${range.from}-to-${range.to}${area ? `-${area.slug}` : ""}${serviceId !== null ? `-service-${serviceId}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
