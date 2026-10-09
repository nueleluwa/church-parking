import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { secondaryButton } from "@/components/ui";
import { VehicleImage } from "@/components/VehicleImage";
import { listMemberVehicles, memberHistory, openPassTokenForMember } from "@/lib/db";
import { formatVisitTime } from "@/lib/format";
import { currentMember } from "@/lib/member-auth";
import { formatPlate, lagosDate, visitTone } from "@/lib/rules";
import { signOutMember } from "./actions";
import { AddVehicleForm, ChangePinForm, DeleteAccountForm } from "./AccountForms";
import { AddVehicleToggle, VehicleItem } from "./VehicleItem";

export const dynamic = "force-dynamic";

const STATUS = { parked: "Parked", released: "Left", missed: "Closed" } as const;
const SAFE_NEXT = /^\/c\/[a-z0-9-]{1,40}$/;

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {action}
      {children}
    </section>
  );
}

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
      <AppHeader />
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Hello, {member.full_name.split(" ")[0]}</h1>

        {welcome && (
          <div className="rounded-card border-4 border-edge bg-blush p-5">
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
          <Link
            href={backToCheckIn}
            className="block rounded-full bg-action px-6 py-4 text-center text-lg font-semibold text-white hover:bg-action-dark"
          >
            Back to check-in
          </Link>
        )}

        {passToken && (
          <Link
            href={`/p/${passToken}`}
            className="block rounded-full bg-action px-6 py-4 text-center text-lg font-semibold text-white hover:bg-action-dark"
          >
            Show my pass
          </Link>
        )}

        <nav aria-label="My account" className="grid grid-cols-2 rounded-full bg-panel p-1">
          {[
            { label: "Vehicles", href: `/account?tab=vehicles${nextQuery}`, active: !showHistory },
            { label: "History", href: `/account?tab=history${nextQuery}`, active: showHistory },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`rounded-full px-4 py-2.5 text-center font-semibold ${
                t.active ? "border-2 border-edge bg-card" : "border-2 border-transparent"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {!showHistory ? (
          <Section title="My vehicles">
            <div className="mb-4">
              <AddVehicleToggle startOpen={vehicles.length === 0 || Boolean(welcome) || Boolean(backToCheckIn)}>
                <AddVehicleForm />
              </AddVehicleToggle>
            </div>
            {vehicles.length === 0 ? (
              <p>You have no saved cars yet.</p>
            ) : (
              <ul className="space-y-3">
                {vehicles.map((v) => (
                  <VehicleItem key={v.id} vehicle={v} />
                ))}
              </ul>
            )}
          </Section>
        ) : (
          <Section title="Parking history">
            {history.length === 0 ? (
              <p>No visits yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => {
                  const row = (
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="whitespace-nowrap text-sm font-semibold text-ink-soft">
                          {formatVisitTime(h.checkedInAt)}
                        </p>
                        <StatusBadge tone={visitTone(h.status)} className="shrink-0">
                          {STATUS[h.status]}
                        </StatusBadge>
                      </div>
                      <div className="flex items-center gap-3">
                        <VehicleImage size="sm" />
                        <p className="min-w-0 whitespace-nowrap text-xl font-extrabold tracking-wide">
                          {formatPlate(h.plate)}
                        </p>
                      </div>
                      <p className="flex flex-nowrap gap-1.5 whitespace-nowrap text-sm text-ink-soft">
                        <span className="truncate">{h.serviceName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">{h.areaName}</span>
                      </p>
                    </div>
                  );
                  return (
                    <li key={h.reference + h.service_date}>
                      {h.passToken ? (
                        <Link
                          href={`/p/${h.passToken}`}
                          aria-label={`Open the pass for ${formatPlate(h.plate)}`}
                          className="flex rounded-2xl border-2 border-success bg-success-soft p-3"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex rounded-2xl border-2 border-edge/15 bg-card p-3">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        <details className="rounded-card bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-xl font-bold">Change my PIN</summary>
          <div className="mt-4">
            <ChangePinForm />
          </div>
        </details>

        <details className="rounded-card bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-xl font-bold">Delete my account</summary>
          <div className="mt-4">
            <DeleteAccountForm />
          </div>
        </details>

        <form action={signOutMember}>
          <button className={secondaryButton}>Sign out</button>
        </form>
      </main>
    </>
  );
}
