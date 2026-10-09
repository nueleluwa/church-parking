import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AreaCard } from "@/components/AreaCard";
import { IconCheck } from "@/components/icons";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { TitleHeader } from "@/components/TitleHeader";
import { redButton } from "@/components/ui";
import {
  getAreaBySlug,
  getPassByToken,
  listActiveServices,
  listMemberVehicles,
  openPassTokensByVehicle,
} from "@/lib/db";
import { currentMember } from "@/lib/member-auth";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { hasServiceToday, lagosDate, passState, pickService, servicesForCheckIn } from "@/lib/rules";
import { GuestEntry } from "./GuestEntry";
import { GuestForm } from "./GuestForm";
import { MemberCheckIn } from "./MemberCheckIn";

export const dynamic = "force-dynamic";

const hhmm = (t: string) => t.slice(0, 5);

export default async function CheckInPage({ params }: { params: Promise<{ area: string }> }) {
  const { area: slug } = await params;
  const area = await getAreaBySlug(slug);
  if (!area) notFound();

  const now = new Date();
  const today = lagosDate(now);

  // CI-6: if this phone already has a live pass, offer it first.
  const token = await rememberedPassToken();
  const existing = token ? await getPassByToken(token) : null;
  const hasLivePass =
    existing &&
    passState({ status: existing.status, serviceDate: existing.service_date, today }) === "valid";

  const member = await currentMember();
  const savedVehicles = member ? await listMemberVehicles(member.id) : [];
  const passByVehicle = member ? await openPassTokensByVehicle(member.id, today) : {};
  const vehicles = savedVehicles.map((v) => ({ ...v, passToken: passByVehicle[v.id] }));

  // Only services that have not finished are offered (a driver can't pick one that ended).
  const allServices = await listActiveServices();
  const open = servicesForCheckIn(now, allServices);
  const picked = pickService(now, open) ?? open[0];
  const services = open.map((s) => ({
    id: s.id,
    name: s.name,
    time: `${hhmm(s.starts_at)} to ${hhmm(s.ends_at)}`,
  }));
  const noServiceMessage = hasServiceToday(now, allServices)
    ? "The services have finished for today. Please see an attendant."
    : "There is no service today. Check-in opens on Sunday.";
  const addVehicleHref = `/account?next=${encodeURIComponent(`/c/${area.slug}`)}`;

  // A member with saved cars: choose a car, then Check in. That flow draws its own title header.
  if (member && vehicles.length > 0) {
    return (
      <MemberCheckIn
        areaSlug={area.slug}
        areaName={area.name}
        addVehicleHref={addVehicleHref}
        vehicles={vehicles}
        services={services}
        defaultServiceId={picked?.id ?? 0}
        noServiceMessage={noServiceMessage}
      />
    );
  }

  // Someone not signed in, with no pass yet and a service open: the welcome, then the guest form.
  if (!member && !hasLivePass && services.length > 0) {
    return (
      <GuestEntry
        areaSlug={area.slug}
        areaName={area.name}
        services={services}
        defaultServiceId={picked?.id ?? 0}
      />
    );
  }

  return (
    <>
      {member ? <TitleHeader title="Check In" backHref="/account" /> : <AppHeader />}
      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-6">
        <AreaCard name={area.name} />

        {member ? (
          <div className="space-y-3 rounded-card bg-card p-5 shadow-sm">
            <p>You have no saved cars yet. Save your car once, then check in with two taps.</p>
            <Link href={addVehicleHref} className={redButton}>
              Save my car
            </Link>
          </div>
        ) : hasLivePass ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-card border-2 border-success bg-success-soft p-5">
              <p className="flex items-center gap-2 font-bold">
                <IconCheck className="h-5 w-5 shrink-0" />
                You already have a pass on this phone.
              </p>
              <p className="text-sm text-ink-soft">
                Staying for more than one service? Your pass is good all day. You do not need to check in again.
              </p>
              <Link href={`/p/${token}`} className={redButton}>
                Show my pass
              </Link>
            </div>
            {services.length > 0 && (
              <details className="rounded-card bg-card p-5 shadow-sm">
                <summary className="cursor-pointer font-semibold text-accent underline">
                  Check in a different car
                </summary>
                <div className="mt-4">
                  <GuestForm areaSlug={area.slug} services={services} defaultServiceId={picked?.id ?? 0} />
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="rounded-card bg-card p-5 font-medium shadow-sm">{noServiceMessage}</p>
        )}

        <PrivacyNotice />
      </main>
    </>
  );
}
