import Link from "next/link";
import { requireStaff } from "@/lib/staff-auth";
import { card } from "../ui";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/** There is nothing to switch here: the system sends no emails, texts or push messages. Alerts are on the Live Parking board. */
export default async function NotificationsPage() {
  await requireStaff("admin");
  return (
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
  );
}
