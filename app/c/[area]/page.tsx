import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getAreaBySlug, getPassByToken, listActiveServices } from "@/lib/db";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { lagosDate, passState, pickService } from "@/lib/rules";
import { GuestForm } from "./GuestForm";

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
          <h1 className="text-3xl font-bold">{area.name}</h1>

          {hasLivePass ? (
            <div className="mt-5 space-y-3">
              <p>You already have a pass on this phone.</p>
              <Link
                href={`/p/${token}`}
                className="block rounded-full bg-brand px-6 py-4 text-center text-lg font-semibold text-white hover:bg-brand-dark"
              >
                Show my pass
              </Link>
            </div>
          ) : services.length === 0 ? (
            <p className="mt-5">There is no service today. Check-in opens on Sunday.</p>
          ) : (
            <div className="mt-5">
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
