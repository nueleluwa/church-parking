import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { IconCar } from "@/components/icons";
import { primaryButton } from "@/components/ui";
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

  const guestForm = (
    <GuestForm areaSlug={area.slug} services={services} defaultServiceId={picked?.id ?? 0} />
  );

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <div className="rounded-card bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-ink-soft">You are parking in</p>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <IconCar className="h-8 w-8 text-accent" />
            {area.name}
          </h1>

          {member ? (
            <div className="mt-5">
              {vehicles.length === 0 ? (
                <div className="space-y-3">
                  <p>You have no saved cars yet. Save your car once, then check in with two taps.</p>
                  <Link href="/account" className={primaryButton}>
                    Save my car
                  </Link>
                </div>
              ) : (
                <MemberCheckIn
                  areaSlug={area.slug}
                  vehicles={vehicles}
                  services={services}
                  defaultServiceId={picked?.id ?? 0}
                  noServiceMessage={noServiceMessage}
                />
              )}
              <p className="mt-4 text-center">
                <Link href="/account" className="font-medium text-accent underline">
                  My account
                </Link>
              </p>
            </div>
          ) : hasLivePass ? (
            <div className="mt-5 space-y-4">
              <div className="space-y-3">
                <p className="font-medium">You already have a pass on this phone.</p>
                <p className="text-sm text-ink-soft">
                  Staying for more than one service? Your pass is good all day. You don&apos;t need to check in again.
                </p>
                <Link href={`/p/${token}`} className={primaryButton}>
                  Show my pass
                </Link>
              </div>
              {services.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium text-accent underline">
                    Check in a different car
                  </summary>
                  <div className="mt-4">{guestForm}</div>
                </details>
              )}
            </div>
          ) : services.length === 0 ? (
            <p className="mt-5 font-medium">{noServiceMessage}</p>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="flex gap-3 text-center font-semibold">
                <Link href={`/account/signin?next=/c/${area.slug}`} className="flex-1 rounded-full border-2 border-edge bg-white px-4 py-3">
                  Sign in
                </Link>
                <Link href={`/account/signup?next=/c/${area.slug}`} className="flex-1 rounded-full border-2 border-edge bg-white px-4 py-3">
                  Create account
                </Link>
              </div>
              <p className="text-center font-medium text-ink-soft">or continue as a guest</p>
              {guestForm}
            </div>
          )}
        </div>

        <p className="px-2 text-sm text-ink-soft">
          We ask for your name, phone number and plate number so an attendant can check that the
          right person drives the car away. Only church parking staff can see them. We keep them for
          24 months, then delete them.
        </p>
      </main>
    </>
  );
}
