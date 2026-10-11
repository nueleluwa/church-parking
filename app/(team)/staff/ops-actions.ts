"use server";

import { z } from "zod";
import { clearHold, correctVisit, openVisitServices, resolveAlert, sweepVisit } from "@/lib/db";
import {
  canCorrect,
  checkReason,
  CORRECTION_ACTIONS,
  CORRECTION_MESSAGES,
  describeBulk,
  type BulkItem,
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

export type BulkResult = { ok: boolean; message: string; done: string[]; failed: { visitId: string; message: string }[] };

/**
 * Marks several cars "Still here" in one go. Each car is its own audited decision (the same as marking it alone), the server looks up each
 * car's service itself, and the answer says exactly how many worked and why any did not. "Gone" is never done in bulk, and nothing here
 * releases a car.
 */
export async function sweepStillHereManyAction(visitIds: string[], sweepServiceId: number | null): Promise<BulkResult> {
  const staff = await coordinator();
  if (!staff) return { ok: false, message: "Please sign in again.", done: [], failed: [] };
  const parsed = z.array(z.string().uuid()).max(500).safeParse(visitIds);
  if (!parsed.success || (sweepServiceId !== null && !Number.isInteger(sweepServiceId))) return { ok: false, message: "Please try again.", done: [], failed: [] };

  const ids = [...new Set(parsed.data)];
  const services = await openVisitServices(ids);
  const items: BulkItem[] = [];
  for (const id of ids) {
    const service = sweepServiceId ?? services.get(id);
    if (service === undefined) {
      items.push({ visitId: id, ok: false, message: "already released or closed" });
      continue;
    }
    try {
      const result = await sweepVisit(id, staff.id, false, service);
      items.push(result === "ok" ? { visitId: id, ok: true } : { visitId: id, ok: false, message: result === "bad_state" ? "already released or closed" : "not found" });
    } catch {
      items.push({ visitId: id, ok: false, message: "a problem on our side" });
    }
  }
  const summary = describeBulk(items);
  return {
    ok: summary.ok,
    message: summary.message,
    done: items.filter((i) => i.ok).map((i) => i.visitId),
    failed: items.filter((i) => !i.ok).map((i) => ({ visitId: i.visitId, message: i.message ?? "" })),
  };
}

/** A coordinator clears a Does not match hold. A reason is required. */
export async function clearHoldAction(visitId: string, reason: string): Promise<OpsResult> {
  const staff = await coordinator();
  if (!staff) return { ok: false, message: "Only a coordinator can clear a hold." };
  if (!z.string().uuid().safeParse(visitId).success) return { ok: false, message: "Please try again." };
  const checked = checkReason(reason);
  if (!checked.ok) return { ok: false, message: checked.message };
  const result = await clearHold(visitId, staff.id, checked.reason);
  if (result === "ok") return { ok: true, message: "Hold cleared. The car can be released." };
  if (result === "bad_state") return { ok: false, message: "This car is not on hold." };
  return { ok: false, message: "We cannot find this car." };
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
