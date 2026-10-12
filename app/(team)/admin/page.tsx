import Link from "next/link";
import {
  IconAlert,
  IconCalendar,
  IconCar,
  IconCheck,
  IconClock,
  IconPin,
  IconQr,
  IconReport,
  IconSettings,
  IconTrend,
  IconUser,
  IconUsers,
} from "@/components/icons";
import { AdminTable, cell } from "@/components/AdminTable";
import { MenuRow } from "@/components/MenuRow";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { loadDashboard } from "@/lib/dashboard-data";
import { listActiveAreas, listRecentActivity, previousServiceCounts } from "@/lib/db";
import { formatLagosTime } from "@/lib/format";
import { formatPlate, lagosDate, percentChange } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const KIND = {
  entry: { word: "Entry", badge: "Checked in", tone: "success" },
  exit: { word: "Exit", badge: "Released", tone: "neutral" },
  closed: { word: "Closed", badge: "Missed", tone: "danger" },
} as const;

function Stat({ label, value, note, icon, href, tone, trend }: {
  trend?: number | null;
  label: string;
  value: number;
  note: string;
  icon: React.ReactNode;
  href?: string;
  tone?: "danger";
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 items-center justify-center rounded-full ${tone === "danger" ? "bg-blush text-danger" : "bg-page text-ink"}`}
      >
        {icon}
      </span>
      <p className="mt-2 text-sm font-medium text-ink-soft">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className={`text-3xl font-extrabold ${tone === "danger" ? "text-danger" : ""}`}>{value}</span>
        {trend ? (
          <span className={`text-sm font-bold ${trend > 0 ? "text-success" : "text-danger"}`} title="Compared with this service last time">
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        ) : null}
      </p>
      <p className="text-xs text-ink-soft">{note}</p>
    </>
  );
  const box = "rounded-2xl bg-card p-4 shadow-sm";
  return href ? (
    <Link href={href} className={`${box} block hover:bg-page`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** The admin overview: today's numbers at a glance, the car parks, recent activity, and the way to every admin screen. */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  await requireStaff("admin");
  const requested = Number.parseInt((await searchParams).service ?? "", 10);
  const today = lagosDate(new Date());
  const [data, activity, areas] = await Promise.all([
    loadDashboard(Number.isFinite(requested) ? requested : undefined),
    listRecentActivity(today, 6),
    listActiveAreas(),
  ]);
  const last = data.serviceId ? await previousServiceCounts(data.serviceId, today) : null;
  const t = data.summary?.totals;
  const service = data.services.find((s) => s.id === data.serviceId);

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold">Parking operations</h1>
        <p className="text-ink-soft">
          {service ? `${service.name} · ${service.time}` : "No service is running today."}
        </p>
      </div>

      {data.services.length > 1 && (
        <nav aria-label="Choose a service" className="flex flex-wrap gap-2">
          {data.services.map((s) => (
            <Link
              key={s.id}
              href={`/admin?service=${s.id}`}
              aria-current={s.id === data.serviceId ? "true" : undefined}
              className={`rounded-full border-2 px-4 py-2 font-semibold ${
                s.id === data.serviceId ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"
              }`}
            >
              {s.name} <span className="font-normal opacity-80">· {s.time}</span>
            </Link>
          ))}
        </nav>
      )}

      <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Checked in" value={t?.checkedIn ?? 0} trend={last ? percentChange(t?.checkedIn ?? 0, last.checkedIn) : null} note="This service" icon={<IconCar className="h-5 w-5" />} href="/admin/visits" />
        <Stat label="Released" value={t?.released ?? 0} trend={last ? percentChange(t?.released ?? 0, last.released) : null} note="This service" icon={<IconCheck className="h-5 w-5" />} href="/admin/visits?status=released" />
        <Stat label="Still parked" value={t?.parked ?? 0} note="From this service" icon={<IconUser className="h-5 w-5" />} href="/admin/visits?status=parked" />
        <Stat
          label="Exceptions"
          value={data.alerts.length}
          note={data.alerts.length ? "Need attention · view" : "None open"}
          icon={<IconAlert className="h-5 w-5" />}
          href="/staff/dashboard"
          tone={data.alerts.length ? "danger" : undefined}
        />
      </section>

      <div className="space-y-4">
      {data.summary && (
        <section aria-label="Parking areas" className="space-y-2">
          <h2 className="px-1 text-lg font-bold">Parking areas</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {data.summary.areas.map((a) => (
              <li key={a.areaId} className="rounded-2xl bg-card shadow-sm hover:bg-page">
                <Link href={`/admin/visits?area=${areas.find((x) => x.name === a.areaName)?.slug ?? ""}`} className="block p-4" aria-label={`${a.areaName}: see its visits`}>
                <p data-area className="font-bold">{a.areaName}</p>
                <p className="text-3xl font-extrabold">{a.parked}</p>
                <p className="text-sm text-ink-soft">Currently parked</p>
                <p className="mt-2 text-sm text-ink-soft">
                  {a.checkedIn} checked in · {a.released} released
                </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Recent activity" className="rounded-card bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent activity</h2>
          <Link href="/staff/history" className="text-sm font-semibold text-accent underline">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="mt-2 text-ink-soft">Nothing has happened today yet.</p>
        ) : (
          <>
          <ul className="mt-2 divide-y divide-edge/15 lg:hidden">
            {activity.map((e) => (
              <li key={e.key} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap font-bold">{formatPlate(e.plate)}</span>
                  <span className="block text-sm text-ink-soft">
                    {KIND[e.kind].word} · <span data-area>{e.areaName}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge tone={KIND[e.kind].tone}>{KIND[e.kind].badge}</StatusBadge>
                  <span className="whitespace-nowrap text-sm font-semibold">{formatLagosTime(e.at)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden lg:block">
            <AdminTable label="Recent activity" columns={["Vehicle", "Type", "Car park", "Time", "Status"]}>
              {activity.map((e) => (
                <tr key={e.key}>
                  <td className={cell}>
                    <span className="flex items-center gap-3">
                      <VehicleImage size="sm" />
                      <span className="whitespace-nowrap font-bold">{formatPlate(e.plate)}</span>
                    </span>
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    <span aria-hidden="true" className={e.kind === "entry" ? "text-success" : "text-ink-soft"}>
                      {e.kind === "entry" ? "↑" : "↓"}{" "}
                    </span>
                    {KIND[e.kind].word}
                  </td>
                  <td data-area className={`${cell} whitespace-nowrap`}>{e.areaName}</td>
                  <td className={`${cell} whitespace-nowrap`}>{formatLagosTime(e.at)}</td>
                  <td className={cell}>
                    <StatusBadge tone={KIND[e.kind].tone}>{KIND[e.kind].badge}</StatusBadge>
                  </td>
                </tr>
              ))}
            </AdminTable>
          </div>
          </>
        )}
      </section>
      </div>

      {/* On a wide screen the side menu already lists these, so the list is for phones */}
      <section aria-label="Manage" className="lg:hidden">
        <h2 className="px-1 pb-2 text-lg font-bold">Manage</h2>
        <ul className="divide-y divide-edge/15 overflow-hidden rounded-card bg-card shadow-sm">
          <li><MenuRow href="/admin/analytics" icon={<IconTrend className="h-5 w-5" />} title="Analytics" subtitle="Peak times, car park usage and how visits ended" /></li>
          <li><MenuRow href="/admin/reports" icon={<IconReport className="h-5 w-5" />} title="Reports" subtitle="Counts, missed check-outs and CSV export" /></li>
          <li><MenuRow href="/admin/services" icon={<IconCalendar className="h-5 w-5" />} title="Services" subtitle="Names and times" /></li>
          <li><MenuRow href="/admin/signs" icon={<IconQr className="h-5 w-5" />} title="QR Signs" subtitle="Print a sign for each car park" /></li>
          <li><MenuRow href="/admin/users" icon={<IconUsers className="h-5 w-5" />} title="Users" subtitle="Members and staff accounts: add, find, reset PINs, change roles" /></li>
          <li><MenuRow href="/admin/visits" icon={<IconClock className="h-5 w-5" />} title="Visits" subtitle="Every visit by day, car park and status" /></li>
          <li><MenuRow href="/admin/vehicles" icon={<IconCar className="h-5 w-5" />} title="Vehicles" subtitle="Every car seen, and its latest visit" /></li>
          <li><MenuRow href="/admin/areas" icon={<IconPin className="h-5 w-5" />} title="Car Parks" subtitle="Add, rename or switch off a car park" /></li>
          <li><MenuRow href="/admin/settings" icon={<IconSettings className="h-5 w-5" />} title="Settings" subtitle="The rules in force, and the activity log" /></li>
        </ul>
      </section>
    </>
  );
}
