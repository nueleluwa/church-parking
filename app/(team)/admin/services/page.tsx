import { StatusBadge } from "@/components/StatusBadge";
import { field } from "@/components/ui";
import { listAllServices } from "@/lib/db";
import { serviceProgress, type ServiceProgress } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../AdminForm";
import { saveServiceAction } from "../admin-actions";

export const metadata = { title: "Services" };
export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (t: string) => t.slice(0, 5);

const PROGRESS: Record<ServiceProgress, { label: string; tone: "success" | "neutral" | "warning" }> = {
  active: { label: "Active", tone: "success" },
  upcoming: { label: "Upcoming", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  "other-day": { label: "Not today", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
};

function ServiceFields({
  service,
}: {
  service?: { id: number; name: string; weekday: number; starts_at: string; ends_at: string; active: boolean };
}) {
  return (
    <>
      {service && <input type="hidden" name="id" value={service.id} />}
      <label className="block font-medium">
        Name
        <input name="name" required maxLength={60} defaultValue={service?.name ?? ""} autoComplete="off" className={field} />
      </label>
      <label className="block font-medium">
        Day
        <select name="weekday" defaultValue={service?.weekday ?? 0} className={field}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block font-medium">
          Starts
          <input name="starts" type="time" required defaultValue={service ? hhmm(service.starts_at) : "07:30"} className={field} />
        </label>
        <label className="block font-medium">
          Ends
          <input name="ends" type="time" required defaultValue={service ? hhmm(service.ends_at) : "09:30"} className={field} />
        </label>
      </div>
      <label className="flex items-center gap-3 font-medium">
        <input name="active" type="checkbox" defaultChecked={service?.active ?? true} className="h-6 w-6 accent-[var(--color-accent)]" />
        In use (drivers can check in to it)
      </label>
    </>
  );
}

/** AD-1: the services. Changes show on every screen straight away. */
export default async function ServicesPage() {
  await requireStaff("admin");
  const services = await listAllServices();
  const now = new Date();
  return (
    <>
      <p className="text-ink-soft">
        Change a service&apos;s name or times. Drivers are put into the right service from these times. Switch a service
        off instead of deleting it, so old records keep their service.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
      <ul className="grid items-start gap-3">
        {services.map((s) => (
          <li key={s.id} className="rounded-card bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{s.name}</p>
                <p className="text-sm text-ink-soft">
                  {DAYS[s.weekday]} {hhmm(s.starts_at)} to {hhmm(s.ends_at)}
                </p>
              </div>
              <StatusBadge tone={PROGRESS[serviceProgress(now, s)].tone}>{PROGRESS[serviceProgress(now, s)].label}</StatusBadge>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Change {s.name}</summary>
              <div className="mt-3">
                <AdminForm action={saveServiceAction} submitLabel="Save service">
                  <ServiceFields service={s} />
                </AdminForm>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <section aria-label="Service selection rules" className="rounded-card bg-blush p-4">
        <h2 className="text-lg font-bold">Service selection rules</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Pick the next service that starts within 30 minutes.</li>
          <li>Otherwise pick the service in progress.</li>
          <li>Otherwise pick the next service that day.</li>
        </ol>
        <p className="mt-2 text-sm text-ink-soft">Time zone: Africa/Lagos. This is how drivers are put into a service.</p>
      </section>
      </div>

      <section className="rounded-card bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:col-span-2">
        <h2 className="text-lg font-bold">Add a service</h2>
        <div className="mt-3">
          <AdminForm action={saveServiceAction} submitLabel="Add service" clearOnSuccess>
            <ServiceFields />
          </AdminForm>
        </div>
      </section>
      </div>
    </>
  );
}
