import { NextResponse } from "next/server";
import { getPassByToken } from "@/lib/db";
import { lagosDate, passState } from "@/lib/rules";

export const dynamic = "force-dynamic";

/**
 * A tiny status check for an open pass page: just "valid", "released",
 * "missed" or "expired", the same thing the public pass view already shows.
 * The page asks this every so often and reloads only when the answer changes.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pass = await getPassByToken(token);
  if (!pass) return NextResponse.json({ state: null }, { status: 404 });
  const state = passState({
    status: pass.status,
    serviceDate: pass.service_date,
    today: lagosDate(new Date()),
  });
  return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
}
