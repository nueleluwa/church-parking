import Link from "next/link";
import { listActiveServices, listSweepRows } from "@/lib/db";
import { defaultDashboardService, lagosDate, servicesToday } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { SweepList } from "./SweepList";

export const metadata = { title: "Sweep" };
export const dynamic = "force-dynamic";

const hhmm = (t: string) => t.slice(0, 5);

export default async function SweepPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  await requireStaff("coordinator");
  const { service } = await searchParams;

  const now = new Date();
  const todays = servicesToday(now, await listActiveServices());
  const selected =
    todays.find((s) => String(s.id) === service) ?? defaultDashboardService(now, todays);

  return (
    <>
      <p className="text-ink-soft">
        About 30 minutes after a service ends, walk round and mark each car that is still on the list.
      </p>

      {!selected ? (
        <p className="rounded-card bg-card p-5 font-medium shadow-sm">There is no service today.</p>
      ) : (
        <>
          <div role="group" aria-label="Choose a service" className="flex gap-2 overflow-x-auto pb-1">
            {todays.map((s) => (
              <Link
                key={s.id}
                href={`/staff/sweep?service=${s.id}`}
                aria-current={s.id === selected.id ? "page" : undefined}
                className={`shrink-0 rounded-2xl border-2 px-4 py-2 font-semibold ${
                  s.id === selected.id ? "border-edge bg-blush" : "border-transparent bg-card"
                }`}
              >
                {s.name}
                <span className="block text-xs font-medium text-ink-soft">
                  {hhmm(s.starts_at)} to {hhmm(s.ends_at)}
                </span>
              </Link>
            ))}
          </div>
          <SweepList
            key={selected.id}
            rows={await listSweepRows(selected.id, selected.starts_at, lagosDate(now))}
            serviceId={selected.id}
          />
        </>
      )}
    </>
  );
}
