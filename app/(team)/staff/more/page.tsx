import { IconAlert, IconCalendar, IconCheck, IconClock, IconLogout, IconPlus, IconSearch, IconUser, IconWifi } from "@/components/icons";
import { MenuRow } from "@/components/MenuRow";
import { SyncStatus } from "@/components/SyncStatus";
import { hasRole } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { signOut } from "../actions";

export const metadata = { title: "More" };
export const dynamic = "force-dynamic";

const ROLE = { attendant: "Attendant", coordinator: "Coordinator", admin: "Admin" } as const;

/** Everything else: the shortcuts, the connection, and the staff member's own account with Sign out. */
export default async function MorePage() {
  const staff = await requireStaff("attendant");
  return (
    <>
      <ul className="divide-y divide-edge/15 overflow-hidden rounded-card bg-card shadow-sm">
        <li><MenuRow href="/staff/history" icon={<IconClock className="h-5 w-5" />} title="Recent Scans" /></li>
        <li><MenuRow href="/staff/search" icon={<IconSearch className="h-5 w-5" />} title="Manual Lookup" /></li>
        <li><MenuRow href="/staff/register" icon={<IconPlus className="h-5 w-5" />} title="Add Car" /></li>
        <li><MenuRow href="/staff/service" icon={<IconCalendar className="h-5 w-5" />} title="Service Information" /></li>
        {hasRole(staff.role, "coordinator") && (
          <>
            <li><MenuRow href="/staff/dashboard" icon={<IconAlert className="h-5 w-5" />} title="Live Board" /></li>
            <li><MenuRow href="/staff/sweep" icon={<IconCheck className="h-5 w-5" />} title="Sweep" /></li>
          </>
        )}
        <li><MenuRow icon={<IconWifi className="h-5 w-5" />} title="Sync Status" trailing={<SyncStatus />} /></li>
      </ul>

      <h2 className="px-1 pt-2 text-sm font-bold tracking-wide text-ink-soft">ACCOUNT</h2>
      <ul className="divide-y divide-edge/15 overflow-hidden rounded-card bg-card shadow-sm">
        <li>
          <MenuRow icon={<IconUser className="h-5 w-5" />} title={staff.name} subtitle={ROLE[staff.role]} />
        </li>
        <li>
          <form action={signOut}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left font-bold text-danger hover:bg-page">
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush">
                <IconLogout className="h-5 w-5" />
              </span>
              Sign Out
            </button>
          </form>
        </li>
      </ul>

      <p className="pt-2 text-center text-xs text-ink-soft">CCI Parking · Parking Management</p>
    </>
  );
}
