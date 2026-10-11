import Link from "next/link";
import { field } from "@/components/ui";
import { getSettings, listAuditEntries } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { MEMBER_SESSION_SECONDS } from "@/lib/member-token";
import { MAX_MEMBER_VEHICLES, NEW_CAR_DAYS, PIN_LIMITS, RATE_LIMITS, SEARCH_MODES, SESSION_HOUR_CHOICES, SETTING_LIMITS } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import pkg from "@/package.json";
import { AdminForm } from "../AdminForm";
import { saveChurchSettingsAction, savePreferenceSettingsAction } from "../admin-actions";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const days = (s: number) => `${Math.round(s / 86_400)} days`;

/** The sections. The four with an address go to the screen that already manages them, so nothing is set up twice. */
const SECTIONS = [
  { id: "general", label: "General" },
  { id: "services", label: "Services", href: "/admin/services" },
  { id: "areas", label: "Parking areas", href: "/admin/areas" },
  { id: "rules", label: "Vehicle rules" },
  { id: "signs", label: "QR signs", href: "/admin/signs" },
  { id: "users", label: "Users & access", href: "/admin/staff" },
  { id: "notifications", label: "Notifications" },
  { id: "system", label: "System" },
] as const;

type Tab = "general" | "rules" | "notifications" | "system";
const TABS: Tab[] = ["general", "rules", "notifications", "system"];

const card = "rounded-2xl border border-edge/15 bg-card p-4 sm:p-5";
const input = `${field} !mt-1 !py-2.5 !text-base`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold sm:text-right">{children}</dd>
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm font-normal text-ink-soft">{children}</span>;
}

/**
 * Church details and a few preferences an admin can change, and, in the other sections, the rules the system runs on.
 * Only settings that something in the app really reads can be changed (see lib/rules/settings.ts). The security rules,
 * the time zone and the services, parking areas, QR signs and staff accounts are not settings here: the rules are fixed
 * on purpose, and the rest are managed on their own screens, which this screen links to.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff("admin");
  const asked = (await searchParams).tab;
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : "general";
  const settings = await getSettings();
  const log = tab === "system" ? await listAuditEntries(60) : [];
  const host = new URL(serverEnv().APP_URL).host;

  return (
    <>
      <header>
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-ink-soft">Manage your church parking system and preferences.</p>
      </header>

      <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto border-b border-edge/20 px-4">
        <ul className="flex min-w-max gap-1">
          {SECTIONS.map((s) => {
            const href = "href" in s ? s.href : `/admin/settings${s.id === "general" ? "" : `?tab=${s.id}`}`;
            const on = !("href" in s) && s.id === tab;
            return (
              <li key={s.id}>
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px inline-flex min-h-12 items-center whitespace-nowrap border-b-2 px-4 font-semibold ${
                    on ? "border-accent text-accent" : "border-transparent text-ink hover:text-accent"
                  }`}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "general" && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section aria-label="Church details" className={card}>
            <h2 className="text-lg font-bold">Church details</h2>
            <p className="mb-4 text-sm text-ink-soft">Basic information used across the system.</p>
            <AdminForm action={saveChurchSettingsAction} submitLabel="Save changes" variant="red">
              <label className="block font-medium">
                Church name
                <input name="churchName" defaultValue={settings.churchName} required minLength={SETTING_LIMITS.churchName.min} maxLength={SETTING_LIMITS.churchName.max} autoComplete="off" className={input} />
                <Help>Printed on the QR signs.</Help>
              </label>
              <label className="block font-medium">
                Campus / location
                <input name="campus" defaultValue={settings.campus} maxLength={SETTING_LIMITS.campus.max} autoComplete="off" placeholder="Optional" className={input} />
                <Help>Printed under the church name on the QR signs when it is filled in.</Help>
              </label>
              <label className="block font-medium">
                System name
                <input name="systemName" defaultValue={settings.systemName} required minLength={SETTING_LIMITS.systemName.min} maxLength={SETTING_LIMITS.systemName.max} autoComplete="off" className={input} />
                <Help>Shown in the team&apos;s side menu and in the welcome on the home page.</Help>
              </label>
              <label className="block font-medium">
                Time zone
                <select disabled defaultValue="Africa/Lagos" className={`${input} bg-page text-ink-soft`} aria-describedby="tz-help">
                  <option value="Africa/Lagos">(GMT+01:00) Africa/Lagos</option>
                </select>
                <span id="tz-help" className="mt-1 block text-sm font-normal text-ink-soft">
                  Fixed. It decides when each service day starts and ends, so changing it would move every record and report.
                </span>
              </label>
            </AdminForm>
          </section>

          <section aria-label="System preferences" className={card}>
            <h2 className="text-lg font-bold">System preferences</h2>
            <p className="mb-4 text-sm text-ink-soft">How the system works for your team.</p>
            <AdminForm action={savePreferenceSettingsAction} submitLabel="Save changes" variant="red">
              <label className="block font-medium">
                Default search method
                <select name="defaultSearch" defaultValue={settings.defaultSearch} className={input}>
                  {SEARCH_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <Help>The tab attendants see first in Manual Lookup. They can still switch.</Help>
              </label>
              <label className="block font-medium">
                Staff session length
                <select name="staffSessionHours" defaultValue={String(settings.staffSessionHours)} className={input}>
                  {SESSION_HOUR_CHOICES.map((h) => (
                    <option key={h} value={h}>
                      {h} hours{h === 12 ? " (standard)" : ""}
                    </option>
                  ))}
                </select>
                <Help>How long a team member stays signed in. It applies to people who sign in after you save, and can only be 12 hours or shorter.</Help>
              </label>
            </AdminForm>
            <p className="mt-4 rounded-xl bg-page p-3 text-sm text-ink-soft">
              The rules that protect the exit check, such as one open visit for each car and member plates being locked, are not settings and cannot be
              switched off. See{" "}
              <Link href="/admin/settings?tab=rules" className="font-semibold text-accent underline">
                Vehicle rules
              </Link>
              .
            </p>
          </section>
        </div>
      )}

      {tab === "rules" && (
        <>
          <p className="text-ink-soft">
            These rules are built into the system and are shown here to read. They protect the exit check, so they cannot be switched off from this screen.
            To change one, ask the developer: it is a code change, recorded as a decision.
          </p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-label="Vehicle identification" className={card}>
              <h2 className="text-lg font-bold">Vehicle identification</h2>
              <dl className="divide-y divide-edge/15">
                <Row label="Number plates">Stored in capitals, letters and digits only, shown like PHC 234 AB</Row>
                <Row label="Searching">Capitals and spaces do not matter; 0 and O, 1 and I match each other</Row>
                <Row label="Cars per member">Up to {MAX_MEMBER_VEHICLES}</Row>
                <Row label="A saved car shows NEW CAR for">{NEW_CAR_DAYS} days</Row>
              </dl>
            </section>
            <section aria-label="Check-in and release rules" className={card}>
              <h2 className="text-lg font-bold">Check-in and release</h2>
              <dl className="divide-y divide-edge/15">
                <Row label="Open visits for one car">Only one at a time</Row>
                <Row label="Two claims on one plate">The first claim on the day wins; the second is refused and raises an alert</Row>
                <Row label="A member&apos;s plate">Locked to members; a guest claim is refused and raises an alert</Row>
                <Row label="A pass works">Only on the day it was issued</Row>
                <Row label="Releasing a car">Only by signed-in staff, checked against the real car; every release is audited</Row>
                <Row label="A car that does not match">Held until a coordinator clears it with a reason</Row>
              </dl>
            </section>
            <section aria-label="Service selection rules" className={card}>
              <h2 className="text-lg font-bold">Service selection rules</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Pick the next service that starts within 30 minutes.</li>
                <li>Otherwise pick the service in progress.</li>
                <li>Otherwise pick the next service that day.</li>
              </ol>
              <p className="mt-2 text-sm text-ink-soft">
                Time zone: Africa/Lagos. The driver can change the service. The times themselves are set on the{" "}
                <Link href="/admin/services" className="font-semibold text-accent underline">
                  Services
                </Link>{" "}
                screen.
              </p>
            </section>
            <section aria-label="Security limits" className={card}>
              <h2 className="text-lg font-bold">Security limits</h2>
              <dl className="divide-y divide-edge/15">
                <Row label="Check-ins per phone number">{RATE_LIMITS.phone.max} an hour</Row>
                <Row label="Check-ins per internet address">
                  {RATE_LIMITS.ip.max} in {RATE_LIMITS.ip.windowMinutes} minutes
                </Row>
                <Row label="Wrong PINs before a pause">
                  {PIN_LIMITS.pause.max}, then {PIN_LIMITS.pause.windowMinutes} minutes
                </Row>
                <Row label="Wrong PINs before the account locks">{PIN_LIMITS.daily.max} in a day (an admin resets it)</Row>
                <Row label="Members stay signed in for">{days(MEMBER_SESSION_SECONDS)}</Row>
              </dl>
            </section>
          </div>
        </>
      )}

      {tab === "notifications" && (
        <section aria-label="Notifications" className={`${card} max-w-3xl`}>
          <h2 className="text-lg font-bold">Notifications</h2>
          <p className="mt-2">
            The system does not send emails, text messages or push notifications, so there is nothing to switch on or off here. Instead, alerts appear on
            the Live Parking board as soon as they happen, and the Live tab shows how many are open: a car that does not match, a second check-in for a car
            already checked in, and a guest using a member&apos;s plate. Every alert is also kept in the reports.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/staff/dashboard" className="font-semibold text-accent underline">
              Open Live Parking
            </Link>
            <Link href="/admin/reports?category=alerts" className="font-semibold text-accent underline">
              Alert reports
            </Link>
          </p>
        </section>
      )}

      {tab === "system" && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-label="The system" className={card}>
              <h2 className="text-lg font-bold">The system</h2>
              <dl className="divide-y divide-edge/15">
                <Row label="Church">{settings.churchName}</Row>
                <Row label="Address of the app">{host}</Row>
                <Row label="Time zone">Africa/Lagos (no clock changes)</Row>
                <Row label="Version">v{pkg.version}</Row>
                <Row label="Guest records kept for">24 months, then deleted every night</Row>
                <Row label="Open visits at midnight">Closed as missed at 00:00 Lagos time</Row>
              </dl>
            </section>
            <section aria-label="Backups and resets" className={card}>
              <h2 className="text-lg font-bold">Backups, restores and resets</h2>
              <p className="mt-2">
                These are done on the server by the developer, not from this screen, so there are no backup or reset buttons here. The activity log below is
                never cleared from the app: it is the record of who did what.
              </p>
            </section>
          </div>

          <section aria-label="Activity log" className={card}>
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
      )}
    </>
  );
}
