import Link from "next/link";
import { PasswordField } from "@/components/PasswordField";
import { StatusBadge } from "@/components/StatusBadge";
import { field } from "@/components/ui";
import { listStaff, recentActivityByStaff, staffLastActive } from "@/lib/db";
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

const COLS = "lg:grid-cols-[2fr_1fr_1.2fr_1.6fr_auto]";

/** AD-3: staff accounts. Everyone has their own account, so every action is traceable. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const me = await requireStaff("admin");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 40).toLowerCase();
  const role = ROLES.some((r) => r.value === sp.role) ? sp.role! : "";
  const [all, lastActive, recent] = await Promise.all([listStaff(), staffLastActive(), recentActivityByStaff(4)]);

  // A name, or digits of the phone number (with or without the leading 0)
  const digits = q.replace(/D/g, "").replace(/^0/, "");
  const matches = (s: (typeof all)[number]) =>
    (!role || s.role === role) && (!q || s.full_name.toLowerCase().includes(q) || (digits.length >= 3 && s.phone.replace(/D/g, "").includes(digits)));
  const staff = all.filter((s) => s.active && matches(s));
  const off = all.filter((s) => !s.active && matches(s));
  const activeCount = (r: string) => all.filter((s) => s.active && s.role === r).length;
  const href = (next: { role?: string }) => {
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...((next.role ?? role) ? { role: next.role ?? role } : {}) }).toString();
    return `/admin/staff${qs ? `?${qs}` : ""}`;
  };
  const pill = (on: boolean) =>
    `rounded-full border-2 px-4 py-2 font-semibold ${on ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"}`;

  return (
    <>
      <p className="text-ink-soft">
        Everyone on the team has their own account. Switch an account off when someone leaves: they are signed out at
        once.
      </p>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Admins", value: activeCount("admin") },
          { label: "Coordinators", value: activeCount("coordinator") },
          { label: "Attendants", value: activeCount("attendant") },
          { label: "Switched off", value: all.filter((s) => !s.active).length },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-sm font-medium text-ink-soft">{c.label}</p>
            <p className="text-3xl font-extrabold">{c.value}</p>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm sm:flex-row sm:items-end">
            {role && <input type="hidden" name="role" value={role} />}
            <label className="block flex-1 font-medium">
              Find someone by name or phone
              <input name="q" defaultValue={q} autoComplete="off" className={field} />
            </label>
            <button className="min-h-12 rounded-full bg-night px-6 font-semibold text-white">Search</button>
          </form>
          <nav aria-label="Role" className="flex flex-wrap gap-2">
            <Link href={href({ role: "" })} aria-current={!role ? "true" : undefined} className={pill(!role)}>
              Everyone
            </Link>
            {ROLES.map((r) => (
              <Link key={r.value} href={href({ role: r.value })} aria-current={r.value === role ? "true" : undefined} className={pill(r.value === role)}>
                {r.label}s
              </Link>
            ))}
          </nav>

          {staff.length === 0 && off.length === 0 && <p className="rounded-card bg-card p-4 font-medium shadow-sm">No one matches.</p>}

          {staff.length > 0 && (
            <div aria-hidden="true" className={`hidden px-4 text-sm font-semibold text-ink-soft lg:grid ${COLS} lg:gap-3`}>
              <span>Name</span>
              <span>Role</span>
              <span>Phone</span>
              <span>Last activity</span>
              <span className="w-16 text-right">Status</span>
            </div>
          )}
          <ul className="grid items-start gap-3">
            {staff.map((s) => (
              <li key={s.id} className="relative rounded-card bg-card p-4 shadow-sm">
                <div className={`grid gap-0.5 pr-24 ${COLS} lg:items-center lg:gap-3 lg:pr-0`}>
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
                  <div className="mt-3 grid items-start gap-5 lg:grid-cols-2">
                    <div className="space-y-5">
                      <AdminForm action={manageStaffAction} submitLabel="Save name and phone" variant="secondary">
                        <input type="hidden" name="staffId" value={s.id} />
                        <input type="hidden" name="intent" value="edit_details" />
                        <label className="block font-medium">
                          Full name
                          <input name="name" required maxLength={80} defaultValue={s.full_name} autoComplete="off" className={field} />
                        </label>
                        <label className="block font-medium">
                          Phone number
                          <input name="phone" type="tel" inputMode="tel" required defaultValue={s.phone} autoComplete="off" className={field} />
                        </label>
                      </AdminForm>

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
                    </div>

                    <div className="space-y-5">
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

                      <section aria-label={`Recent activity of ${s.full_name}`}>
                        <h3 className="font-semibold">Recent activity</h3>
                        {(recent.get(s.id) ?? []).length === 0 ? (
                          <p className="text-sm text-ink-soft">Nothing recorded yet.</p>
                        ) : (
                          <ul className="mt-1 divide-y divide-edge/15 text-sm">
                            {recent.get(s.id)!.map((e, i) => (
                              <li key={`${e.at}-${i}`} className="flex justify-between gap-3 py-1">
                                <span>{e.what}</span>
                                <span className="shrink-0 text-ink-soft">{formatVisitTime(e.at)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>

          {off.length > 0 && (
            <details className="rounded-card bg-card p-4 shadow-sm" open={Boolean(q || role)}>
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
