import { hasRole, type StaffRole } from "./roles";

export const CORRECTION_ACTIONS = ["change_area", "change_service", "reopen", "close"] as const;
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];

export const REASON_MIN = 5;
export const REASON_MAX = 200;

/** Corrections change a visit after the fact, so each needs a short written reason (OP-3). */
export function checkReason(input: string): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = input.trim();
  if (reason.length < REASON_MIN) return { ok: false, message: "Please write a reason, at least 5 letters." };
  if (reason.length > REASON_MAX) return { ok: false, message: "Please shorten the reason." };
  return { ok: true, reason };
}

/** Corrections, the dashboard and the sweep are for coordinators and admins. */
export function canCorrect(role: StaffRole): boolean {
  return hasRole(role, "coordinator");
}

export type CorrectionResult = "ok" | "not_found" | "bad_state" | "conflict" | "bad_input";

export const CORRECTION_MESSAGES: Record<CorrectionResult, string> = {
  ok: "Done.",
  not_found: "We cannot find this visit.",
  bad_state: "This visit cannot be changed that way right now.",
  conflict: "This car already has another open visit, so it cannot be reopened.",
  bad_input: "Please check the details and try again.",
};
