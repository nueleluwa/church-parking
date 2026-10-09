"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { claimStore, getAreaBySlug, listActiveServices, listMemberVehicles } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { currentMember } from "@/lib/member-auth";
import { rememberPass } from "@/lib/pass-cookie";
import {
  claimGuestVisit,
  claimMemberVisit,
  lagosDate,
  normalisePhone,
  normalisePlate,
  pickService,
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
} as const;

export async function checkInAsGuest(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const { area: areaSlug, serviceId, name } = parsed.data;

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) return { error: "Please enter a Nigerian phone number, like 0803 123 4567." };

  const plate = normalisePlate(parsed.data.plate);
  if (plate.length < 4 || plate.length > 10) {
    return { error: "Please check your plate number." };
  }

  const area = await getAreaBySlug(areaSlug);
  if (!area) return { error: "This parking sign isn't working. Please see an attendant." };

  const services = await listActiveServices();
  if (!services.some((s) => s.id === serviceId)) {
    return { error: "Please choose a service." };
  }

  const secret = serverEnv().SESSION_SECRET;
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const result = await claimGuestVisit(claimStore, {
    name,
    phone,
    plate,
    serviceId,
    areaId: area.id,
    serviceDate: lagosDate(new Date()),
    ipKey: hashKey("ip", forwarded, secret),
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

/** Member check-in (CI-4): the member and their cars come from the session, never from the form. */
export async function checkInMember(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const member = await currentMember();
  if (!member) return { error: "Please sign in again." };

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please choose your car." };

  const area = await getAreaBySlug(parsed.data.area);
  if (!area) return { error: "This parking sign isn't working. Please see an attendant." };

  const services = await listActiveServices();
  const service = parsed.data.serviceId
    ? services.find((s) => s.id === parsed.data.serviceId)
    : pickService(new Date(), services);
  if (!service) return { error: "There is no service right now." };

  const vehicle = (await listMemberVehicles(member.id)).find((v) => v.id === parsed.data.vehicleId);
  if (!vehicle) return { error: "We cannot check in this car. Please see an attendant." };

  const result = await claimMemberVisit(claimStore, {
    memberId: member.id,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    serviceId: service.id,
    areaId: area.id,
    serviceDate: lagosDate(new Date()),
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
