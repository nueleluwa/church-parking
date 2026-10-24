import Link from "next/link";
import { IconCar, IconLock, IconPlus, IconSearch, IconUser, IconUsers } from "@/components/icons";
import { EmptyState } from "@/components/ds/EmptyState";
import { MetricCard, MetricRow } from "@/components/ds/MetricCard";
import { PageHeader } from "@/components/ds/PageHeader";
import { VehicleIdentity } from "@/components/ds/VehicleIdentity";
import { PageNumbers } from "@/components/Pager";
import { getVehicleDetail, registerCounts, searchRegister, type RegisterRow } from "@/lib/db";
import {
  REGISTER_PAGE_SIZES,
  VEHICLE_TYPES,
  describeVehicle,
  formatPlate,
  lagosParts,
  normalisePlate,
  pageNumbers,
  parseOwnership,
  parsePageSize,
  parseVehicleStatus,
  parseVehicleType,
  registerRange,
  searchPlate,
  typeLabel,
} from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { Panel } from "../Panel";
import { StatusChip } from "./StatusChip";
import { VehicleForm } from "./VehicleForm";
import { BulkRegister } from "./BulkRegister";

export const metadata = { title: "Vehicles" };
export const dynamic = "force-dynamic";

type Search = { q?: string; type?: string; owner?: string; status?: string; size?: string; page?: string; add?: string; edit?: string; notice?: string; plate?: string };

const inputClass = "input";

const registered = (v: RegisterRow) => (v.createdAt ? lagosParts(v.createdAt).date : "Not recorded");

/**
 * The register of every vehicle the church knows: member vehicles (saved by a member), guest vehicles (everything else),
 * active and inactive. A row is a vehicle record, not a visit. Administrators only: it shows the name of the linked member
 * (never a phone number). Adding and editing happen in a panel opened from the address, so a link or a refresh keeps it.
 */
export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const plate = searchPlate(sp.q);
  const type = parseVehicleType(sp.type);
  const owner = parseOwnership(sp.owner);
  const status = parseVehicleStatus(sp.status);
  const size = parsePageSize(sp.size);
  const filter = { plate, type, owner, status };

  const counts = await registerCounts();
  const matchingFirst = await searchRegister(filter, 1, size);
  const pages = Math.max(1, Math.ceil(matchingFirst.total / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const { rows, total } = page === 1 ? matchingFirst : await searchRegister(filter, page, size);
  const { first, last } = registerRange(page, size, rows.length, total);

  const scope = (over: Partial<Search> = {}) => {
    const merged: Record<string, string> = {
      ...(plate ? { q: plate } : {}),
      ...(type ? { type } : {}),
      ...(owner ? { owner } : {}),
      ...(status ? { status } : {}),
      ...(size !== 20 ? { size: String(size) } : {}),
      ...over,
    } as Record<string, string>;
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return `/admin/vehicles${qs ? `?${qs}` : ""}`;
  };
  const filtersOn = Boolean(plate || type || owner || status);

  // The panel: adding, or editing one vehicle
  const editing = sp.edit ? await getVehicleDetail(sp.edit) : null;
  const panel = sp.add ? "add" : editing ? "edit" : null;

  const noticePlate = sp.plate ? formatPlate(normalisePlate(sp.plate).slice(0, 14)) : "";
  const notice = sp.notice === "added" ? `${noticePlate || "The vehicle"} was added.` : sp.notice === "saved" ? `${noticePlate || "The vehicle"} was saved.` : null;

  return (
    <>
      <PageHeader
        title="Vehicles"
        actions={
          <Link href={scope({ page: "", add: "1" })} className="btn btn-primary">
            <IconPlus aria-hidden="true" className="h-5 w-5" />
            Add vehicle
          </Link>
        }
      >
        Manage all vehicles registered in the church parking system.
      </PageHeader>

      {notice && (
        <p role="status" className="rounded-xl border-2 border-success bg-success-soft p-3 font-medium">
          {notice}
        </p>
      )}

      <MetricRow>
        <MetricCard id="vh-total" label="Total vehicles" value={counts.total} note="Every vehicle in the register" href="/admin/vehicles" icon={<IconCar className="h-5 w-5" />} />
        <MetricCard id="vh-member" label="Member vehicles" value={counts.activeMember} note="Active, saved by a member" href="/admin/vehicles?owner=member&status=active" icon={<IconUsers className="h-5 w-5" />} />
        <MetricCard id="vh-guest" label="Guest vehicles" value={counts.activeGuest} note="Active, not linked to a member" href="/admin/vehicles?owner=guest&status=active" icon={<IconUser className="h-5 w-5" />} />
        <MetricCard id="vh-inactive" label="Inactive vehicles" value={counts.inactive} note="Cannot be checked in" href="/admin/vehicles?status=inactive" icon={<IconLock className="h-5 w-5" />} />
      </MetricRow>

      <form noValidate aria-label="Filters" className="surface space-y-4">
        {size !== 20 && <input type="hidden" name="size" value={size} />}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-[1fr_1fr_1fr_minmax(0,1.6fr)]">
          <label className="block text-sm font-medium">
            Vehicle type
            <select name="type" defaultValue={type ?? ""} className={inputClass}>
              <option value="">All types</option>
              {VEHICLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Ownership
            <select name="owner" defaultValue={owner ?? ""} className={inputClass}>
              <option value="">All</option>
              <option value="member">Member</option>
              <option value="guest">Guest</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Status
            <select name="status" defaultValue={status ?? ""} className={inputClass}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="col-span-2 block text-sm font-medium xl:col-span-1">
            Search by plate number
            <span className="relative mt-1 block">
              <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
              <input name="q" defaultValue={plate} autoComplete="off" autoCapitalize="characters" placeholder="Search by plate number…" className="input !mt-0 !pl-11 uppercase" />
            </span>
          </label>
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Link href="/admin/vehicles" className="btn btn-outline flex-1 sm:flex-none">
            Reset
          </Link>
          <button className="btn btn-primary flex-1 sm:flex-none">Apply filters</button>
        </div>
      </form>

      <section aria-label="Vehicles" className="surface">
        <h2 className="mb-3 text-xl font-extrabold">
          Vehicles (<span data-testid="vh-count">{total}</span>)
        </h2>

        {rows.length === 0 ? (
          <EmptyState
            action={
              filtersOn && (
                <Link href="/admin/vehicles" className="font-semibold text-accent underline">
                  Reset filters
                </Link>
              )
            }
          >
            {filtersOn ? "No vehicles match these filters." : "No vehicles are registered yet."}
          </EmptyState>
        ) : (
          <BulkRegister>
            <ul className="grid gap-3 wide:hidden">
              {rows.map((v) => (
                <li key={v.id} className="row-card !items-start">
                  <input type="checkbox" name="ids" value={v.id} aria-label={`Select ${formatPlate(v.plate)}`} className="mt-2 h-5 w-5 shrink-0 accent-[#141414]" />
                  <Link href={`/admin/vehicles/${v.id}`} aria-label={`Vehicle ${formatPlate(v.plate)}`} className="min-w-0 flex-1 hover:opacity-80">
                    <VehicleIdentity plate={v.plate} summary={[v.type ? typeLabel(v.type) : null, describeVehicle({ make: v.make, colour: v.colour })].filter(Boolean).join(" · ") || "No details"}>
                      <span className="t-support block">{v.ownerId ? `Member · ${v.ownerName ?? ""}` : "Guest vehicle"}</span>
                      <span className="mt-1.5 block">
                        <StatusChip active={v.active} />
                      </span>
                    </VehicleIdentity>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto wide:block">
              <table className="dt min-w-[56rem]">
                <caption className="sr-only">Vehicles</caption>
                <thead>
                  <tr>
                    <th scope="col" className="dt-th w-10">
                      <input type="checkbox" data-select-all aria-label="Select all vehicles on this page" className="h-5 w-5 accent-[#141414]" />
                    </th>
                    {["Vehicle", "Ownership", "Linked member / owner", "Status", "Date registered", "Actions"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const details = [v.type ? typeLabel(v.type) : null, describeVehicle({ make: v.make, colour: v.colour })].filter(Boolean).join(" · ");
                    return (
                      <tr key={v.id}>
                        <td className="dt-td">
                          <input type="checkbox" name="ids" value={v.id} aria-label={`Select ${formatPlate(v.plate)}`} className="h-5 w-5 accent-[#141414]" />
                        </td>
                        <td className="dt-td max-w-[20rem]">
                          <VehicleIdentity plate={v.plate} href={`/admin/vehicles/${v.id}`} ariaLabel={`Vehicle ${formatPlate(v.plate)}`} summary={details || "No details"} />
                        </td>
                        <td className="dt-td whitespace-nowrap">{v.ownerId ? "Member" : "Guest"}</td>
                        <td className="dt-td">
                          {v.ownerId ? (
                            <Link href={`/admin/members/${v.ownerId}`} className="font-semibold underline-offset-2 hover:underline">
                              {v.ownerName ?? "Member"}
                            </Link>
                          ) : (
                            <span className="text-ink-soft">Guest vehicle</span>
                          )}
                        </td>
                        <td className="dt-td">
                          <StatusChip active={v.active} />
                        </td>
                        <td className="dt-td whitespace-nowrap">{registered(v)}</td>
                        <td className="dt-td">
                          <span className="flex gap-2">
                            <Link href={`/admin/vehicles/${v.id}`} aria-label={`View vehicle ${formatPlate(v.plate)}`} className="btn btn-quiet">
                              View
                            </Link>
                            <Link href={scope({ edit: v.id, page: page > 1 ? String(page) : "" })} aria-label={`Edit vehicle ${formatPlate(v.plate)}`} className="btn btn-quiet">
                              Edit
                            </Link>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </BulkRegister>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft" data-testid="vh-showing">
            Showing {first}–{last} of {total} {total === 1 ? "vehicle" : "vehicles"}
          </p>
          <PageNumbers page={page} pages={pages} numbers={pageNumbers(page, pages)} href={(p) => scope({ page: String(p) })} />
          <nav aria-label="Rows per page" className="flex items-center gap-1.5 text-sm">
            <span className="text-ink-soft">Rows per page</span>
            {REGISTER_PAGE_SIZES.map((n) =>
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

      {panel && (
        <Panel title={panel === "add" ? "Add vehicle" : `Edit ${formatPlate(editing!.plate)}`} closeHref={scope({ page: page > 1 ? String(page) : "" })}>
          <VehicleForm
            key={editing?.id ?? "new"}
            doneHref={scope({ page: page > 1 ? String(page) : "" })}
            vehicle={
              editing
                ? { id: editing.id, plate: editing.plate, type: editing.type ?? "", make: editing.make ?? "", colour: editing.colour ?? "", active: editing.active, ownerId: editing.ownerId, ownerName: editing.ownerName }
                : undefined
            }
          />
        </Panel>
      )}
    </>
  );
}
