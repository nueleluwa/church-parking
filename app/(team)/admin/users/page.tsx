import { PageHeader } from "@/components/ds/PageHeader";
import { UnderlineTabs } from "@/components/UnderlineTabs";
import { requireStaff } from "@/lib/staff-auth";
import { MembersTab, type MembersSearch } from "./MembersTab";
import { StaffTab, type StaffSearch } from "./StaffTab";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

type Search = MembersSearch & StaffSearch & { tab?: string };

/**
 * Members and staff accounts, in one place. They are different records and stay different: a member signs in with a PIN and
 * saves cars; a staff account signs in with a password and has a role. The tab is in the address (`?tab=staff`), and each tab
 * has its own filters, so a member filter is never carried into the staff list. Administrators only.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff("admin");
  // An address with a name given twice (?q=a&q=b) arrives as a list: take the first
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Search;
  const staffTab = sp.tab === "staff";

  return (
    <>
      <PageHeader title="Users">Manage church members and staff accounts for the parking system.</PageHeader>
      <UnderlineTabs
        label="Users"
        tabs={[
          { label: "Members", href: "/admin/users", active: !staffTab },
          { label: "Staff accounts", href: "/admin/users?tab=staff", active: staffTab },
        ]}
      />
      {staffTab ? <StaffTab sp={sp} meId={me.id} /> : <MembersTab sp={sp} />}
    </>
  );
}
