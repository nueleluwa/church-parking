import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTable, cell } from "@/components/AdminTable";
import { PasswordField } from "@/components/PasswordField";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { getMemberById, listMemberVehicles, memberHistory } from "@/lib/db";
import { formatLagosDate, formatVisitTime } from "@/lib/format";
import { formatPlate, memberState } from "@/lib/rules";
import { describeVehicle } from "@/lib/rules/vehicle";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../../AdminForm";
import { resetMemberPinAction } from "../../admin-actions";
import { addMemberCarAction, updateMemberAction } from "../../member-actions";
import { MemberChip } from "../../users/MemberChip";
import { MemberStatusToggle } from "../../users/MemberStatusToggle";

export const metadata = { title: "Member" };
export const dynamic = "force-dynamic";

const STATUS = {
  parked: { label: "Parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
} as const;

/** One member: who they are, their saved cars and their latest visits. An administrator can correct the name or phone, set a new PIN, save a car, and switch the account off or on. */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await getMemberById(id);
  if (!member) notFound();
  const [cars, history] = await Promise.all([listMemberVehicles(id), memberHistory(id, 40)]);
  const state = memberState(member, new Date());

  return (
    <>
      <Link href="/admin/users" className="text-sm font-semibold text-accent underline">
        All users
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="t-page">{member.full_name}</h1>
          <p className="text-ink-soft">
            {member.phone} · joined {formatLagosDate(member.created_at)}
            {member.last_seen_at && ` · last seen ${formatVisitTime(member.last_seen_at)}`}
          </p>
        </div>
        <MemberChip state={state} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <section aria-label="Saved cars" className="surface">
            <h2 className="t-card">Saved cars</h2>
            {cars.length === 0 ? (
              <p className="mt-2 text-ink-soft">No saved cars.</p>
            ) : (
              <ul className="mt-2 divide-y divide-edge/15">
                {cars.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <VehicleImage size="sm" />
                    <span className="min-w-0">
                      <Link href={`/admin/vehicles/${c.id}`} data-plate className="block whitespace-nowrap font-extrabold underline-offset-2 hover:underline">
                        {formatPlate(c.plate)}
                      </Link>
                      <span className="text-sm text-ink-soft">{describeVehicle({ make: c.make, colour: c.colour }) ?? "No details"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Save another car</summary>
              <div className="mt-3">
                <AdminForm action={addMemberCarAction} submitLabel="Save car" variant="secondary" clearOnSuccess>
                  <input type="hidden" name="memberId" value={member.id} />
                  <label className="block font-medium">
                    Plate number
                    <input name="plate" required autoComplete="off" autoCapitalize="characters" maxLength={14} className="input uppercase" />
                  </label>
                  <label className="block font-medium">
                    Make and model (optional)
                    <input name="make" autoComplete="off" className="input" />
                  </label>
                  <label className="block font-medium">
                    Colour (optional)
                    <input name="colour" autoComplete="off" className="input" />
                  </label>
                </AdminForm>
              </div>
            </details>
          </section>

          <section aria-label="Manage this member" className="surface space-y-5">
            <h2 className="t-card">Manage</h2>
            <AdminForm action={updateMemberAction} submitLabel="Save name and phone" variant="secondary">
              <input type="hidden" name="memberId" value={member.id} />
              <label className="block font-medium">
                Full name
                <input name="name" required maxLength={80} defaultValue={member.full_name} autoComplete="off" className="input" />
              </label>
              <label className="block font-medium">
                Phone number
                <input name="phone" type="tel" inputMode="tel" required defaultValue={member.phone} autoComplete="off" className="input" />
              </label>
            </AdminForm>
            <div id="pin" className="scroll-mt-24">
              <AdminForm action={resetMemberPinAction} submitLabel="Set PIN and unlock" variant="secondary" clearOnSuccess>
                <input type="hidden" name="memberId" value={member.id} />
                <PasswordField compact label="New PIN (4 numbers)" name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" />
              </AdminForm>
              <p className="mt-1 text-xs text-ink-soft">Also unlocks the account. Check who they are first, and tell them the PIN in person.</p>
            </div>
            <MemberStatusToggle id={member.id} name={member.full_name} active={member.active} />
          </section>
        </div>

        <section aria-label="Visits" className="space-y-3 lg:col-span-2">
          <h2 className="t-section">Latest visits</h2>
          {history.length === 0 ? (
            <p className="surface font-medium">No visits yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-edge/15 rounded-2xl border border-edge/15 bg-card px-4 lg:hidden">
                {history.map((h) => (
                  <li key={h.reference + h.checkedInAt} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span data-plate className="block whitespace-nowrap font-bold">
                        {formatPlate(h.plate)}
                      </span>
                      <span className="block text-sm text-ink-soft">
                        <span data-area>{h.areaName}</span> · {h.serviceName}
                      </span>
                      <span className="block text-sm text-ink-soft">{formatVisitTime(h.checkedInAt)}</span>
                    </span>
                    <StatusBadge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</StatusBadge>
                  </li>
                ))}
              </ul>
              <AdminTable label="Latest visits" columns={["Plate", "Car park", "Service", "Checked in", "Status"]}>
                {history.map((h) => (
                  <tr key={h.reference + h.checkedInAt}>
                    <td className={cell}>
                      <span data-plate className="whitespace-nowrap font-bold">
                        {formatPlate(h.plate)}
                      </span>
                    </td>
                    <td data-area className={`${cell} whitespace-nowrap`}>{h.areaName}</td>
                    <td className={cell}>{h.serviceName}</td>
                    <td className={`${cell} whitespace-nowrap`}>{formatVisitTime(h.checkedInAt)}</td>
                    <td className={cell}>
                      <StatusBadge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            </>
          )}
        </section>
      </div>
    </>
  );
}
