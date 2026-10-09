import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { IconCar } from "@/components/icons";
import { getAreaBySlug, getPassByToken, listActiveServices, listMemberVehicles } from "@/lib/db";
import { currentMember } from "@/lib/member-auth";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { lagosDate, passState, pickService } from "@/lib/rules";
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

  // CI-6: if this phone already has a live pass, offer it instead of a new form.
  const token = await rememberedPassToken();
  const existing = token ? await getPassByToken(token) : null;
  const hasLivePass =
    existing &&
    passState({ status: existing.status, serviceDate: existing.service_date, today }) === "valid";

  const member = await currentMember();
  const vehicles = member ? await listMemberVehicles(member.id) : [];

  const allServices = await listActiveServices();
  const sundayServices = allServices.filter((s) => s.weekday === Number(new Date(`${today}T12:00:00Z`).getUTCDay()));
  const picked = pickService(now, allServices);
  const services = sundayServices.map((s) => ({
    id: s.id,
    name: s.name,
    time: `${hhmm(s.starts_at)} to ${hhmm(s.ends_at)}`,
  }));

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

          {hasLivePass ? (
            <div className="mt-5 space-y-3">
              <p>You already have a pass on this phone.</p>
              <Link
                href={`/p/${token}`}
                className="block rounded-full bg-action px-6 py-4 text-center text-lg font-semibold text-white hover:bg-action-dark"
              >
                Show my pass
              </Link>
            </div>
          ) : services.length === 0 ? (
            <p className="mt-5">There is no service today. Check-in opens on Sunday.</p>
          ) : member ? (
            <div className="mt-5">
              {vehicles.length === 0 ? (
                <div className="space-y-3">
                  <p>You have no saved cars yet. Save your car once, then check in with two taps.</p>
                  <Link href="/account" className="block rounded-full bg-action px-6 py-4 text-center text-lg font-semibold text-white hover:bg-action-dark">
                    Save my car
                  </Link>
                </div>
              ) : (
                <MemberCheckIn
                  areaSlug={area.slug}
                  vehicles={vehicles}
                  services={services}
                  defaultServiceId={picked?.id ?? services[0].id}
                />
              )}
              <p className="mt-4 text-center">
                <Link href="/account" className="font-medium text-accent underline">
                  My account
                </Link>
              </p>
            </div>
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
              <GuestForm
                areaSlug={area.slug}
                services={services}
                defaultServiceId={picked?.id ?? services[0].id}
              />
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
