import Link from "next/link";
import { AdminTable, cell } from "@/components/AdminTable";
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

const FILTERS = [
  { value: "", label: "All cars" },
  { value: "parked", label: "Parked" },
  { value: "released", label: "Released" },
  { value: "missed", label: "Missed" },
] as const;

/** Every car the church has seen, newest first. Search by plate, or show only one kind of last visit. Owners' names and numbers are never listed. */
export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const q = normalisePlate((sp.q ?? "").slice(0, 20));
  const status = FILTERS.some((f) => f.value && f.value === sp.status) ? (sp.status as keyof typeof STATUS) : "";
  // A filter looks further back, so a short list of matches is not just the latest few cars
  const all = await listVehicles(q, status ? 150 : 60);
  const vehicles = status ? all.filter((v) => v.lastStatus === status) : all;
  const href = (s: string) => `/admin/vehicles?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { status: s } : {}) }).toString()}`;

  return (
    <>
      <p className="text-ink-soft">
        {q ? "Cars matching your search." : "The cars seen most recently."} Open a car to see its latest visit. Names and phone
        numbers are not shown here.
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-sm lg:w-full lg:max-w-md lg:flex-row lg:items-end">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="block flex-1 font-medium">
            Plate number
            <input name="q" defaultValue={q} autoComplete="off" autoCapitalize="characters" className={`${field} uppercase`} />
          </label>
          <button className={`${primaryButton} lg:w-32`}>Search</button>
        </form>

        <nav aria-label="Show cars by their last visit" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href(f.value)}
              aria-current={f.value === status ? "true" : undefined}
              className={`rounded-full border-2 px-4 py-2 font-semibold ${
                f.value === status ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {vehicles.length === 0 ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">
          {q ? "No car found with that plate." : status ? `No ${STATUS[status].label.toLowerCase()} cars in the latest records.` : "No cars yet."}
        </p>
      ) : (
        <>
          <ul className="grid items-start gap-3 lg:hidden">
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

          <AdminTable label="Cars" columns={["Plate", "Car", "Type", "Visits", "Last seen", "Car park", "Last visit"]}>
            {vehicles.map((v) => (
              <tr key={v.id} className="hover:bg-page">
                <td className={cell}>
                  {v.lastVisitId ? (
                    <Link
                      href={`/admin/visits/${v.lastVisitId}`}
                      aria-label={`Latest visit of ${formatPlate(v.plate)}`}
                      data-plate
                      className="whitespace-nowrap text-lg font-extrabold underline-offset-2 hover:underline"
                    >
                      {formatPlate(v.plate)}
                    </Link>
                  ) : (
                    <span data-plate className="whitespace-nowrap text-lg font-extrabold">
                      {formatPlate(v.plate)}
                    </span>
                  )}
                </td>
                <td className={`${cell} text-ink-soft`}>{describeVehicle({ make: v.make, colour: v.colour }) ?? "No details"}</td>
                <td className={cell}>{v.isMember ? "Member" : "Guest"}</td>
                <td className={cell}>{v.visits}</td>
                <td className={`${cell} whitespace-nowrap`}>{v.lastSeen ? formatVisitTime(v.lastSeen) : "-"}</td>
                <td data-area className={`${cell} whitespace-nowrap`}>{v.lastAreaName ?? "-"}</td>
                <td className={cell}>
                  {v.lastStatus ? <StatusBadge tone={STATUS[v.lastStatus].tone}>{STATUS[v.lastStatus].label}</StatusBadge> : "-"}
                </td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}
    </>
  );
}
