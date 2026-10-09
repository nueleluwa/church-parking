import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { secondaryButton } from "@/components/ui";
import { listMemberVehicles, memberHistory, openPassTokenForMember } from "@/lib/db";
import { currentMember } from "@/lib/member-auth";
import { formatPlate, lagosDate } from "@/lib/rules";
import { removeVehicle, signOutMember } from "./actions";
import { AddVehicleForm, ChangePinForm, DeleteAccountForm } from "./AccountForms";

export const dynamic = "force-dynamic";

const STATUS = { parked: "Parked", released: "Left", missed: "Closed" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-card p-6 shadow-sm">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const member = await currentMember();
  if (!member) redirect("/account/signin");
  const { welcome } = await searchParams;

  const [vehicles, history, passToken] = await Promise.all([
    listMemberVehicles(member.id),
    memberHistory(member.id),
    openPassTokenForMember(member.id, lagosDate(new Date())),
  ]);

  return (
    <>
      <AppHeader title="My account" />
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

        {passToken && (
          <Link href={`/p/${passToken}`} className="block rounded-full bg-action px-6 py-4 text-center text-lg font-semibold text-white hover:bg-action-dark">
            Show my pass
          </Link>
        )}

        <Section title="My cars">
          {vehicles.length === 0 ? (
            <p className="mb-4">You have no saved cars yet.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {vehicles.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-xl bg-page px-4 py-3">
                  <span className="text-xl font-bold">{formatPlate(v.plate)}</span>
                  <form action={removeVehicle}>
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <button className="font-medium text-danger underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddVehicleForm />
        </Section>

        <Section title="My visits">
          {history.length === 0 ? (
            <p>No visits yet.</p>
          ) : (
            <ul className="divide-y divide-edge/20">
              {history.map((h) => (
                <li key={h.reference + h.service_date} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-semibold">{h.service_date}</span> · {h.serviceName}
                    <br />
                    <span className="text-sm text-ink-soft">
                      {formatPlate(h.plate)} · {h.areaName}
                    </span>
                  </span>
                  <span className="font-medium">{STATUS[h.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <details className="rounded-card bg-card p-6 shadow-sm">
          <summary className="cursor-pointer text-xl font-bold">Change my PIN</summary>
          <div className="mt-4">
            <ChangePinForm />
          </div>
        </details>

        <details className="rounded-card bg-card p-6 shadow-sm">
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
