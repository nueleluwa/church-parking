import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { IconCar, IconScan, IconUser } from "@/components/icons";
import { MemberNav } from "@/components/MemberNav";
import { PMark } from "@/components/PMark";
import { card, outlineButton, pageMain, redButton } from "@/components/ui";
import { openPassTokenForMember } from "@/lib/db";
import { currentMember } from "@/lib/member-auth";
import { lagosDate } from "@/lib/rules";

const STEPS = [
  { icon: <IconScan />, text: "Park, then scan the sign in your car park." },
  { icon: <IconCar />, text: "Check in your car and get your pass." },
  { icon: <IconUser />, text: "Show your pass to the attendant when you leave." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const member = await currentMember();
  const passToken = member ? await openPassTokenForMember(member.id, lagosDate(new Date())) : null;

  return (
    <>
      <AppHeader />
      <main className={`${pageMain} ${member ? "pb-28" : ""}`}>
        {deleted && (
          <p role="status" className="rounded-2xl border-2 border-success bg-success-soft p-3 text-center font-medium">
            Your account has been deleted.
          </p>
        )}

        <div className={`${card} text-center`}>
          <PMark className="mx-auto h-16 w-16 rounded-2xl text-4xl" />
          <h1 className="mt-4 text-2xl font-bold">
            {member ? `Welcome back, ${member.full_name.split(" ")[0]}` : "Welcome to CCI Parking"}
          </h1>
          <p className="mt-2 text-ink-soft">
            {member
              ? "Scan the sign in your car park to check in with two taps."
              : "Park, check in and get your pass in under a minute."}
          </p>
          {member && passToken && (
            <Link href={`/p/${passToken}`} className={`${redButton} mt-4`}>
              Show my pass
            </Link>
          )}
        </div>

        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-center gap-4 rounded-card bg-card px-5 py-4 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
                {step.icon}
              </span>
              <span className="font-medium">{step.text}</span>
            </li>
          ))}
        </ol>

        {!member && (
          <div className="space-y-3 pt-2">
            <Link href="/account/signin" className={redButton}>
              Member sign-in
            </Link>
            <Link href="/account/signup" className={outlineButton}>
              Create a member account
            </Link>
            <p className="pt-2 text-center">
              <Link href="/staff/signin" className="font-medium text-accent underline">
                Parking team sign-in
              </Link>
            </p>
          </div>
        )}
      </main>
      {member && <MemberNav active="home" />}
    </>
  );
}
