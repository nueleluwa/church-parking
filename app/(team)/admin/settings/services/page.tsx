import { GetForm } from "@/components/ds/GetForm";
import Link from "next/link";
import { BulkBar, BulkCheck, BulkSelectAll, DeleteButton } from "@/components/ds/Bulk";
import { IconPlus, IconSearch } from "@/components/icons";
import { listAllServices } from "@/lib/db";
import { serviceProgress, type ServiceProgress } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../../AdminForm";
import { deleteServicesAction, saveServiceAction } from "../../admin-actions";
import { Panel } from "../../Panel";
import { Chip, SectionHead, addButton, card, input } from "../ui";

const DELETE_NOTE = "A service that already has visits cannot be deleted: it is kept, and you can switch it off instead. Services nobody has used are removed."

export const metadata = { title: "Services" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (t: string) => t.slice(0, 5);

const PROGRESS: Record<ServiceProgress, { label: string; tone: "on" | "off" | "alert" }> = {
  active: { label: "Active", tone: "on" },
  upcoming: { label: "Upcoming", tone: "on" },
  completed: { label: "Completed", tone: "off" },
  "other-day": { label: "Not today", tone: "off" },
  off: { label: "Off", tone: "off" },
};

type Service = { id: number; name: string; weekday: number; starts_at: string; ends_at: string; active: boolean };

function ServiceFields({ service }: { service?: Service }) {
  return (
    <>
      {service && <input type="hidden" name="id" value={service.id} />}
      <label className="block font-medium">
        Name
        <input name="name" required maxLength={60} defaultValue={service?.name ?? ""} autoComplete="off" className="input" />
      </label>
      <label className="block font-medium">
        Day
        <select name="weekday" defaultValue={service?.weekday ?? 0} className="input">
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0 font-medium">
          Starts
          <input name="starts" type="time" required defaultValue={service ? hhmm(service.starts_at) : "07:30"} className="input" />
        </label>
        <label className="block min-w-0 font-medium">
          Ends
          <input name="ends" type="time" required defaultValue={service ? hhmm(service.ends_at) : "09:30"} className="input" />
        </label>
      </div>
      <label className="flex items-center gap-3 font-medium">
        <input name="active" type="checkbox" defaultChecked={service?.active ?? true} className="h-6 w-6 accent-[var(--color-accent)]" />
        In use (drivers can check in to it)
      </label>
    </>
  );
}

type Search = { q?: string; day?: string; status?: string; add?: string; edit?: string };

/**
 * AD-1: the services, inside Settings. Changes show on every screen straight away. A service is switched off instead of deleted, and
 * changing its name or times never moves an existing visit: each visit keeps the service it was made for.
 */
export default async function ServicesSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const all = await listAllServices();
  const q = (sp.q ?? "").trim().slice(0, 60).toLowerCase();
  const day = /^[0-6]$/.test(sp.day ?? "") ? Number(sp.day) : null;
  const status = sp.status === "on" || sp.status === "off" ? sp.status : null;
  const now = new Date();

  const services = all.filter((s) => (!q || s.name.toLowerCase().includes(q)) && (day === null || s.weekday === day) && (!status || s.active === (status === "on")));
  const filtersOn = Boolean(q || day !== null || status);
  const editing = sp.edit ? all.find((s) => String(s.id) === sp.edit) : undefined;

  const scope = (over: Record<string, string> = {}) => {
    const merged: Record<string, string> = { ...(q ? { q } : {}), ...(day !== null ? { day: String(day) } : {}), ...(status ? { status } : {}), ...over };
    const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return `/admin/settings/services${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <section aria-label="Services" className={card}>
        <SectionHead
          title={
            <>
              Services (<span data-testid="svc-count">{services.length}</span>)
            </>
          }
          action={
            <Link href={scope({ add: "1" })} className={addButton}>
              <IconPlus aria-hidden="true" className="h-5 w-5" />
              Add service
            </Link>
          }
        >
          Change a service&apos;s name or times. Drivers are put into the right service from these times. Delete a service that was never used, or switch it off so old records keep their service.
        </SectionHead>

        <GetForm noValidate aria-label="Filters" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] sm:items-end">
          <label className="col-span-2 block text-sm font-medium sm:col-span-1">
            Search by name
            <span className="relative mt-1 block">
              <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
              <input name="q" defaultValue={q} autoComplete="off" placeholder="Search services…" className="input !mt-0 !pl-11" />
            </span>
          </label>
          <label className="block text-sm font-medium">
            Day
            <select name="day" defaultValue={day === null ? "" : String(day)} className={input}>
              <option value="">Every day</option>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Status
            <select name="status" defaultValue={status ?? ""} className={input}>
              <option value="">All</option>
              <option value="on">In use</option>
              <option value="off">Switched off</option>
            </select>
          </label>
          <div className="col-span-2 flex gap-2 sm:col-span-1">
            <Link href="/admin/settings/services" className="btn btn-outline flex-1">
              Reset
            </Link>
            <button className="btn btn-primary flex-1">Apply</button>
          </div>
        </GetForm>

        {services.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">
            {filtersOn ? "No services match these filters. " : "No services are set up yet. "}
            {filtersOn && (
              <Link href="/admin/settings/services" className="font-semibold text-accent underline">
                Reset filters
              </Link>
            )}
          </p>
        ) : (
          <>
            <div className="mb-3 empty:hidden">
              <BulkBar group="services" noun="service" nounPlural="services" consequence={DELETE_NOTE} action={deleteServicesAction} />
            </div>
            <ul className="grid gap-3 lg:hidden">
              {services.map((s) => {
                const p = PROGRESS[serviceProgress(now, s)];
                return (
                  <li key={s.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-edge/10 p-3">
                    <BulkCheck group="services" id={String(s.id)} label={`${s.name} (${DAYS[s.weekday]})`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-card">{s.name}</span>
                      <span className="block text-sm text-ink-soft">
                        {DAYS[s.weekday]} · {hhmm(s.starts_at)} to {hhmm(s.ends_at)}
                      </span>
                      <span className="mt-1 block">
                        <Chip tone={p.tone}>{p.label}</Chip>
                      </span>
                    </span>
                    <Link href={scope({ edit: String(s.id) })} aria-label={`Edit ${s.name} (${DAYS[s.weekday]})`} className="btn btn-quiet">
                      Edit
                    </Link>
                    <DeleteButton id={String(s.id)} label={`${s.name} (${DAYS[s.weekday]})`} noun="service" consequence={DELETE_NOTE} action={deleteServicesAction} />
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="dt min-w-[40rem]">
                <caption className="sr-only">Services</caption>
                <thead>
                  <tr>
                    <th scope="col" className="dt-th w-10">
                      <BulkSelectAll group="services" noun="services" />
                    </th>
                    {["Service", "Day", "Start", "End", "Status", "Actions"].map((c) => (
                      <th key={c} scope="col" className="dt-th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => {
                    const p = PROGRESS[serviceProgress(now, s)];
                    return (
                      <tr key={s.id}>
                        <td className="dt-td">
                          <BulkCheck group="services" id={String(s.id)} label={`${s.name} (${DAYS[s.weekday]})`} />
                        </td>
                        <td className="dt-td font-bold">{s.name}</td>
                        <td className="dt-td whitespace-nowrap">{DAYS[s.weekday]}</td>
                        <td className="dt-td whitespace-nowrap">{hhmm(s.starts_at)}</td>
                        <td className="dt-td whitespace-nowrap">{hhmm(s.ends_at)}</td>
                        <td className="dt-td">
                          <Chip tone={p.tone}>{p.label}</Chip>
                        </td>
                        <td className="dt-td">
                          <div className="flex gap-2">
                            <Link href={scope({ edit: String(s.id) })} aria-label={`Edit ${s.name} (${DAYS[s.weekday]})`} className="btn btn-quiet">
                              Edit
                            </Link>
                            <DeleteButton id={String(s.id)} label={`${s.name} (${DAYS[s.weekday]})`} noun="service" consequence={DELETE_NOTE} action={deleteServicesAction} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-label="Service selection rules" className="surface-tint">
        <h2 className="t-card">Service selection rules</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Pick the next service that starts within 30 minutes.</li>
          <li>Otherwise pick the service in progress.</li>
          <li>Otherwise pick the next service that day.</li>
        </ol>
        <p className="mt-2 text-sm text-ink-soft">Time zone: Africa/Lagos. This is how drivers are put into a service.</p>
      </section>

      {sp.add && (
        <Panel title="Add service" closeHref={scope()}>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <AdminForm action={saveServiceAction} submitLabel="Add service" clearOnSuccess savedMessage="Service added to the schedule.">
              <ServiceFields />
            </AdminForm>
          </div>
        </Panel>
      )}
      {editing && !sp.add && (
        <Panel title={`Edit ${editing.name}`} closeHref={scope()}>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <AdminForm action={saveServiceAction} submitLabel="Save service" savedMessage="Service schedule updated.">
              <ServiceFields service={editing} />
            </AdminForm>
            <p className="rounded-xl bg-page p-3 text-sm text-ink-soft">Visits already made keep this service, whatever its name or times become. Delete it only if it was never used. To stop drivers using it, switch it off.</p>
          </div>
        </Panel>
      )}
    </>
  );
}
