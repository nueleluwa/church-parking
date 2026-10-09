import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/dashboard-data";
import { canCorrect } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

/** The dashboard polls this every few seconds. Coordinators and admins only. */
export async function GET(request: Request) {
  const staff = await currentStaff();
  if (!staff || !canCorrect(staff.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("service");
  const serviceId = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : undefined;
  return NextResponse.json(await loadDashboard(serviceId), { headers: { "Cache-Control": "no-store" } });
}
