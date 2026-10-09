"use client";

import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AreaCard } from "@/components/AreaCard";
import { IconUser } from "@/components/icons";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { TitleHeader } from "@/components/TitleHeader";
import { outlineButton, redButton } from "@/components/ui";
import { GuestForm } from "./GuestForm";

type Props = {
  areaSlug: string;
  areaName: string;
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
};

/**
 * What someone sees when they scan a car park sign and are not signed in. It is the whole
 * screen, header included: the welcome has the logo header, and the guest form has a title
 * header with a back arrow, as in the member journey. The car park comes from the QR sign,
 * so there is nothing to choose.
 */
export function GuestEntry({ areaSlug, areaName, services, defaultServiceId }: Props) {
  const [guest, setGuest] = useState(false);
  const next = encodeURIComponent(`/c/${areaSlug}`);

  if (guest) {
    return (
      <>
        <TitleHeader title="Continue as guest" onBack={() => setGuest(false)} />
        <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-6">
          <p className="text-ink-soft">
            Enter your name, phone number and plate number. You do not need an account.
          </p>
          <GuestForm areaSlug={areaSlug} services={services} defaultServiceId={defaultServiceId} />
          <PrivacyNotice />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md space-y-6 px-4 pb-10 pt-6">
        <AreaCard name={areaName} />

        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Church Parking Made Simple</h1>
          <p className="mt-3 text-lg text-ink-soft">
            Scan, register and get your digital parking pass in seconds.
          </p>
        </div>

        <div className="space-y-3">
          <Link href={`/account/signin?next=${next}`} className={redButton}>
            Sign in to my account
          </Link>
          <button type="button" onClick={() => setGuest(true)} className={outlineButton}>
            <IconUser className="h-5 w-5" />
            Continue as guest
          </button>
          <p className="pt-1 text-center">
            New member?{" "}
            <Link href={`/account/signup?next=${next}`} className="font-semibold text-accent underline">
              Create an account
            </Link>
          </p>
        </div>

        <PrivacyNotice />
      </main>
    </>
  );
}
