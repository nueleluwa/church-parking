import { PasswordField } from "@/components/PasswordField";
import { StatusBadge } from "@/components/StatusBadge";
import { field, primaryButton } from "@/components/ui";
import Link from "next/link";
import { listRecentMembers, memberCounts, searchMembers, searchMembersByPlate } from "@/lib/db";
import { formatLagosDate, formatVisitTime } from "@/lib/format";
import { normalisePhone, normalisePlate } from "@/lib/rules";
import { initialsOf } from "@/components/StaffChrome";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../AdminForm";
import { resetMemberPinAction } from "../admin-actions";

export const metadata = { title: "Members" };
export const dynamic = "force-dynamic";

/** AD-3: find a member and give them a new PIN. This also unlocks a locked account. */
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("admin");
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const phone = q ? normalisePhone(q) : null;
  // A name, a phone number or a car's plate
  const found = q
    ? await Promise.all([
        searchMembers({ phone, text: phone ? undefined : q }),
        phone ? Promise.resolve([]) : searchMembersByPlate(normalisePlate(q)),
      ])
    : null;
  const members = found ? [...new Map(found.flat().map((m) => [m.id, m])).values()] : await listRecentMembers(30);
  const counts = await memberCounts(members.map((m) => m.id));

  return (
    <>
      <p className="text-ink-soft">
        Find a member by phone number, name or car plate. Setting a new PIN also unlocks the account. Tell the member their new PIN
        in person, and check who they are first.
      </p>
      <form className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm lg:max-w-2xl lg:flex-row lg:items-end">
        <label className="block flex-1 font-medium">
          Phone number, name or plate
          <input name="q" defaultValue={q} autoComplete="off" className={field} />
        </label>
        <button className={`${primaryButton} lg:w-40`}>Find member</button>
      </form>

      {!q && members.length > 0 && <h2 className="px-1 text-lg font-bold">Seen most recently</h2>}
      {q && members.length === 0 && (
        <p className="rounded-card bg-card p-4 font-medium shadow-sm">No member found.</p>
      )}
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {members.map((m) => {
          const locked = m.locked_until !== null && new Date(m.locked_until) > new Date();
          return (
            <li key={m.id} className="rounded-card bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-panel font-extrabold">
                  {initialsOf(m.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{m.full_name}</p>
                  <p className="text-sm text-ink-soft">
                    {m.phone} · joined {formatLagosDate(m.created_at)}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {counts.get(m.id)?.cars ?? 0} saved {(counts.get(m.id)?.cars ?? 0) === 1 ? "car" : "cars"} · {counts.get(m.id)?.visits ?? 0}{" "}
                    {(counts.get(m.id)?.visits ?? 0) === 1 ? "visit" : "visits"}
                    {m.last_seen_at && ` · last seen ${formatVisitTime(m.last_seen_at)}`}
                  </p>
                  <Link href={`/admin/members/${m.id}`} className="mt-1 inline-block text-sm font-semibold text-accent underline">
                    View cars and visits
                  </Link>
                </div>
                <StatusBadge tone={locked ? "danger" : "success"}>{locked ? "Locked" : "Active"}</StatusBadge>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold">Set a new PIN</summary>
                <div className="mt-3">
                  <AdminForm action={resetMemberPinAction} submitLabel="Set PIN and unlock" clearOnSuccess>
                    <input type="hidden" name="memberId" value={m.id} />
                    <PasswordField label="New PIN (4 numbers)" name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" />
                  </AdminForm>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
