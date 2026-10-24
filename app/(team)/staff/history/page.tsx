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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink-soft">Today&apos;s check-ins and releases, newest first.</p>
        {events.length > 0 && (
          <p className="text-sm font-semibold" data-testid="recent-count">
            {events.length} {events.length === 1 ? "scan" : "scans"} today
          </p>
        )}
      </div>
      {events.length === 0 ? (
        <div className="rounded-card bg-card p-6 text-center shadow-sm">
          <p className="font-bold">Nothing has happened today yet.</p>
          <p className="mt-1 text-sm text-ink-soft">Check-ins and releases appear here as they happen.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const k = KIND[e.kind];
            const details = describeVehicle({ make: e.make, colour: e.colour });
            return (
              <li key={e.key} className="overflow-hidden rounded-card bg-card shadow-sm">
                <Link
                  href={`/p/${e.passToken}`}
                  aria-label={`${k.word}: ${formatPlate(e.plate)}`}
                  className={`flex items-center gap-3 border-l-4 py-3 pl-3 pr-3 hover:bg-page ${e.kind === "entry" ? "border-success" : "border-edge/25"}`}
                >
                  <span className="min-w-0 flex-1">
                    <VehicleIdentity plate={e.plate} summary={details}>
                      <span className="t-support block truncate whitespace-nowrap">
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
