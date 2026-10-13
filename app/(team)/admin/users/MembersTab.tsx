import Link from "next/link";
import { IconCar, IconClock, IconLock, IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { PageNumbers } from "@/components/Pager";
import { VehicleImage } from "@/components/VehicleImage";
import { memberSummary, searchMemberList } from "@/lib/db";
import {
  MEMBER_PAGE_SIZES,
  initials,
  lagosMonthStart,
  lagosParts,
  memberState,
  pageNumbers,
  parseMemberCars,
  parseMemberPageSize,
  parseMemberStatus,
  registerRange,
} from "@/lib/rules";
import { MemberChip } from "./MemberChip";
import { MemberForm } from "./MemberForm";
import { Panel } from "../Panel";
import { RowMenu } from "./RowMenu";
import { MetricRow } from "@/components/ds/MetricCard";
import { Summary } from "./Summary";

export type MembersSearch = { q?: string; status?: string; cars?: string; joined?: string; size?: string; page?: string; add?: string; notice?: string };

const inputClass = "input";

/**
 * The Members tab: the numbers, the filters, and one page of members with their saved-car counts. Names and phone numbers are
 * shown to administrators only (this whole screen is). A row is a member account, not a visit.
 */
export async function MembersTab({ sp }: { sp: MembersSearch }) {
  const q = (sp.q ?? "").trim().slice(0, 60);
  const status = parseMemberStatus(sp.status);
  const cars = parseMemberCars(sp.cars);
  const monthStart = lagosMonthStart(new Date());
  const since = sp.joined === "month" ? monthStart : null;
  const size = parseMemberPageSize(sp.size);
  const filter = { q, status, cars, since };

  const summary = await memberSummary(monthStart);
  const first = await searchMemberList(filter, 1, size);
  const pages = Math.max(1, Math.ceil(first.total / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const { rows, total } = page === 1 ? first : await searchMemberList(filter, page, size);
  const range = registerRange(page, size, rows.length, total);

  const scope = (over: Partial<MembersSearch> = {}) => {
    const merged: Record<string, string> = {
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(cars ? { cars } : {}),
      ...(since ? { joined: "month" } : {}),
      ...(size !== 20 ? { size: String(size) } : {}),
      ...over,
    } as Record<string, string>;
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return `/admin/users${qs ? `?${qs}` : ""}`;
  };
  const keepPage = page > 1 ? String(page) : "";
  const filtersOn = Boolean(q || status || cars || since);
  const now = new Date();
  const notice = sp.notice === "added" ? "The member was added. Tell them their PIN in person." : null;

  return (
    <>
      {notice && (
        <p role="status" className="rounded-xl border-2 border-success bg-success-soft p-3 font-medium">
          {notice}
        </p>
      )}

      <MetricRow>
        <Summary id="u-total" label="Total members" value={summary.total} note="Registered accounts" href="/admin/users" icon={<IconUsers className="h-5 w-5" />} />
        <Summary id="u-vehicles" label="Registered vehicles" value={summary.vehicles} note="Across all members" href="/admin/users?cars=with" icon={<IconCar className="h-5 w-5" />} />
        <Summary id="u-new" label="New this month" value={summary.newThisMonth} note="Members added" href="/admin/users?joined=month" icon={<IconClock className="h-5 w-5" />} />
        <Summary id="u-inactive" label="Inactive members" value={summary.inactive} note="Not active" href="/admin/users?status=inactive" icon={<IconLock className="h-5 w-5" />} />
      </MetricRow>

      <section aria-label="Members" className="surface">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">
              Members (<span data-testid="u-count">{total}</span>)
            </h2>
            <p className="text-sm text-ink-soft">View and manage church members and their registered vehicles.</p>
          </div>
          <Link href={scope({ add: "1", page: "" })} className="btn btn-primary">
            <IconPlus aria-hidden="true" className="h-5 w-5" />
            Add member
          </Link>
        </div>

        <form noValidate aria-label="Filters" className="mb-4 space-y-3">
          {size !== 20 && <input type="hidden" name="size" value={size} />}
          {since && <input type="hidden" name="joined" value="month" />}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-[minmax(0,2fr)_1fr_1fr]">
            <label className="col-span-2 block text-sm font-medium xl:col-span-1">
              Search by name, phone number or vehicle number
              <span className="relative mt-1 block">
                <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
                <input name="q" defaultValue={q} autoComplete="off" placeholder="Search by name, phone number or vehicle number…" className="input !mt-0 !pl-11" />
              </span>
            </label>
            <label className="block text-sm font-medium">
              Status
              <select name="status" defaultValue={status ?? ""} className={inputClass}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Registered vehicles
              <select name="cars" defaultValue={cars ?? ""} className={inputClass}>
                <option value="">All members</option>
                <option value="with">With vehicles</option>
                <option value="none">Without vehicles</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Link href="/admin/users" className="btn btn-outline flex-1 sm:flex-none">
              Reset
            </Link>
            <button className="btn btn-primary flex-1 sm:flex-none">Apply filters</button>
          </div>
        </form>

        {rows.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">
            {filtersOn ? "No members match these filters. " : "No members have signed up yet. "}
            {filtersOn && (
              <Link href="/admin/users" className="font-semibold text-accent underline">
                Reset filters
              </Link>
            )}
          </p>
        ) : (
          <>
            <ul className="grid gap-3 wide:hidden">
              {rows.map((m) => (
                <li key={m.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-edge/10 p-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-sm font-extrabold">
                    {initials(m.fullName)}
                  </span>
                  <Link href={`/admin/members/${m.id}`} aria-label={`Member ${m.fullName}`} className="min-w-0 flex-1 hover:opacity-80">
                    <span className="block truncate text-lg font-bold">{m.fullName}</span>
                    <span className="block text-sm text-ink-soft">{m.phone}</span>
                    <span className="block text-sm text-ink-soft">
                      {m.vehicleCount} {m.vehicleCount === 1 ? "vehicle" : "vehicles"} · joined {lagosParts(m.createdAt).date}
                    </span>
                    <span className="mt-1 block">
                      <MemberChip state={memberState({ active: m.active, locked_until: m.lockedUntil }, now)} />
                    </span>
                  </Link>
                  <RowMenu id={m.id} name={m.fullName} active={m.active} />
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto wide:block">
              <table className="dt min-w-[52rem]">
                <caption className="sr-only">Members</caption>
                <thead>
                  <tr>
                    {["Member name", "Phone number", "Vehicles", "Status", "Date joined", "Actions"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="dt-td">
                        <span className="flex items-center gap-3">
                          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-sm font-extrabold">
                            {initials(m.fullName)}
                          </span>
                          <Link href={`/admin/members/${m.id}`} aria-label={`Member ${m.fullName}`} className="font-bold underline-offset-2 hover:underline">
                            {m.fullName}
                          </Link>
                        </span>
                      </td>
                      <td className="dt-td whitespace-nowrap">{m.phone}</td>
                      <td className="dt-td">
                        <span className="flex items-center gap-2">
                          {m.vehicleCount > 0 && <VehicleImage size="sm" className="!w-10" />}
                          {m.vehicleCount}
                        </span>
                      </td>
                      <td className="dt-td">
                        <MemberChip state={memberState({ active: m.active, locked_until: m.lockedUntil }, now)} />
                      </td>
                      <td className="dt-td whitespace-nowrap">{lagosParts(m.createdAt).date}</td>
                      <td className="dt-td">
                        <span className="flex items-center gap-2">
                          <Link href={`/admin/members/${m.id}`} aria-label={`View member ${m.fullName}`} className="btn btn-quiet">
                            View
                          </Link>
                          <RowMenu id={m.id} name={m.fullName} active={m.active} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft" data-testid="u-showing">
            Showing {range.first}–{range.last} of {total} {total === 1 ? "member" : "members"}
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
        <Panel title="Add member" closeHref={scope({ page: keepPage })}>
          <MemberForm doneHref={scope({ page: keepPage })} />
        </Panel>
      )}
    </>
  );
}
