import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronRight } from "@/components/icons";
import { VehicleImage } from "@/components/VehicleImage";
import { getVehicleDetail } from "@/lib/db";
import { formatPlate, lagosParts, statusLabel, typeLabel } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { StatusChip } from "../StatusChip";
import { StatusToggle } from "../StatusToggle";

export const metadata = { title: "Vehicle" };
export const dynamic = "force-dynamic";

const HISTORY_WORDS: Record<string, string> = {
  vehicle_added: "Vehicle added",
  vehicle_updated: "Details changed",
  vehicle_owner_changed: "Owner changed",
  vehicle_deactivated: "Deactivated",
  vehicle_reactivated: "Reactivated",
};

const when = (iso: string) => {
  const p = lagosParts(iso);
  return `${p.date}, ${p.time}`;
};

/**
 * One vehicle in full (administrators only): its details, owner, status, the visit that is open now, its recent visits and
 * the changes made to it. The linked member's name is shown; a phone number never is.
 */
export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("admin");
  const { id } = await params;
  const v = await getVehicleDetail(id);
  if (!v) notFound();

  const facts: [string, React.ReactNode][] = [
    ["Vehicle type", typeLabel(v.type)],
    ["Make and model", v.make ?? "Not recorded"],
    ["Colour", v.colour ?? "Not recorded"],
    ["Ownership", v.ownerId ? "Member" : "Guest"],
    [
      "Linked member",
      v.ownerId ? (
        <Link href={`/admin/members/${v.ownerId}`} className="font-semibold underline">
          {v.ownerName ?? "Member"}
        </Link>
      ) : (
        "Guest vehicle (not linked to a member)"
      ),
    ],
    ["Status", <StatusChip key="s" active={v.active} />],
    ["Date registered", v.createdAt ? lagosParts(v.createdAt).date : "Not recorded"],
    ["Total visits", String(v.visitCount)],
  ];

  return (
    <>
      <Link href="/admin/vehicles" className="text-sm font-semibold text-accent underline">
        All vehicles
      </Link>

      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-edge/15 bg-card p-4">
        <VehicleImage size="lg" />
        <div className="min-w-0 flex-1">
          <h1 data-plate className="text-3xl font-extrabold">
            {formatPlate(v.plate)}
          </h1>
          <p className="mt-1">
            <StatusChip active={v.active} />
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/admin/vehicles?edit=${v.id}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-white hover:bg-accent-dark">
            Edit vehicle
          </Link>
          <StatusToggle id={v.id} active={v.active} hasOpenVisit={Boolean(v.openVisit)} />
        </div>
      </header>

      <section aria-label="Details" className="rounded-2xl border border-edge/15 bg-card p-4">
        <h2 className="mb-2 text-lg font-extrabold">Details</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([k, val]) => (
            <div key={k}>
              <dt className="text-sm text-ink-soft">{k}</dt>
              <dd className="font-medium">{val}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Current visit" className="rounded-2xl border border-edge/15 bg-card p-4">
        <h2 className="mb-2 text-lg font-extrabold">Current visit</h2>
        {v.openVisit ? (
          <Link href={`/admin/visits/${v.openVisit.id}`} className="flex items-center gap-3 rounded-xl border border-edge/10 p-3 hover:bg-page">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Checked in · {v.openVisit.areaName}</span>
              <span className="block text-sm text-ink-soft">
                {v.openVisit.serviceName} · {when(v.openVisit.checkedInAt)} · {v.openVisit.who}
              </span>
            </span>
            <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
          </Link>
        ) : (
          <p className="text-ink-soft">This vehicle has no open visit.</p>
        )}
      </section>

      <section aria-label="Visit history" className="rounded-2xl border border-edge/15 bg-card p-4">
        <h2 className="mb-2 text-lg font-extrabold">Visit history</h2>
        {v.visits.length === 0 ? (
          <p className="text-ink-soft">No visits yet.</p>
        ) : (
          <ul className="grid gap-2">
            {v.visits.map((x) => (
              <li key={x.id}>
                <Link href={`/admin/visits/${x.id}`} className="flex items-center gap-3 rounded-xl border border-edge/10 p-3 hover:bg-page">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {when(x.checkedInAt)} · {statusLabel(x.status)}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      {x.areaName} · {x.serviceName} · {x.who}
                      {x.releasedAt && ` · released ${lagosParts(x.releasedAt).time}`}
                    </span>
                  </span>
                  <IconChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {v.visitCount > v.visits.length && (
          <p className="mt-2 text-sm text-ink-soft">
            Showing the latest {v.visits.length} of {v.visitCount} visits.
          </p>
        )}
      </section>

      <section aria-label="Changes to this vehicle" className="rounded-2xl border border-edge/15 bg-card p-4">
        <h2 className="mb-2 text-lg font-extrabold">Changes to this vehicle</h2>
        {v.history.length === 0 ? (
          <p className="text-ink-soft">No changes have been recorded since the register began keeping them.</p>
        ) : (
          <ul className="divide-y divide-edge/10">
            {v.history.map((e, i) => (
              <li key={i} className="py-2">
                <p className="font-semibold">{HISTORY_WORDS[e.what] ?? e.what.replace(/_/g, " ")}</p>
                <p className="text-sm text-ink-soft">
                  {when(e.at)}
                  {e.by && ` · ${e.by}`}
                  {e.detail && ` · ${e.detail}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
