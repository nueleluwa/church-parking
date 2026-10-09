"use client";

import Link from "next/link";
import { useState } from "react";
import { IconUser } from "@/components/icons";
import { primaryButton, secondaryButton } from "@/components/ui";
import { GuestForm } from "./GuestForm";

type Props = {
  areaSlug: string;
  areaName?: string;
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
};

/**
 * The welcome for someone who is not signed in: sign in as a member (fastest), or continue
 * as a guest, which opens the short guest form. The car park already comes from the QR sign.
 */
export function GuestEntry({ areaSlug, services, defaultServiceId }: Props) {
  const [guest, setGuest] = useState(false);
  const next = encodeURIComponent(`/c/${areaSlug}`);

  if (guest) {
    return (
      <GuestForm
        areaSlug={areaSlug}
        services={services}
        defaultServiceId={defaultServiceId}
        onBack={() => setGuest(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-ink-soft">
        Check in your car and get your digital parking pass in seconds.
      </p>
      <ol className="space-y-1 text-sm text-ink-soft">
        <li>1. Choose how to continue.</li>
        <li>2. Check in your car.</li>
        <li>3. Show your pass at the exit.</li>
      </ol>
      <div className="space-y-3">
        <Link href={`/account/signin?next=${next}`} className={primaryButton}>
          Sign in to my account
        </Link>
        <button type="button" onClick={() => setGuest(true)} className={secondaryButton}>
          <IconUser className="h-5 w-5" />
          Continue as guest
        </button>
      </div>
      <p className="text-center">
        New member?{" "}
        <Link href={`/account/signup?next=${next}`} className="font-semibold text-accent underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
