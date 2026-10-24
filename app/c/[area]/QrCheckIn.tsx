"use client";

import { useActionState, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AreaCard } from "@/components/AreaCard";
import { IconCheck } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Spinner } from "@/components/Spinner";
import { TitleHeader } from "@/components/TitleHeader";
import { errorBox, field, redButton } from "@/components/ui";
import { VehicleImage } from "@/components/VehicleImage";
import { describeVehicle } from "@/lib/rules/vehicle";
import { confirmCheckIn, lookupMember, type QrCheckInState } from "./qr-actions";

/**
 * The QR check-in: type the phone number, then confirm the registered vehicle. Nobody is registered here; a number that is not
 * a member is sent to parking staff. This draws the whole screen, header included, because the title changes with the step.
 */
export function QrCheckIn({ areaSlug, areaName, closedMessage }: { areaSlug: string; areaName: string; closedMessage: string | null }) {
  const [found, lookup, looking] = useActionState<QrCheckInState, FormData>(lookupMember, {});
  const [confirmed, confirm, confirming] = useActionState<QrCheckInState, FormData>(confirmCheckIn, {});
  const [leftAt, setLeftAt] = useState<QrCheckInState | null>(null);
  const [phone, setPhone] = useState("");

  const onConfirm = found.step === "confirm" && leftAt !== found && Boolean(found.vehicles?.length);
  const cars = found.vehicles ?? [];

  return (
    <>
      {/* The first screen after a scan carries the church logo; the confirmation step has its own title and a way back */}
      {onConfirm ? <TitleHeader title="Confirm Check In" onBack={() => setLeftAt(found)} /> : <AppHeader />}
      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-6">
        {!onConfirm && <h1 className="sr-only">Check In</h1>}
        <AreaCard name={areaName} />

        {closedMessage && <p className="rounded-card bg-card p-5 font-medium shadow-sm">{closedMessage}</p>}

        {!closedMessage && !onConfirm && (
          <form action={lookup} noValidate className="space-y-4 rounded-card bg-card p-5 shadow-sm">
            <input type="hidden" name="area" value={areaSlug} />
            <label className="block text-lg font-semibold">
              Your phone number
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0803 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={field}
              />
            </label>
            {found.error && (
              <p role="alert" className={errorBox}>
                {found.error}
              </p>
            )}
            <button disabled={looking} className={redButton}>
              {looking && <Spinner />}
              {looking ? "Please wait..." : "Continue"}
            </button>
            <p className="text-center text-sm text-ink-soft">Not registered yet? Please see parking staff.</p>
          </form>
        )}

        {!closedMessage && onConfirm && (
          <form action={confirm} noValidate className="space-y-5">
            <input type="hidden" name="area" value={areaSlug} />
            <input type="hidden" name="phone" value={found.phone} />

            <fieldset className="space-y-3">
              <legend className="text-lg font-bold">{cars.length > 1 ? "Which car are you parking?" : "Is this your car?"}</legend>
              {cars.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-edge/15 bg-card p-3 has-[:checked]:border-accent has-[:checked]:bg-blush">
                  <input type="radio" name="vehicleId" value={v.id} defaultChecked={cars.length === 1} required className="h-5 w-5 accent-accent" />
                  <span className="flex flex-1 flex-col items-center text-center">
                    <VehicleImage size="lg" />
                    <Plate plate={v.plate} size="lg" variant="plain" className="mt-1" />
                    {describeVehicle(v) && <span className="mt-1 text-base font-medium text-ink-soft">{describeVehicle(v)}</span>}
                  </span>
                </label>
              ))}
            </fieldset>

            {confirmed.error && (
              <p role="alert" className={errorBox}>
                {confirmed.error}
              </p>
            )}

            <button name="confirm" value="yes" disabled={confirming} className={redButton}>
              {confirming ? <Spinner /> : <IconCheck />}
              {confirming ? "Please wait..." : "Yes, check me in"}
            </button>
            <button type="button" onClick={() => setLeftAt(found)} disabled={confirming} className="w-full text-center font-semibold text-accent underline">
              Use a different phone number
            </button>
          </form>
        )}

        <PrivacyNotice />
      </main>
    </>
  );
}
