import Link from "next/link";
import { IconCheck, IconLock, IconPlus, IconSearch, IconUser, IconUsers } from "@/components/icons";
import { PageNumbers } from "@/components/Pager";
import { PasswordField } from "@/components/PasswordField";
import { field } from "@/components/ui";
import { listStaff, recentActivityByStaff, staffLastActive, type StaffRecord } from "@/lib/db";
import { formatVisitTime } from "@/lib/format";
import { MEMBER_PAGE_SIZES, initials, lagosParts, pageNumbers, parseMemberPageSize, parseMemberStatus, registerRange } from "@/lib/rules";
import { AdminForm } from "../AdminForm";
import { createStaffAction, manageStaffAction } from "../admin-actions";
import { Panel } from "./Panel";
import { Summary } from "./Summary";

export type StaffSearch = { q?: string; role?: string; status?: string; size?: string; page?: string; add?: string; manage?: string };

const ROLES = [
  { value: "attendant", label: "Attendant" },
  { value: "coordinator", label: "Coordinator" },
  { value: "admin", label: "Admin" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
const inputClass = `${field} !mt-1 !py-2.5 !text-base`;

function StaffChip({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-edge/70 bg-white px-2.5 py-0.5 text-sm font-semibold text-ink">
      <IconCheck aria-hidden="true" className="h-3.5 w-3.5" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-edge/15 bg-panel px-2.5 py-0.5 text-sm font-semibold text-ink-soft">
      <IconLock aria-hidden="true" className="h-3.5 w-3.5" />
      Off
    </span>
  );
}

/**
 * The Staff accounts tab. Everything the old Staff Accounts screen did is here: add an account, change a name or phone number,
 * change the role, set a new password, switch an account off or on, and see recent activity. The rules are unchanged and
 * checked on the server (nobody can lock the church out, and only an admin can do any of it). Staff sign in with their phone
 * number, so there is no separate username or email.
 */
export async function StaffTab({ sp, meId }: { sp: StaffSearch; meId: string }) {
  const q = (sp.q ?? "").trim().slice(0, 40).toLowerCase();
  const role = ROLES.some((r) => r.value === sp.role) ? sp.role! : "";
  const status = parseMemberStatus(sp.status);
  const size = parseMemberPageSize(sp.size);
  const [all, lastActive, recent] = await Promise.all([listStaff(), staffLastActive(), recentActivityByStaff(4)]);

  // A name, or digits of the phone number (with or without the leading 0)
  const digits = q.replace(/\D/g, "").replace(/^0/, "");
  const matches = (s: StaffRecord) =>
    (!role || s.role === role) &&
    (!status || s.active === (status === "active")) &&
    (!q || s.full_name.toLowerCase().includes(q) || (digits.length >= 3 && s.phone.replace(/\D/g, "").includes(digits)));
  const found = all.filter(matches);
  const total = found.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const rows = found.slice((page - 1) * size, page * size);
  const range = registerRange(page, size, rows.length, total);
  const activeCount = (r: string) => all.filter((s) => s.active && s.role === r).length;

  const scope = (over: Partial<StaffSearch> = {}) => {
    const merged: Record<string, string> = {
      tab: "staff",
      ...(q ? { q } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(size !== 20 ? { size: String(size) } : {}),
      ...over,
    } as Record<string, string>;
    return `/admin/users?${new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString()}`;
  };
  const keepPage = page > 1 ? String(page) : "";
  const filtersOn = Boolean(q || role || status);
  const managing = sp.manage ? all.find((s) => s.id === sp.manage) : undefined;

  return (
    <>
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary id="s-admins" label="Admins" value={activeCount("admin")} note="Active accounts" href="/admin/users?tab=staff&role=admin&status=active" icon={<IconUser className="h-5 w-5" />} />
        <Summary id="s-coordinators" label="Coordinators" value={activeCount("coordinator")} note="Active accounts" href="/admin/users?tab=staff&role=coordinator&status=active" icon={<IconUsers className="h-5 w-5" />} />
        <Summary id="s-attendants" label="Attendants" value={activeCount("attendant")} note="Active accounts" href="/admin/users?tab=staff&role=attendant&status=active" icon={<IconUsers className="h-5 w-5" />} />
        <Summary id="s-off" label="Switched off" value={all.filter((s) => !s.active).length} note="Cannot sign in" href="/admin/users?tab=staff&status=inactive" icon={<IconLock className="h-5 w-5" />} />
      </section>

      <section aria-label="Staff accounts" className="rounded-2xl border border-edge/15 bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">
              Staff accounts (<span data-testid="s-count">{total}</span>)
            </h2>
            <p className="text-sm text-ink-soft">Everyone on the team has their own account. Switch an account off when someone leaves: they are signed out at once.</p>
          </div>
          <Link href={scope({ add: "1", page: "" })} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark">
            <IconPlus aria-hidden="true" className="h-5 w-5" />
            Add staff account
          </Link>
        </div>

        <form aria-label="Filters" className="mb-4 space-y-3">
          <input type="hidden" name="tab" value="staff" />
          {size !== 20 && <input type="hidden" name="size" value={size} />}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(0,2fr)_1fr_1fr]">
            <label className="col-span-2 block text-sm font-medium xl:col-span-1">
              Search by name or phone number
              <span className="relative mt-1 block">
                <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
                <input name="q" defaultValue={q} autoComplete="off" placeholder="Search by name or phone number…" className={`${field} !mt-0 !py-2.5 !pl-11 !text-base`} />
              </span>
            </label>
            <label className="block text-sm font-medium">
              Role
              <select name="role" defaultValue={role} className={inputClass}>
                <option value="">All roles</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Status
              <select name="status" defaultValue={status ?? ""} className={inputClass}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Switched off</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Link href="/admin/users?tab=staff" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-edge/70 bg-white px-6 font-semibold hover:bg-page sm:flex-none">
              Reset
            </Link>
            <button className="min-h-12 flex-1 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark sm:flex-none">Apply filters</button>
          </div>
        </form>

        {rows.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">
            {filtersOn ? "No one matches. " : "No staff accounts yet. "}
            {filtersOn && (
              <Link href="/admin/users?tab=staff" className="font-semibold text-accent underline">
                Reset filters
              </Link>
            )}
          </p>
        ) : (
          <>
            <ul className="grid gap-3 xl:hidden">
              {rows.map((s) => (
                <li key={s.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-edge/10 p-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-sm font-extrabold">
                    {initials(s.full_name)}
                  </span>
                  <Link href={scope({ manage: s.id, page: keepPage })} aria-label={`Manage ${s.full_name}`} className="min-w-0 flex-1 hover:opacity-80">
                    <span className="block truncate text-lg font-bold">
                      {s.full_name}
                      {s.id === meId && <span className="font-normal text-ink-soft"> (you)</span>}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      {roleLabel(s.role)} · {s.phone}
                    </span>
                    <span className="block text-sm text-ink-soft">{lastActive.has(s.id) ? `Last activity ${formatVisitTime(lastActive.get(s.id)!)}` : "No recorded activity yet"}</span>
                    <span className="mt-1 block">
                      <StaffChip active={s.active} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[52rem] text-left">
                <caption className="sr-only">Staff accounts</caption>
                <thead className="border-b border-edge/20 text-sm text-ink-soft">
                  <tr>
                    {["Name", "Role", "Phone (sign-in)", "Last activity", "Status", "Date created", "Actions"].map((c) => (
                      <th key={c} scope="col" className="whitespace-nowrap px-2.5 py-3 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/15">
                  {rows.map((s) => (
                    <tr key={s.id} className="hover:bg-page">
                      <td className="px-2.5 py-3">
                        <span className="flex items-center gap-3">
                          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-sm font-extrabold">
                            {initials(s.full_name)}
                          </span>
                          <span className="font-bold">
                            {s.full_name}
                            {s.id === meId && <span className="font-normal text-ink-soft"> (you)</span>}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3">{roleLabel(s.role)}</td>
                      <td className="whitespace-nowrap px-2.5 py-3">{s.phone}</td>
                      <td className="px-2.5 py-3 text-ink-soft">{lastActive.has(s.id) ? formatVisitTime(lastActive.get(s.id)!) : "None yet"}</td>
                      <td className="px-2.5 py-3">
                        <StaffChip active={s.active} />
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3">{lagosParts(s.created_at).date}</td>
                      <td className="px-2.5 py-3">
                        <Link href={scope({ manage: s.id, page: keepPage })} aria-label={`Manage ${s.full_name}`} className="inline-flex min-h-10 items-center rounded-lg border border-edge/30 bg-white px-4 font-semibold hover:bg-page">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft" data-testid="s-showing">
            Showing {range.first}–{range.last} of {total} {total === 1 ? "account" : "accounts"}
          </p>
          <PageNumbers page={page} pages={pages} numbers={pageNumbers(page, pages)} href={(p) => scope({ page: String(p) })} />
          <nav aria-label="Rows per page" className="flex items-center gap-1.5 text-sm">
            <span className="text-ink-soft">Rows per page</span>
            {MEMBER_PAGE_SIZES.map((n) =>
              n === size ? (
                <span key={n} aria-current="true" className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-accent bg-accent px-2 font-semibold text-white">
                  {n}
                </span>
              ) : (
                <Link key={n} href={scope({ size: n === 20 ? "" : String(n), page: "" })} className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-edge/20 bg-white px-2 font-semibold hover:bg-page">
                  {n}
                </Link>
              ),
            )}
          </nav>
        </div>
      </section>

      {sp.add && (
        <Panel title="Add staff account" closeHref={scope({ page: keepPage })}>
          <div className="flex-1 overflow-y-auto px-5 py-4">
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
        </Panel>
      )}

      {managing && (
        <Panel title={`Manage ${managing.full_name}`} closeHref={scope({ page: keepPage })}>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <StaffChip active={managing.active} />
              {roleLabel(managing.role)}
              {managing.id === meId && " · this is you"}
            </p>
            <AdminForm action={manageStaffAction} submitLabel="Save name and phone" variant="secondary">
              <input type="hidden" name="staffId" value={managing.id} />
              <input type="hidden" name="intent" value="edit_details" />
              <label className="block font-medium">
                Full name
                <input name="name" required maxLength={80} defaultValue={managing.full_name} autoComplete="off" className={field} />
              </label>
              <label className="block font-medium">
                Phone number
                <input name="phone" type="tel" inputMode="tel" required defaultValue={managing.phone} autoComplete="off" className={field} />
              </label>
            </AdminForm>

            <AdminForm action={manageStaffAction} submitLabel="Save role" variant="secondary">
              <input type="hidden" name="staffId" value={managing.id} />
              <input type="hidden" name="intent" value="set_role" />
              <label className="block font-medium">
                Role
                <select name="role" defaultValue={managing.role} className={field}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </AdminForm>

            <AdminForm action={manageStaffAction} submitLabel="Set new password" variant="secondary">
              <input type="hidden" name="staffId" value={managing.id} />
              <input type="hidden" name="intent" value="reset_password" />
              <PasswordField label="New password (at least 10 characters)" name="password" minLength={10} autoComplete="new-password" />
            </AdminForm>

            <AdminForm action={manageStaffAction} submitLabel={managing.active ? "Switch account off" : "Switch account on"} variant="secondary">
              <input type="hidden" name="staffId" value={managing.id} />
              <input type="hidden" name="intent" value={managing.active ? "deactivate" : "activate"} />
            </AdminForm>

            <section aria-label={`Recent activity of ${managing.full_name}`}>
              <h3 className="font-semibold">Recent activity</h3>
              {(recent.get(managing.id) ?? []).length === 0 ? (
                <p className="text-sm text-ink-soft">Nothing recorded yet.</p>
              ) : (
                <ul className="mt-1 divide-y divide-edge/15 text-sm">
                  {recent.get(managing.id)!.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="flex justify-between gap-3 py-1">
                      <span>{e.what}</span>
                      <span className="shrink-0 text-ink-soft">{formatVisitTime(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Panel>
      )}
    </>
  );
}
