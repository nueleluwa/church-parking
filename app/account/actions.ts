"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addMemberVehicle,
  claimStore,
  createMember,
  deleteMember,
  removeMemberVehicle,
  setMemberPin,
} from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  checkMemberPin,
  currentMember,
  endMemberSession,
  hashPin,
  ipKey,
  PIN_MESSAGES,
  startMemberSession,
} from "@/lib/member-auth";
import { normalisePhone, normalisePlate, PIN_PATTERN } from "@/lib/rules";

export type FormState = { error?: string; ok?: string };

const pin = z.string().regex(PIN_PATTERN, "Your PIN must be 4 numbers.");

/** Only send people back to a check-in page on this site. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return /^\/c\/[a-z0-9-]{1,40}$/.test(next) ? next : "/account";
}

const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Please enter your name.").max(80),
    phone: z.string().trim().min(1, "Please enter your phone number."),
    pin,
    pin2: z.string(),
  })
  .refine((v) => v.pin === v.pin2, { message: "The two PINs are different.", path: ["pin2"] });

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) return { error: "Please check your phone number. Example: 0803 123 4567, or +44 7700 900123 from abroad." };

  // Slow down mass sign-ups from one place.
  const signupKey = await ipKey("signup-ip", serverEnv().SESSION_SECRET);
  if (signupKey) {
    const tries = await claimStore.countAttempts(signupKey, 60);
    await claimStore.recordAttempt(signupKey);
    // Generous, because a whole congregation may sign up from the church wifi on the same morning.
    if (tries >= 60) return { error: "Too many tries. Please wait a while, then try again." };
  }

  const id = await createMember(parsed.data.name, phone, await hashPin(parsed.data.pin));
  if (id === "phone_taken") {
    return { error: "This phone number already has an account. Please sign in instead." };
  }
  await startMemberSession(id);
  const next = safeNext(formData.get("next"));
  redirect(next === "/account" ? "/account?welcome=1" : next);
}

const signInSchema = z.object({
  phone: z.string().trim().min(1).max(30),
  pin: z.string().min(1).max(10),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  const phone = parsed.success ? normalisePhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return { error: PIN_MESSAGES.wrong };

  const result = await checkMemberPin(phone, parsed.data.pin);
  if (result.status !== "ok") return { error: PIN_MESSAGES[result.status] };

  await startMemberSession(result.memberId);
  redirect(safeNext(formData.get("next")));
}

export async function signOutMember(): Promise<void> {
  await endMemberSession();
  redirect("/");
}

export async function addVehicle(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await currentMember();
  if (!member) redirect("/account/signin");

  const plate = normalisePlate(String(formData.get("plate") ?? ""));
  if (plate.length < 4 || plate.length > 10) return { error: "Please check your plate number." };

  const result = await addMemberVehicle(member.id, plate);
  switch (result) {
    case "added":
      return { ok: "Car saved." };
    case "already_yours":
      return { error: "You have already saved this car." };
    case "too_many":
      return { error: "You can save up to 4 cars. Remove one first, or see the parking team." };
    default:
      return { error: "We cannot save this car. Please see the parking team." };
  }
}

export async function removeVehicle(formData: FormData): Promise<void> {
  const member = await currentMember();
  if (!member) redirect("/account/signin");
  const id = z.string().uuid().safeParse(formData.get("vehicleId"));
  if (id.success) await removeMemberVehicle(member.id, id.data);
  redirect("/account");
}

const changePinSchema = z
  .object({ current: z.string().min(1).max(10), pin, pin2: z.string() })
  .refine((v) => v.pin === v.pin2, { message: "The two new PINs are different.", path: ["pin2"] });

export async function changePin(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await currentMember();
  if (!member) redirect("/account/signin");

  const parsed = changePinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your PIN." };
  }

  const check = await checkMemberPin(member.phone, parsed.data.current);
  if (check.status !== "ok") {
    return { error: check.status === "wrong" ? "Your current PIN is wrong." : PIN_MESSAGES[check.status] };
  }
  await setMemberPin(member.id, await hashPin(parsed.data.pin));
  return { ok: "Your PIN has been changed." };
}

export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const member = await currentMember();
  if (!member) redirect("/account/signin");
  if (formData.get("confirm") !== "yes") return { error: "Please tick the box to confirm." };

  const check = await checkMemberPin(member.phone, String(formData.get("pin") ?? ""));
  if (check.status !== "ok") {
    return { error: check.status === "wrong" ? "Your PIN is wrong." : PIN_MESSAGES[check.status] };
  }
  await deleteMember(member.id);
  await endMemberSession();
  redirect("/?deleted=1");
}
