import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { IconCar, IconScan, IconUser } from "@/components/icons";
import { MemberNav } from "@/components/MemberNav";
import { PMark } from "@/components/PMark";
import { InstallApp } from "@/components/PwaSetup";
import { card, outlineButton, pageMain, quietButton, redButton } from "@/components/ui";
import { getSettings, openPassTokenForMember } from "@/lib/db";
import { qrFlowConfig } from "@/lib/env";
import { currentMember } from "@/lib/member-auth";
import { lagosDate, publicSignUpOpen } from "@/lib/rules";

const STEPS = [
  { icon: <IconScan />, text: "Park, then scan the sign in your car park." },
  { icon: <IconCar />, text: "Check in your car and get your pass." },
  { icon: <IconUser />, text: "Show your pass to the attendant when you leave." },
];

// Where phone check-in is on everywhere, members are added by the parking team and leave by the exit sign or the attendant
const STEPS_PHONE = [
  { icon: <IconScan />, text: "Park, then scan the sign in your car park." },
  { icon: <IconCar />, text: "Type your phone number and confirm your car." },
  { icon: <IconUser />, text: "When you leave, scan the exit sign, or show your pass to the attendant." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const member = await currentMember();
  const settings = await getSettings();
  const passToken = member ? await openPassTokenForMember(member.id, lagosDate(new Date())) : null;
  const signUpOpen = publicSignUpOpen(qrFlowConfig());
  const steps = signUpOpen ? STEPS : STEPS_PHONE;

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
            {member ? `Welcome back, ${member.full_name.split(" ")[0]}` : `Welcome to ${settings.systemName}`}
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

        <div className="space-y-3">
          <Link href="/c" className={redButton}>
            Check in
          </Link>
          <Link href="/scan" className={outlineButton}>
            <IconScan className="h-5 w-5" />
            Scan a car park sign
          </Link>
        </div>

        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-4 rounded-card bg-card px-5 py-4 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
                {step.icon}
              </span>
              <span className="font-medium">{step.text}</span>
            </li>
          ))}
        </ol>

        <InstallApp />

        {!member && signUpOpen && (
          <section aria-label="Members" className="rounded-card bg-card p-4 shadow-sm">
            <p className="text-center font-semibold">Already a member?</p>
            <p className="mt-0.5 text-center text-sm text-ink-soft">Sign in to check in with two taps.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link href="/account/signin" className={quietButton}>
                Sign in
              </Link>
              <Link href="/account/signup" className={quietButton}>
                Create an account
              </Link>
            </div>
          </section>
        )}
      </main>
      {member && <MemberNav active="home" />}
    </>
  );
}
