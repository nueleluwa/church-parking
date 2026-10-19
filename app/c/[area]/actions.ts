"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  claimStore,
  getAreaBySlug,
  getPassByToken,
  listActiveServices,
  listMemberVehicles,
  openPassTokensByVehicle,
} from "@/lib/db";
import { qrFlowConfig, serverEnv } from "@/lib/env";
import { currentMember, ipKey } from "@/lib/member-auth";
import { rememberedPassTokens, rememberPass } from "@/lib/pass-cookie";
import {
  claimGuestVisit,
  claimMemberVisit,
  lagosDate,
  qrFlowEnabled,
  normalisePhone,
  normalisePlate,
  passState,
  pickService,
  servicesForCheckIn,
} from "@/lib/rules";
import { hashKey } from "@/lib/session";

/** `blocked` means the car was refused (already checked in, or a member's car): shown as a card, not a form error. */
export type CheckInState = { error?: string; blocked?: boolean; signInAgain?: boolean };

const schema = z.object({
  area: z.string().min(1).max(40),
  serviceId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  phone: z.string().trim().min(1, "Please enter your phone number."),
  plate: z.string().trim().min(1, "Please enter your plate number."),
  // The one-time key of this attempt (empty if the page had not finished starting up)
  key: z.union([z.literal(""), z.string().uuid()]).optional(),
});

const MESSAGES = {
  plate_conflict: "This car is already checked in. Please see an attendant.",
  member_plate: "We can't check in this car here. Please see an attendant.",
  vehicle_inactive: "This vehicle is not active. Please see an attendant.",
  rate_limited: "Too many tries. Please wait a few minutes, or see an attendant.",
  member_has_open_visit: "You already have a car checked in. Check it out first, or see an attendant.",
  qr_sign: "This car park uses phone check-in. Please scan the sign again, or see an attendant.",
  finished: "The services have finished for today. Please see an attendant.",
  bad_service: "Please choose a service that has not finished.",
} as const;

export async function checkInAsGuest(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const { area: areaSlug, serviceId, name, key } = parsed.data;

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) {
    return { error: "Please check your phone number. Example: 0803 123 4567, or +44 7700 900123 from abroad." };
  }

  const plate = normalisePlate(parsed.data.plate);
  if (plate.length < 4 || plate.length > 10) {
    return { error: "Please check your plate number." };
  }

  const secret = serverEnv().SESSION_SECRET;
  // Independent reads, asked together so the driver waits for the slowest one, not the sum
  const [area, heldTokens, services, ip] = await Promise.all([
    getAreaBySlug(areaSlug),
    rememberedPassTokens(),
    listActiveServices(),
    ipKey("ip", secret),
  ]);
  if (!area) return { error: "This parking sign isn't working. Please see an attendant." };
  // A car park on phone check-in does not take guests: this action can be called directly, so the page not offering it is not enough
  if (qrFlowEnabled(qrFlowConfig(), area.slug)) return { error: MESSAGES.qr_sign, blocked: true };

  const now = new Date();
  const today = lagosDate(now);

  // The same phone scanning again for the same car (staying for another service): show its pass.
  const held = await Promise.all(heldTokens.map(async (t) => ({ token: t, pass: await getPassByToken(t) })));
  const sameCar = held.find(
    ({ pass }) =>
      pass && pass.plate === plate && passState({ status: pass.status, serviceDate: pass.service_date, today }) === "valid",
  );
  if (sameCar) redirect(`/p/${sameCar.token}`);

  const open = servicesForCheckIn(now, services);
  if (open.length === 0) return { error: MESSAGES.finished };
  if (!open.some((s) => s.id === serviceId)) return { error: MESSAGES.bad_service };

  const result = await claimGuestVisit(claimStore, {
    name,
    phone,
    plate,
    serviceId,
    areaId: area.id,
    serviceDate: today,
    ipKey: ip ?? "",
    phoneKey: hashKey("phone", phone, secret),
    checkInKey: key || undefined,
  });

  if (result.status === "blocked") return { error: MESSAGES[result.reason], blocked: true };
  if (result.status === "rate_limited") return { error: MESSAGES.rate_limited };

  await rememberPass(result.token);
  redirect(`/p/${result.token}`);
}

const memberSchema = z.object({
  area: z.string().min(1).max(40),
  vehicleId: z.string().uuid("Please choose your car."),
  serviceId: z.coerce.number().int().positive().optional(),
  key: z.union([z.literal(""), z.string().uuid()]).optional(),
});

/**
 * Member check-in (CI-4): the member and their cars come from the session, never from the form.
 * A car that is already checked in today (staying for more services) just shows its pass.
 */
export async function checkInMember(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const member = await currentMember();
  // Their sign-in has ended (or they signed out in another tab): say so, and let the page offer a way back to this same check-in
  if (!member) return { error: "Your sign-in has ended. Please sign in again to check in.", signInAgain: true };

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please choose your car." };

  const now = new Date();
  const today = lagosDate(now);

  // Independent reads, asked together so the member waits for the slowest one, not the sum
  const [area, vehicles, openTokens, services] = await Promise.all([
    getAreaBySlug(parsed.data.area),
    listMemberVehicles(member.id),
    openPassTokensByVehicle(member.id, today),
    listActiveServices(),
  ]);
  if (!area) return { error: "This parking sign isn't working. Please see an attendant." };
  if (qrFlowEnabled(qrFlowConfig(), area.slug)) return { error: MESSAGES.qr_sign, blocked: true };

  const vehicle = vehicles.find((v) => v.id === parsed.data.vehicleId);
  if (!vehicle) return { error: "We cannot check in this car. Please see an attendant." };

  const existing = openTokens[vehicle.id];
  if (existing) {
    await rememberPass(existing);
    redirect(`/p/${existing}`);
  }

  const open = servicesForCheckIn(now, services);
  if (open.length === 0) return { error: MESSAGES.finished };
  const service = parsed.data.serviceId
    ? open.find((s) => s.id === parsed.data.serviceId)
    : (pickService(now, open) ?? open[0]);
  if (!service) return { error: MESSAGES.bad_service };

  const result = await claimMemberVisit(claimStore, {
    memberId: member.id,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    serviceId: service.id,
    areaId: area.id,
    serviceDate: today,
    checkInKey: parsed.data.key || undefined,
  });
  if (result.status === "blocked") {
    return {
      error:
        result.reason === "plate_conflict"
          ? MESSAGES.plate_conflict
          : result.reason === "vehicle_inactive"
            ? MESSAGES.vehicle_inactive
            : result.reason === "member_has_open_visit"
              ? MESSAGES.member_has_open_visit
              : "We cannot check in this car. Please see an attendant.",
      blocked: true,
    };
  }

  await rememberPass(result.token);
  redirect(`/p/${result.token}`);
}
