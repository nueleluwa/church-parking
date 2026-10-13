import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleIdentity } from "@/components/ds/VehicleIdentity";
import { listRecentActivity } from "@/lib/db";
import { formatLagosTime } from "@/lib/format";
import { formatPlate, lagosDate } from "@/lib/rules";
import { describeVehicle } from "@/lib/rules/vehicle";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Recent scans" };
export const dynamic = "force-dynamic";

const KIND = {
  entry: { word: "Entry", badge: "Checked in", tone: "success" },
  exit: { word: "Exit", badge: "Released", tone: "neutral" },
  closed: { word: "Closed", badge: "Missed", tone: "neutral" },
} as const;

/** Today's check-ins and releases, newest first. Real records only. Tap a row to open that car. */
export default async function HistoryPage() {
  await requireStaff("attendant");
  const events = await listRecentActivity(lagosDate(new Date()));

  return (
    <>
      <p className="text-ink-soft">Today&apos;s check-ins and releases, newest first.</p>
      {events.length === 0 ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">Nothing has happened today yet.</p>
      ) : (
        <ul className="divide-y divide-edge/15 overflow-hidden rounded-card bg-card shadow-sm">
          {events.map((e) => {
            const k = KIND[e.kind];
            const details = describeVehicle({ make: e.make, colour: e.colour });
            return (
              <li key={e.key}>
                <Link
                  href={`/p/${e.passToken}`}
                  aria-label={`${k.word}: ${formatPlate(e.plate)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-page"
                >
                  <span className="min-w-0 flex-1">
                    <VehicleIdentity plate={e.plate} summary={details}>
                      <span className="t-support block">
                        <span>{k.word}</span> <span aria-hidden="true">•</span> <span data-area>{e.areaName}</span>
                      </span>
                    </VehicleIdentity>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <span className="whitespace-nowrap text-sm font-semibold">{formatLagosTime(e.at)}</span>
                    <StatusBadge tone={k.tone}>{k.badge}</StatusBadge>
                  </span>
                  <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
