"use server";

import { z } from "zod";
import { correctVisit, resolveAlert, sweepVisit } from "@/lib/db";
import {
  canCorrect,
  checkReason,
  CORRECTION_ACTIONS,
  CORRECTION_MESSAGES,
} from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export type OpsResult = { ok: true; message?: string } | { ok: false; message: string };

/** Coordinators and admins only. Checked here on the server for every action. */
async function coordinator() {
  const staff = await currentStaff();
  return staff && canCorrect(staff.role) ? staff : null;
}

export async function resolveAlertAction(alertId: number): Promise<OpsResult> {
  const staff = await coordinator();
  if (!staff) return { ok: false, message: "Please sign in again." };
  if (!z.number().int().positive().safeParse(alertId).success) return { ok: false, message: "Please try again." };
  await resolveAlert(alertId, staff.id);
  return { ok: true };
}

/** Sweep: "Gone" closes the visit as missed. "Still here" keeps it open and carries it over (OP-2). */
export async function sweepAction(visitId: string, gone: boolean, serviceId: number): Promise<OpsResult> {
  const staff = await coordinator();
  if (!staff) return { ok: false, message: "Please sign in again." };
  if (!z.string().uuid().safeParse(visitId).success || !Number.isInteger(serviceId)) {
    return { ok: false, message: "Please try again." };
  }
  const result = await sweepVisit(visitId, staff.id, gone, serviceId);
  if (result === "ok") return { ok: true };
  return {
    ok: false,
    message: result === "bad_state" ? "This car was already released or closed." : "We cannot find this car.",
  };
}

const correctionSchema = z.object({
  visitId: z.string().uuid(),
  action: z.enum(CORRECTION_ACTIONS),
  reason: z.string().max(500),
  areaId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
});

/** Corrections (OP-3): change area or service, undo a release, close a visit. A reason is required and the change is audited. */
export async function correctAction(input: z.input<typeof correctionSchema>): Promise<OpsResult> {
  const staff = await coordinator();
  if (!staff) return { ok: false, message: "Only a coordinator can make corrections." };

  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CORRECTION_MESSAGES.bad_input };

  const reason = checkReason(parsed.data.reason);
  if (!reason.ok) return { ok: false, message: reason.message };

  const result = await correctVisit({
    visitId: parsed.data.visitId,
    staffId: staff.id,
    action: parsed.data.action,
    reason: reason.reason,
    areaId: parsed.data.areaId,
    serviceId: parsed.data.serviceId,
  });
  return result === "ok"
    ? { ok: true, message: CORRECTION_MESSAGES.ok }
    : { ok: false, message: CORRECTION_MESSAGES[result] };
}
