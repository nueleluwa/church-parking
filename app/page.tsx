import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { IconCar, IconScan, IconUser } from "@/components/icons";
import { PMark } from "@/components/PMark";
import { card, pageMain, primaryButton, secondaryButton } from "@/components/ui";

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <>
      <AppHeader />
      <main className={pageMain}>
        {deleted && (
          <p role="status" className="rounded-2xl border-2 border-edge bg-blush p-3 text-center font-medium">
            Your account has been deleted.
          </p>
        )}

        <div className={`${card} text-center`}>
          <PMark className="mx-auto h-16 w-16 rounded-2xl text-4xl" />
          <h1 className="mt-4 text-2xl font-bold">Welcome to CCI Parking</h1>
          <p className="mt-2 text-ink-soft">Park, check in and get your pass in under a minute.</p>
        </div>

        <ol className="space-y-3">
          {[
            { icon: <IconScan />, text: "Park, then scan the sign in your car park." },
            { icon: <IconCar />, text: "Check in your car and get your pass." },
            { icon: <IconUser />, text: "Show your pass to the attendant when you leave." },
          ].map((step, i) => (
            <li key={i} className="flex items-center gap-4 rounded-card bg-panel px-5 py-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night text-white">
                {step.icon}
              </span>
              <span className="font-medium">{step.text}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-3 pt-2">
          <Link href="/account/signin" className={primaryButton}>
            Member sign-in
          </Link>
          <Link href="/account/signup" className={secondaryButton}>
            Create a member account
          </Link>
          <p className="pt-2 text-center">
            <Link href="/staff/signin" className="font-medium text-accent underline">
              Parking team sign-in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
