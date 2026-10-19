"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { checkInWithCredential, claimStore, findCheckInVehicles, getAreaBySlug, getSettings, listActiveServices } from "@/lib/db";
import { qrFlowConfig, serverEnv } from "@/lib/env";
import { setExitCredential } from "@/lib/exit-cookie";
import { ipKey } from "@/lib/member-auth";
import { rememberPass } from "@/lib/pass-cookie";
import { lagosDate, localPhone, makeCredential, makePassToken, makeReference, pickService, qrFlowEnabled, servicesForCheckIn } from "@/lib/rules";
import { hashKey } from "@/lib/session";

/**
 * The QR check-in (phone number, then plate confirmation). It is used only for car parks the rollout setting turns on.
 * Nothing here creates a member or a guest: a number that is not a registered, active member with an active vehicle gets one
 * answer, "see parking staff", whichever of those it is.
 */
export type QrVehicle = { id: string; plate: string; make: string | null; colour: string | null };
export type QrCheckInState = {
  /** `confirm` once the number is recognised: the member picks and confirms their registered vehicle. */
  step?: "confirm";
  phone?: string;
  vehicles?: QrVehicle[];
  error?: string;
};

const MESSAGES = {
  badPhone: "Please enter your phone number, for example 0803 123 4567.",
  seeStaff: "We could not check you in with this number. Please see parking staff.",
  rateLimited: "Too many tries. Please wait a few minutes, or see parking staff.",
  otherArea: "You are already checked in at another car park. Please check out there first, or see parking staff.",
  plateConflict: "This car is already checked in. Please see parking staff.",
  finished: "The services have finished for today. Please see parking staff.",
  noSign: "This sign does not use phone check-in. Please see parking staff.",
  confirm: "Please confirm that this is your car.",
  generic: "Something went wrong. Please try again, or see parking staff.",
} as const;

const lookupSchema = z.object({ area: z.string().min(1).max(40), phone: z.string().trim().min(1).max(40) });

/** Step 1: the member types their phone number and sees the vehicle(s) registered to it. Creates nothing. */
export async function lookupMember(_prev: QrCheckInState, formData: FormData): Promise<QrCheckInState> {
  const parsed = lookupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: MESSAGES.badPhone };
  const local = localPhone(parsed.data.phone);
  if (!local) return { error: MESSAGES.badPhone };

  const area = await getAreaBySlug(parsed.data.area);
  if (!area || !qrFlowEnabled(qrFlowConfig(), area.slug)) return { error: MESSAGES.noSign };

  const secret = serverEnv().SESSION_SECRET;
  const settings = await getSettings();
  const [ip, phoneKey] = [await ipKey("lookup-ip", secret), hashKey("lookup-phone", local, secret)];

  // Rate limits: one address, and one phone number. Counted first, then recorded, so a refused try still counts.
  const [fromIp, fromPhone] = await Promise.all([
    ip ? claimStore.countAttempts(ip, 1) : Promise.resolve(0),
    claimStore.countAttempts(phoneKey, settings.lookupPhoneMinutes),
  ]);
  await Promise.all([ip ? claimStore.recordAttempt(ip) : Promise.resolve(), claimStore.recordAttempt(phoneKey)]);
  if (fromIp >= settings.lookupIpPerMinute || fromPhone >= settings.lookupPhoneMax) return { error: MESSAGES.rateLimited };

  const vehicles = await findCheckInVehicles(local);
  if (!vehicles) return { error: MESSAGES.seeStaff };
  return { step: "confirm", phone: local, vehicles };
}

const confirmSchema = z.object({
  area: z.string().min(1).max(40),
  phone: z.string().min(1).max(40),
  vehicleId: z.string().uuid(),
  confirm: z.literal("yes"),
});

/**
 * Step 2: the member confirms their vehicle. On success the server creates (or, for a repeat check-in at the same car park,
 * keeps) the visit, sets the checkout credential as an HttpOnly cookie, and shows the pass. The cookie is set only after the
 * database has said yes.
 */
export async function confirmCheckIn(_prev: QrCheckInState, formData: FormData): Promise<QrCheckInState> {
  const parsed = confirmSchema.safeParse(Object.fromEntries(formData));
  const again = (error: string): QrCheckInState => ({ error });
  if (!parsed.success) return again(formData.get("confirm") === "yes" ? MESSAGES.generic : MESSAGES.confirm);
  const local = localPhone(parsed.data.phone);
  if (!local) return again(MESSAGES.badPhone);

  const area = await getAreaBySlug(parsed.data.area);
  if (!area || !qrFlowEnabled(qrFlowConfig(), area.slug)) return again(MESSAGES.noSign);

  const now = new Date();
  const open = servicesForCheckIn(now, await listActiveServices());
  const service = pickService(now, open) ?? open[0];
  if (!service) return again(MESSAGES.finished);

  const secret = serverEnv().SESSION_SECRET;
  const settings = await getSettings();
  const credential = makeCredential();

  const answer = await checkInWithCredential({
    local,
    vehicleId: parsed.data.vehicleId,
    serviceId: service.id,
    areaId: area.id,
    serviceDate: lagosDate(now),
    credentialHash: credential.hash,
    credentialExpiresAt: new Date(now.getTime() + settings.credentialHours * 3_600_000),
    candidates: Array.from({ length: 5 }, () => ({ reference: makeReference(), token: makePassToken() })),
    phone: { key: hashKey("checkin-phone", local, secret), max: settings.lookupPhoneMax, minutes: settings.lookupPhoneMinutes },
    reissue: { key: hashKey("reissue-phone", local, secret), max: settings.reissueMax, minutes: settings.reissueMinutes },
  });

  switch (answer.status) {
    case "ok":
      // Only now, after the database said yes: the credential goes to this browser, and the pass is remembered on this phone
      await setExitCredential(credential.token, settings.credentialHours);
      await rememberPass(answer.token);
      redirect(`/p/${answer.token}`);
    case "unavailable":
      return again(MESSAGES.seeStaff);
    case "other_area":
      return again(MESSAGES.otherArea);
    case "rate_limited":
      return again(MESSAGES.rateLimited);
    case "blocked":
      return again(MESSAGES.plateConflict);
    default:
      return again(MESSAGES.generic);
  }
}
