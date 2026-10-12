import Link from "next/link";
import { listStaff } from "@/lib/db";
import { outlineButton } from "@/components/ui";
import { requireStaff } from "@/lib/staff-auth";
import { SectionHead, card } from "../ui";

export const metadata = { title: "Users & access" };
export const dynamic = "force-dynamic";

const ROLES = [
  {
    role: "admin",
    label: "Admin",
    can: "Every screen: the dashboard, analytics, reports, vehicles, users, and all of Settings. Only an admin can add or change accounts, services, car parks and signs.",
  },
  { role: "coordinator", label: "Coordinator", can: "Live Parking, Sweep and Visits, and the attendant tools. Can clear a held car, correct a visit (with a reason), and release a car." },
  { role: "attendant", label: "Attendant", can: "The attendant tools only: scan a pass, look a car up, add a car, and release a car at the exit." },
] as const;

/**
 * Who can do what. The roles are fixed in the system and are checked on the server for every action, so this section explains them and
 * counts the accounts. Accounts themselves (names, phone numbers, roles, passwords, switching on and off) are managed in Users.
 */
export default async function UsersAccessPage() {
  await requireStaff("admin");
  const staff = await listStaff();
  const active = (r: string) => staff.filter((s) => s.active && s.role === r).length;

  return (
    <section aria-label="Users and access" className={`${card} max-w-4xl`}>
      <SectionHead
        title="Users & access"
        action={
          <Link href="/admin/users?tab=staff" className={`${outlineButton} !w-auto`}>
            Manage staff accounts
          </Link>
        }
      >
        Everyone on the team has their own account, so every action is traceable. Roles decide what each person can open, and are checked on the server every time.
      </SectionHead>
      <dl className="divide-y divide-edge/15">
        {ROLES.map((r) => (
          <div key={r.role} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr_auto] sm:gap-6">
            <dt className="font-bold">{r.label}</dt>
            <dd className="text-ink-soft">{r.can}</dd>
            <dd className="font-semibold sm:text-right">
              {active(r.role)} active
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 rounded-xl bg-page p-3 text-sm text-ink-soft">
        There must always be at least one active admin, and nobody can switch off or demote their own account. Members (drivers with a PIN) are managed in{" "}
        <Link href="/admin/users" className="font-semibold text-accent underline">
          Users
        </Link>
        .
      </p>
    </section>
  );
}
