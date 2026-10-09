import Link from "next/link";
import { MenuRow } from "@/components/MenuRow";
import { IconCalendar, IconCar, IconUsers } from "@/components/icons";
import { listAuditEntries } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { MEMBER_SESSION_SECONDS } from "@/lib/member-token";
import { MAX_MEMBER_VEHICLES, NEW_CAR_DAYS, PIN_LIMITS, RATE_LIMITS } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { STAFF_SESSION_SECONDS } from "@/lib/staff-token";
import pkg from "@/package.json";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const hours = (s: number) => `${s / 3600} hours`;
const days = (s: number) => `${Math.round(s / 86_400)} days`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold sm:text-right">{children}</dd>
    </div>
  );
}

/**
 * The rules the system runs on, shown so the parking lead can see them, plus the activity log. The rules are
 * set in the code and recorded in the decisions file, so this screen only reads them: changing one needs a developer.
 */
export default async function SettingsPage() {
  await requireStaff("admin");
  const [log] = await Promise.all([listAuditEntries(60)]);
  const host = new URL(serverEnv().APP_URL).host;

  return (
    <>
      <p className="text-ink-soft">
        These are the rules the system follows. They are shown here to read. To change one, ask the developer, and it will be
        recorded as a decision.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="The system" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">The system</h2>
          <dl className="divide-y divide-edge/15">
            <Row label="Church">Christ Church International</Row>
            <Row label="Address of the app">{host}</Row>
            <Row label="Time zone">Africa/Lagos (no clock changes)</Row>
            <Row label="Version">v{pkg.version}</Row>
            <Row label="Guest records kept for">24 months, then deleted every night</Row>
            <Row label="Open visits at midnight">Closed as missed at 00:00 Lagos time</Row>
          </dl>
        </section>

        <section aria-label="Check-in rules" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Service selection rules</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Pick the next service that starts within 30 minutes.</li>
            <li>Otherwise pick the service in progress.</li>
            <li>Otherwise pick the next service that day.</li>
          </ol>
          <p className="mt-2 text-sm text-ink-soft">Time zone: Africa/Lagos. The driver can change the service.</p>
          <dl className="mt-2 divide-y divide-edge/15">
            <Row label="A pass works">Only on the day it was issued</Row>
            <Row label="Cars per member">Up to {MAX_MEMBER_VEHICLES}</Row>
            <Row label="A saved car shows NEW CAR for">{NEW_CAR_DAYS} days</Row>
          </dl>
        </section>

        <section aria-label="Security limits" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Security limits</h2>
          <dl className="divide-y divide-edge/15">
            <Row label="Check-ins per phone number">{RATE_LIMITS.phone.max} an hour</Row>
            <Row label="Check-ins per internet address">{RATE_LIMITS.ip.max} in {RATE_LIMITS.ip.windowMinutes} minutes</Row>
            <Row label="Wrong PINs before a pause">
              {PIN_LIMITS.pause.max}, then {PIN_LIMITS.pause.windowMinutes} minutes
            </Row>
            <Row label="Wrong PINs before the account locks">{PIN_LIMITS.daily.max} in a day (an admin resets it)</Row>
            <Row label="Staff stay signed in for">{hours(STAFF_SESSION_SECONDS)}</Row>
            <Row label="Members stay signed in for">{days(MEMBER_SESSION_SECONDS)}</Row>
          </dl>
        </section>

        <section aria-label="Manage" className="rounded-card bg-card shadow-sm">
          <h2 className="px-4 pb-1 pt-4 text-lg font-bold">What you can change</h2>
          <ul className="divide-y divide-edge/15">
            <li><MenuRow href="/admin/services" icon={<IconCalendar className="h-5 w-5" />} title="Services" subtitle="Names and times" /></li>
            <li><MenuRow href="/admin/areas" icon={<IconCar className="h-5 w-5" />} title="Car Parks" subtitle="Add, rename or switch off" /></li>
            <li><MenuRow href="/admin/staff" icon={<IconUsers className="h-5 w-5" />} title="Staff Accounts" subtitle="Add people and change roles" /></li>
          </ul>
        </section>
      </div>

      <section aria-label="Activity log" className="rounded-card bg-card p-4 shadow-sm">
        <h2 className="text-lg font-bold">Activity log</h2>
        <p className="text-sm text-ink-soft">The latest {log.length} things staff and admins did. Drivers&apos; details are never shown here.</p>
        {log.length === 0 ? (
          <p className="mt-2 text-ink-soft">Nothing yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto" role="region" aria-label="Activity log table, scroll sideways on a small screen" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">What happened</th>
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/15">
                {log.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {formatLagosDate(e.at)}, {formatLagosTime(e.at)}
                    </td>
                    <td className="py-2 pr-3 font-semibold">
                      {e.visitId ? (
                        <Link href={`/admin/visits/${e.visitId}`} className="underline">
                          {e.what}
                        </Link>
                      ) : (
                        e.what
                      )}
                    </td>
                    <td className="py-2 pr-3">{e.by ?? "The system"}</td>
                    <td className="py-2 text-ink-soft">{e.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
