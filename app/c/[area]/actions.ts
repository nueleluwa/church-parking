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
import { serverEnv } from "@/lib/env";
import { currentMember, ipKey } from "@/lib/member-auth";
import { rememberedPassToken, rememberPass } from "@/lib/pass-cookie";
import {
  claimGuestVisit,
  claimMemberVisit,
  lagosDate,
  normalisePhone,
  normalisePlate,
  passState,
  pickService,
  servicesForCheckIn,
} from "@/lib/rules";
import { hashKey } from "@/lib/session";

export type CheckInState = { error?: string };

const schema = z.object({
  area: z.string().min(1).max(40),
  serviceId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  phone: z.string().trim().min(1, "Please enter your phone number."),
  plate: z.string().trim().min(1, "Please enter your plate number."),
});

const MESSAGES = {
  plate_conflict: "This car is already checked in. Please see an attendant.",
  member_plate: "We can't check in this car here. Please see an attendant.",
  rate_limited: "Too many tries. Please wait a few minutes, or see an attendant.",
  finished: "The services have finished for today. Please see an attendant.",
  bad_service: "Please choose a service that has not finished.",
} as const;

export async function checkInAsGuest(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const { area: areaSlug, serviceId, name } = parsed.data;

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) {
    return { error: "Please check your phone number. Example: 0803 123 4567, or +44 7700 900123 from abroad." };
  }

  const plate = normalisePlate(parsed.data.plate);
  if (plate.length < 4 || plate.length > 10) {
    return { error: "Please check your plate number." };
  }

  const area = await getAreaBySlug(areaSlug);
  if (!area) return { error: "This parking sign isn't working. Please see an attendant." };

  const now = new Date();
  const today = lagosDate(now);

  // The same phone scanning again for the same car (staying for another service): show its pass.
  const heldToken = await rememberedPassToken();
  const held = heldToken ? await getPassByToken(heldToken) : null;
  if (
    held &&
    held.plate === plate &&
    passState({ status: held.status, serviceDate: held.service_date, today }) === "valid"
  ) {
    redirect(`/p/${heldToken}`);
  }

  const open = servicesForCheckIn(now, await listActiveServices());
  if (open.length === 0) return { error: MESSAGES.finished };
  if (!open.some((s) => s.id === serviceId)) return { error: MESSAGES.bad_service };

  const secret = serverEnv().SESSION_SECRET;
  const result = await claimGuestVisit(claimStore, {
    name,
    phone,
    plate,
    serviceId,
    areaId: area.id,
    serviceDate: today,
    ipKey: (await ipKey("ip", secret)) ?? "",
    phoneKey: hashKey("phone", phone, secret),
  });

  if (result.status === "blocked") return { error: MESSAGES[result.reason] };
  if (result.status === "rate_limited") return { error: MESSAGES.rate_limited };

  await rememberPass(result.token);
  redirect(`/p/${result.token}`);
}

const memberSchema = z.object({
  area: z.string().min(1).max(40),
  vehicleId: z.string().uuid("Please choose your car."),
  serviceId: z.coerce.number().int().positive().optional(),
});

/**
 * Member check-in (CI-4): the member and their cars come from the session, never from the form.
 * A car that is already checked in today (staying for more services) just shows its pass.
 */
export async function checkInMember(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const member = await currentMember();
  if (!member) return { error: "Please sign in again." };

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please choose your car." };

  const area = await getAreaBySlug(parsed.data.area);
  if (!area) return { error: "This parking sign isn't working. Please see an attendant." };

  const vehicle = (await listMemberVehicles(member.id)).find((v) => v.id === parsed.data.vehicleId);
  if (!vehicle) return { error: "We cannot check in this car. Please see an attendant." };

  const now = new Date();
  const today = lagosDate(now);

  const existing = (await openPassTokensByVehicle(member.id, today))[vehicle.id];
  if (existing) {
    await rememberPass(existing);
    redirect(`/p/${existing}`);
  }

  const open = servicesForCheckIn(now, await listActiveServices());
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
  });
  if (result.status === "blocked") {
    return {
      error:
        result.reason === "plate_conflict"
          ? MESSAGES.plate_conflict
          : "We cannot check in this car. Please see an attendant.",
    };
  }

  await rememberPass(result.token);
  redirect(`/p/${result.token}`);
}
