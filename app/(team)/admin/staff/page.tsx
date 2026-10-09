import { StatusBadge } from "@/components/StatusBadge";
import { field } from "@/components/ui";
import { listStaff } from "@/lib/db";
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
  const staff = await listStaff();
  return (
    <>
      <p className="text-ink-soft">
        Everyone on the team has their own account. Switch an account off when someone leaves: they are signed out at
        once.
      </p>
      <ul className="space-y-3">
        {staff.map((s) => (
          <li key={s.id} className="rounded-card bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">
                  {s.full_name}
                  {s.id === me.id && <span className="font-normal text-ink-soft"> (you)</span>}
                </p>
                <p className="text-sm text-ink-soft">
                  {roleLabel(s.role)} · {s.phone}
                </p>
              </div>
              <StatusBadge tone={s.active ? "success" : "neutral"}>{s.active ? "Active" : "Off"}</StatusBadge>
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
                  <label className="block font-medium">
                    New password (at least 10 characters)
                    <input name="password" type="text" minLength={10} autoComplete="off" className={field} />
                  </label>
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

      <section className="rounded-card bg-card p-4 shadow-sm">
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
            <label className="block font-medium">
              Password (at least 10 characters)
              <input name="password" type="text" required minLength={10} autoComplete="off" className={field} />
            </label>
          </AdminForm>
        </div>
      </section>
    </>
  );
}
