import Link from "next/link";
import { redirect } from "next/navigation";
import { IconChevronRight, IconPin } from "@/components/icons";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { TitleHeader } from "@/components/TitleHeader";
import { listActiveAreas } from "@/lib/db";

export const metadata = { title: "Check in" };
export const dynamic = "force-dynamic";

/**
 * "Where are you parking?": the general way in, for someone who opened the site without scanning a car park
 * sign. Choosing a car park goes to exactly the page its own QR sign opens (/c/<car park>), so there is one
 * check-in, however the driver arrives. Scanning a sign is a separate page (/scan), so the two ways never mix.
 */
export default async function ChooseCarParkPage({ searchParams }: { searchParams: Promise<{ scan?: string }> }) {
  const { scan } = await searchParams;
  if (scan === "1") redirect("/scan"); // an older link to the scanner
  const areas = await listActiveAreas();

  return (
    <>
      <TitleHeader title="Check In" backHref="/" />
      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-5">
        <div>
          <h1 className="text-2xl font-extrabold">Where are you parking?</h1>
          <p className="mt-1 text-ink-soft">Choose your car park to check in.</p>
        </div>

        {areas.length === 0 ? (
          <p className="rounded-card bg-card p-5 font-medium shadow-sm">No car park is open right now. Please see a parking attendant.</p>
        ) : (
          <ul className="space-y-3">
            {areas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/c/${a.slug}`}
                  className="flex items-center gap-3 rounded-card border-2 border-edge/15 bg-card p-4 shadow-sm hover:bg-page active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
                    <IconPin className="h-6 w-6" />
                  </span>
                  <span data-area className="min-w-0 flex-1 text-xl font-bold">
                    {a.name}
                  </span>
                  <IconChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <PrivacyNotice />
      </main>
    </>
  );
}
