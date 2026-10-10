import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTable, cell } from "@/components/AdminTable";
import { StatusBadge } from "@/components/StatusBadge";
import { getMemberById, listMemberVehicles, memberHistory } from "@/lib/db";
import { formatLagosDate, formatVisitTime } from "@/lib/format";
import { formatPlate } from "@/lib/rules";
import { describeVehicle } from "@/lib/rules/vehicle";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Member" };
export const dynamic = "force-dynamic";

const STATUS = {
  parked: { label: "Parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
} as const;

/** One member: who they are, their saved cars and their latest visits. The PIN is reset from the member list. */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const member = await getMemberById(id);
  if (!member) notFound();
  const [cars, history] = await Promise.all([listMemberVehicles(id), memberHistory(id, 40)]);
  const locked = member.locked_until !== null && new Date(member.locked_until) > new Date();

  return (
    <>
      <Link href="/admin/members" className="text-sm font-semibold text-accent underline">
        All members
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{member.full_name}</h1>
          <p className="text-ink-soft">
            {member.phone} · joined {formatLagosDate(member.created_at)}
            {member.last_seen_at && ` · last seen ${formatVisitTime(member.last_seen_at)}`}
          </p>
        </div>
        <StatusBadge tone={locked ? "danger" : "success"}>{locked ? "Locked" : "Active"}</StatusBadge>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section aria-label="Saved cars" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Saved cars</h2>
          {cars.length === 0 ? (
            <p className="mt-2 text-ink-soft">No saved cars.</p>
          ) : (
            <ul className="mt-2 divide-y divide-edge/15">
              {cars.map((c) => (
                <li key={c.id} className="py-2">
                  <span data-plate className="block whitespace-nowrap font-extrabold">
                    {formatPlate(c.plate)}
                  </span>
                  <span className="text-sm text-ink-soft">{describeVehicle({ make: c.make, colour: c.colour }) ?? "No details"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Visits" className="space-y-3 lg:col-span-2">
          <h2 className="px-1 text-lg font-bold">Latest visits</h2>
          {history.length === 0 ? (
            <p className="rounded-card bg-card p-4 font-medium shadow-sm">No visits yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-edge/15 rounded-card bg-card px-4 shadow-sm lg:hidden">
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
