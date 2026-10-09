import Link from "next/link";
import { IconAlert, IconCalendar, IconCheck, IconChevronRight, IconClock, IconPlus, IconScan, IconSearch, IconWifi } from "@/components/icons";
import { MenuRow } from "@/components/MenuRow";
import { SyncStatus } from "@/components/SyncStatus";
import { listActiveServices } from "@/lib/db";
import { hasRole, serviceStandings } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { stationContext } from "@/lib/station";
import { StationPicker } from "./StationPicker";

export const metadata = { title: "Attendant home" };
export const dynamic = "force-dynamic";

const hhmm = (t: string) => t.slice(0, 5);

/** The attendant's home: the service now, the two main jobs, and quick links. */
export default async function StaffHome() {
  const staff = await requireStaff("attendant");
  const standings = serviceStandings(new Date(), await listActiveServices());
  const { areas, station } = await stationContext();
  const shown =
    standings.find((s) => s.standing === "active") ??
    standings.find((s) => s.standing === "next") ??
    standings.filter((s) => s.standing === "finished").at(-1) ??
    null;
  const label = { active: "Active service", next: "Next service", finished: "Last service" } as const;
  const times = shown ? `${hhmm(shown.service.starts_at)} – ${hhmm(shown.service.ends_at)}` : "";

  return (
    <>
      <Link href="/staff/service" className="flex items-center gap-3 rounded-card bg-card p-4 shadow-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
          <IconCalendar className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-ink-soft">
            {shown && shown.standing !== "later" ? label[shown.standing] : "Service"}
          </span>
          <span className="block text-lg font-bold">{shown ? shown.service.name : "No service today"}</span>
          {shown && <span className="block text-sm text-ink-soft">{times}</span>}
        </span>
        <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />
      </Link>

      <StationPicker areas={areas} station={station} variant="card" />

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/staff/scan"
          className="flex flex-col items-center gap-1 rounded-card bg-action px-3 py-6 text-center text-white shadow-sm active:scale-[0.98]"
        >
          <IconScan className="h-8 w-8" />
          <span className="text-lg font-bold">Scan pass</span>
          <span className="text-sm text-white/80">Vehicle leaving</span>
        </Link>
        <Link
          href="/staff/register"
          className="flex flex-col items-center gap-1 rounded-card border-2 border-edge/20 bg-card px-3 py-6 text-center shadow-sm active:scale-[0.98]"
        >
          <IconPlus className="h-8 w-8" />
          <span className="text-lg font-bold">Add car</span>
          <span className="text-sm text-ink-soft">Register by hand</span>
        </Link>
      </div>

      <ul className="divide-y divide-edge/15 overflow-hidden rounded-card bg-card shadow-sm">
        <li>
          <MenuRow
            href="/staff/search"
            icon={<IconSearch className="h-5 w-5" />}
            title="Manual Lookup"
            subtitle="Find a car by plate, phone or reference"
          />
        </li>
        <li>
          <MenuRow
            href="/staff/history"
            icon={<IconClock className="h-5 w-5" />}
            title="Recent Scans"
            subtitle="View the latest check-ins and releases"
          />
        </li>
        <li>
          <MenuRow
            href="/staff/service"
            icon={<IconCalendar className="h-5 w-5" />}
            title="Service Info"
            subtitle={shown ? `${shown.service.name} • ${times}` : "No service today"}
          />
        </li>
        {hasRole(staff.role, "coordinator") && (
          <>
            <li>
              <MenuRow
                href="/staff/dashboard"
                icon={<IconAlert className="h-5 w-5" />}
                title="Live Board"
                subtitle="Car counts and alerts"
              />
            </li>
            <li>
              <MenuRow
                href="/staff/sweep"
                icon={<IconCheck className="h-5 w-5" />}
                title="Sweep"
                subtitle="Check the cars still left after a service"
              />
            </li>
          </>
        )}
        <li>
          <MenuRow icon={<IconWifi className="h-5 w-5" />} title="Sync Status" trailing={<SyncStatus />} />
        </li>
      </ul>
    </>
  );
}
