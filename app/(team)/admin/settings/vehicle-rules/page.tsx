import Link from "next/link";
import { MEMBER_SESSION_SECONDS } from "@/lib/member-token";
import { MAX_MEMBER_VEHICLES, NEW_CAR_DAYS, PIN_LIMITS, RATE_LIMITS } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { Row, card } from "../ui";

export const metadata = { title: "Vehicle rules" };
export const dynamic = "force-dynamic";

const days = (s: number) => `${Math.round(s / 86_400)} days`;

/** The rules the system runs on, to read. They protect the exit check, so there is no switch for any of them. */
export default async function VehicleRulesPage() {
  await requireStaff("admin");
  return (
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
            Time zone: Africa/Lagos. The driver can change the service. The times themselves are set in{" "}
            <Link href="/admin/settings/services" className="font-semibold text-accent underline">
              Services
            </Link>
            .
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
  );
}
