import { PasswordField } from "@/components/PasswordField";
import { StatusBadge } from "@/components/StatusBadge";
import { field } from "@/components/ui";
import { listStaff, staffLastActive } from "@/lib/db";
import { formatVisitTime } from "@/lib/format";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../AdminForm";
import { createStaffAction, manageStaffAction } from "../admin-actions";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const ROLES = [
  { value: "attendant", label: "Attendant" },
  { value: "coordinator", label: "Coordinator" },
  { value: "admin", label: "Admin" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

/** AD-3: staff accounts. Everyone has their own account, so every action is traceable. */
export default async function StaffPage() {
  const me = await requireStaff("admin");
  const [all, lastActive] = await Promise.all([listStaff(), staffLastActive()]);
  const staff = all.filter((s) => s.active);
  const off = all.filter((s) => !s.active);
  return (
    <>
      <p className="text-ink-soft">
        Everyone on the team has their own account. Switch an account off when someone leaves: they are signed out at
        once.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
      <div aria-hidden="true" className="hidden px-4 text-sm font-semibold text-ink-soft lg:grid lg:grid-cols-[2fr_1fr_1.2fr_1.6fr_auto] lg:gap-3">
        <span>Name</span>
        <span>Role</span>
        <span>Phone</span>
        <span>Last activity</span>
        <span className="w-16 text-right">Status</span>
      </div>
      <ul className="grid items-start gap-3">
        {staff.map((s) => (
          <li key={s.id} className="relative rounded-card bg-card p-4 shadow-sm">
            <div className="grid gap-0.5 pr-24 lg:grid-cols-[2fr_1fr_1.2fr_1.6fr_auto] lg:items-center lg:gap-3 lg:pr-0">
              <p className="truncate text-lg font-bold">
                {s.full_name}
                {s.id === me.id && <span className="font-normal text-ink-soft"> (you)</span>}
              </p>
              <p className="text-sm text-ink-soft lg:text-base lg:text-ink">
                {roleLabel(s.role)}
                <span className="lg:hidden"> · {s.phone}</span>
              </p>
              <p className="hidden lg:block">{s.phone}</p>
              <p className="text-sm text-ink-soft lg:text-base lg:text-ink">
                {lastActive.has(s.id) ? `Last activity ${formatVisitTime(lastActive.get(s.id)!)}` : "No recorded activity yet"}
              </p>
              <span className="absolute right-4 top-4 lg:static lg:w-16 lg:text-right">
                <StatusBadge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Off"}</StatusBadge>
              </span>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Manage {s.full_name}</summary>
              <div className="mt-3 space-y-5">
                <AdminForm action={manageStaffAction} submitLabel="Save role" variant="secondary">
                  <input type="hidden" name="staffId" value={s.id} />
                  <input type="hidden" name="intent" value="set_role" />
                  <label className="block font-medium">
                    Role
                    <select name="role" defaultValue={s.role} className={field}>
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </AdminForm>

                <AdminForm action={manageStaffAction} submitLabel="Set new password" variant="secondary">
                  <input type="hidden" name="staffId" value={s.id} />
                  <input type="hidden" name="intent" value="reset_password" />
                  <PasswordField label="New password (at least 10 characters)" name="password" minLength={10} autoComplete="new-password" />
                </AdminForm>

                <AdminForm
                  action={manageStaffAction}
                  submitLabel={s.active ? "Switch account off" : "Switch account on"}
                  variant="secondary"
                >
                  <input type="hidden" name="staffId" value={s.id} />
                  <input type="hidden" name="intent" value={s.active ? "deactivate" : "activate"} />
                </AdminForm>
              </div>
            </details>
          </li>
        ))}
      </ul>

      {off.length > 0 && (
        <details className="rounded-card bg-card p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold">Switched-off accounts ({off.length})</summary>
          <ul className="mt-3 divide-y divide-edge/15">
            {off.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.full_name}</p>
                  <p className="text-sm text-ink-soft">
                    {roleLabel(s.role)} · {s.phone}
                  </p>
                </div>
                <div className="w-44 shrink-0">
                  <AdminForm action={manageStaffAction} submitLabel="Switch on" variant="secondary">
                    <input type="hidden" name="staffId" value={s.id} />
                    <input type="hidden" name="intent" value="activate" />
                  </AdminForm>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      </div>

      <section className="rounded-card bg-card p-4 shadow-sm lg:sticky lg:top-4">
        <h2 className="text-lg font-bold">Add a team member</h2>
        <div className="mt-3">
          <AdminForm action={createStaffAction} submitLabel="Create account" clearOnSuccess>
            <label className="block font-medium">
              Full name
              <input name="name" required maxLength={80} autoComplete="off" className={field} />
            </label>
            <label className="block font-medium">
              Phone number
              <input name="phone" type="tel" inputMode="tel" required autoComplete="off" className={field} />
            </label>
            <label className="block font-medium">
              Role
              <select name="role" defaultValue="attendant" className={field}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <PasswordField label="Password (at least 10 characters)" name="password" required minLength={10} autoComplete="new-password" />
          </AdminForm>
        </div>
      </section>
      </div>
    </>
  );
}
