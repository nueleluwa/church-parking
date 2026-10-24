import { IconCalendar, IconClock, IconPin } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { listActiveAreas, listActiveServices } from "@/lib/db";
import { serviceStandings } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Service information" };
export const dynamic = "force-dynamic";

const hhmm = (t: string) => t.slice(0, 5);

/** Today's services and the car parks, so an attendant knows which service is running (rule R-1). */
export default async function ServiceInfoPage() {
  await requireStaff("attendant");
  const [services, areas] = await Promise.all([listActiveServices(), listActiveAreas()]);
  const standings = serviceStandings(new Date(), services);

  return (
    <>
      {standings.length === 0 ? (
        <div className="flex items-center gap-3 rounded-card bg-card p-5 shadow-sm">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
            <IconCalendar className="h-6 w-6" />
          </span>
          <p className="font-bold">There is no service today.</p>
        </div>
      ) : (
        standings.map(({ service, standing }) => (
          <section
            key={service.id}
            className={`rounded-card bg-card p-5 shadow-sm ${standing === "active" ? "border-l-4 border-success" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{service.name}</h2>
                <p className="text-xl font-extrabold tabular-nums">
                  {hhmm(service.starts_at)} – {hhmm(service.ends_at)}
                </p>
              </div>
              {standing === "active" && <StatusBadge tone="success">Active</StatusBadge>}
              {standing === "next" && <StatusBadge tone="warning">Next</StatusBadge>}
              {standing === "finished" && <StatusBadge tone="neutral">Finished</StatusBadge>}
            </div>
            <dl className="mt-3 divide-y divide-edge/15 border-t border-edge/15">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-2 text-ink-soft">
                  <IconClock className="h-5 w-5" /> Starts at
                </dt>
                <dd className="font-semibold">{hhmm(service.starts_at)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-2 text-ink-soft">
                  <IconCalendar className="h-5 w-5" /> Ends at
                </dt>
                <dd className="font-semibold">{hhmm(service.ends_at)}</dd>
              </div>
            </dl>
          </section>
        ))
      )}

      <section className="rounded-card bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <IconPin className="h-5 w-5" /> Car parks
        </h2>
        <ul className="mt-2 divide-y divide-edge/15">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 font-semibold">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
              <span data-area>{a.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-card bg-blush px-4 py-3 text-sm">
        The service is selected automatically for member and guest check-ins: the next one starting
        within 30 minutes, otherwise the one that is running.
      </p>
    </>
  );
}
