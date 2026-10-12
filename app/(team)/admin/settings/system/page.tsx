import Link from "next/link";
import { getSettings, listAuditEntries } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { requireStaff } from "@/lib/staff-auth";
import pkg from "@/package.json";
import { Row, card } from "../ui";

export const metadata = { title: "System" };
export const dynamic = "force-dynamic";

/** What the system is, and the activity log (who did what). Backups and resets are done on the server, not from here. */
export default async function SystemPage() {
  await requireStaff("admin");
  const [settings, log] = await Promise.all([getSettings(), listAuditEntries(60)]);
  const host = new URL(serverEnv().APP_URL).host;
  return (
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
  );
}
