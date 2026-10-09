import Link from "next/link";
import { redirect } from "next/navigation";
import { IconSettings } from "@/components/icons";
import { MemberNav } from "@/components/MemberNav";
import { TitleHeader } from "@/components/TitleHeader";
import { redButton } from "@/components/ui";
import { UnderlineTabs } from "@/components/UnderlineTabs";
import { VisitRow } from "@/components/VisitRow";
import { listMemberVehicles, memberHistory, openPassTokenForMember } from "@/lib/db";
import { currentMember } from "@/lib/member-auth";
import { lagosDate } from "@/lib/rules";
import { AddVehicleForm } from "./AccountForms";
import { AddVehicleToggle, VehicleItem } from "./VehicleItem";

export const dynamic = "force-dynamic";

const SAFE_NEXT = /^\/c\/[a-z0-9-]{1,40}$/;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; tab?: string; next?: string }>;
}) {
  const member = await currentMember();
  if (!member) redirect("/account/signin");
  const { welcome, tab, next = "" } = await searchParams;
  const showHistory = tab === "history";
  const backToCheckIn = SAFE_NEXT.test(next) ? next : null;

  const [vehicles, history, passToken] = await Promise.all([
    listMemberVehicles(member.id),
    memberHistory(member.id),
    openPassTokenForMember(member.id, lagosDate(new Date())),
  ]);
  const nextQuery = backToCheckIn ? `&next=${encodeURIComponent(backToCheckIn)}` : "";

  return (
    <>
      <TitleHeader
        title="My Account"
        right={
          <Link
            href="/account/more"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15"
          >
            <IconSettings className="h-6 w-6" />
          </Link>
        }
      />
      <main className="mx-auto max-w-md space-y-5 px-4 pb-28 pt-5">
        <h2 className="sr-only">Hello, {member.full_name.split(" ")[0]}</h2>

        {welcome && (
          <div className="rounded-card border-2 border-accent bg-blush p-5">
            <h2 className="text-lg font-bold">Keep this app on your phone</h2>
            <p className="mt-1">
              <strong>Android (Chrome):</strong> tap the menu (three dots), then &quot;Add to Home
              screen&quot;.
            </p>
            <p className="mt-1">
              <strong>iPhone (Safari):</strong> tap Share, then &quot;Add to Home Screen&quot;.
            </p>
            <p className="mt-2">First, save your car below.</p>
          </div>
        )}

        {backToCheckIn && (
          <Link href={backToCheckIn} className={redButton}>
            Back to check-in
          </Link>
        )}

        {passToken && (
          <Link href={`/p/${passToken}`} className={redButton}>
            Show my pass
          </Link>
        )}

        <UnderlineTabs
          label="My account"
          tabs={[
            { label: "Vehicles", href: `/account?tab=vehicles${nextQuery}`, active: !showHistory },
            { label: "History", href: `/account?tab=history${nextQuery}`, active: showHistory },
          ]}
        />

        {!showHistory ? (
          <>
            <section className="space-y-3">
              <AddVehicleToggle
                title="My vehicles"
                startOpen={vehicles.length === 0 || Boolean(welcome) || Boolean(backToCheckIn)}
              >
                <AddVehicleForm />
              </AddVehicleToggle>
              {vehicles.length === 0 ? (
                <p className="rounded-card bg-card p-5 shadow-sm">You have no saved cars yet.</p>
              ) : (
                <ul className="divide-y divide-edge/15 rounded-card bg-card px-4 shadow-sm">
                  {vehicles.map((v) => (
                    <VehicleItem key={v.id} vehicle={v} />
                  ))}
                </ul>
              )}
            </section>

            {history.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">Recent visits</h2>
                  <Link href="/account?tab=history" className="font-semibold text-accent underline">
                    View all
                  </Link>
                </div>
                <ul className="divide-y divide-edge/15 rounded-card bg-card px-4 shadow-sm">
                  {history.slice(0, 3).map((h) => (
                    <VisitRow key={h.reference + h.service_date} visit={h} />
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Parking history</h2>
            {history.length === 0 ? (
              <p className="rounded-card bg-card p-5 shadow-sm">No visits yet.</p>
            ) : (
              <ul className="divide-y divide-edge/15 rounded-card bg-card px-4 shadow-sm">
                {history.map((h) => (
                  <VisitRow key={h.reference + h.service_date} visit={h} />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <MemberNav active={showHistory ? "history" : "vehicles"} />
    </>
  );
}
