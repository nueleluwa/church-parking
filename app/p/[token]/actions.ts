"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { convertGuestToMember } from "@/lib/db";
import { hashPin, startMemberSession } from "@/lib/member-auth";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { PIN_PATTERN } from "@/lib/rules";

export type SaveDetailsState = { error?: string };

const schema = z
  .object({
    token: z.string().min(20).max(30),
    pin: z.string().regex(PIN_PATTERN, "Your PIN must be 4 numbers."),
    pin2: z.string(),
  })
  .refine((v) => v.pin === v.pin2, { message: "The two PINs are different.", path: ["pin2"] });

const MESSAGES = {
  not_found: "We cannot find this pass.",
  not_guest: "This pass already belongs to an account.",
  not_open: "This car has already left, so these details cannot be saved from this pass.",
  phone_taken: "This phone number already has an account. Please sign in instead.",
  plate_taken: "This car is already saved to an account. Please see the parking team.",
} as const;

/**
 * A guest saves the details they gave as a member account, by choosing a PIN (CI-7).
 * Only the phone that holds this pass can do it, and the PIN is the only new thing asked.
 */
export async function saveGuestDetails(_prev: SaveDetailsState, formData: FormData): Promise<SaveDetailsState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your PIN." };

  const { token, pin } = parsed.data;
  if ((await rememberedPassToken()) !== token) {
    return { error: "Please save your details from the phone that checked in." };
  }

  const result = await convertGuestToMember(token, await hashPin(pin));
  if (result.status !== "ok") return { error: MESSAGES[result.status] };

  await startMemberSession(result.memberId);
  redirect(`/p/${token}?saved=1`);
}
