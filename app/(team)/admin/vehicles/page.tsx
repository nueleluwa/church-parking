import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { field, primaryButton } from "@/components/ui";
import { listVehicles } from "@/lib/db";
import { formatVisitTime } from "@/lib/format";
import { formatPlate, normalisePlate } from "@/lib/rules";
import { describeVehicle } from "@/lib/rules/vehicle";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Vehicles" };
export const dynamic = "force-dynamic";

const STATUS = {
  parked: { label: "Parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
} as const;

/** Every car the church has seen, newest first. Search by plate. Owners' names and numbers are never listed. */
export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("admin");
  const q = normalisePlate(((await searchParams).q ?? "").slice(0, 20));
  const vehicles = await listVehicles(q);

  return (
    <>
      <p className="text-ink-soft">
        {q ? "Cars matching your search." : "The cars seen most recently."} Tap a car to see its latest visit. Names and phone
        numbers are not shown here.
      </p>
      <form className="space-y-3 rounded-card bg-card p-4 shadow-sm lg:max-w-xl">
        <label className="block font-medium">
          Plate number
          <input name="q" defaultValue={q} autoComplete="off" autoCapitalize="characters" className={`${field} uppercase`} />
        </label>
        <button className={primaryButton}>Search</button>
      </form>

      {vehicles.length === 0 ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">{q ? "No car found with that plate." : "No cars yet."}</p>
      ) : (
        <ul className="grid items-start gap-3 lg:grid-cols-2">
          {vehicles.map((v) => {
            const details = describeVehicle({ make: v.make, colour: v.colour });
            const body = (
              <>
                <VehicleImage size="sm" />
                <span className="min-w-0 flex-1">
                  <span data-plate className="block whitespace-nowrap text-lg font-extrabold">
                    {formatPlate(v.plate)}
                  </span>
                  <span className="block truncate text-sm text-ink-soft">{details ?? "No details"}</span>
                  <span className="block text-sm text-ink-soft">
                    {v.isMember ? "Member" : "Guest"} · {v.visits} {v.visits === 1 ? "visit" : "visits"}
                    {v.lastSeen && ` · last ${formatVisitTime(v.lastSeen)}`}
                  </span>
                </span>
                {v.lastStatus && (
                  <StatusBadge tone={STATUS[v.lastStatus].tone} className="shrink-0">
                    {STATUS[v.lastStatus].label}
                  </StatusBadge>
                )}
                {v.lastVisitId && <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />}
              </>
            );
            const row = "flex items-center gap-3 rounded-card bg-card p-3 shadow-sm";
            return (
              <li key={v.id}>
                {v.lastVisitId ? (
                  <Link href={`/admin/visits/${v.lastVisitId}`} aria-label={`Latest visit of ${formatPlate(v.plate)}`} className={`${row} hover:bg-page`}>
                    {body}
                  </Link>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
