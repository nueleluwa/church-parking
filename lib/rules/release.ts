import type { StaffContext } from "./roles";

export type ReleaseMethod = "scan" | "search";

/** What releaseVisit needs from the database. */
export interface ReleaseStore {
  /** The visit's status and service date, or null if there is no such visit. */
  getVisitState(
    visitId: string,
  ): Promise<{ status: "parked" | "released" | "missed"; service_date: string; held: boolean } | null>;
  /** Atomic: marks the visit released and writes the audit row. False if it was no longer parked. */
  release(visitId: string, staffId: string, method: ReleaseMethod, today: string): Promise<boolean>;
}

export type ReleaseResult =
  | { ok: true }
  | { ok: false; reason: "not_signed_in" | "not_found" | "already_released" | "expired" | "held" };

/**
 * The only way a visit is released (security rule 1). It needs a staff
 * session, refuses passes from an earlier day (R-7) and relies on the
 * database to let only the first of two simultaneous releases win (EX-7).
 */
export async function releaseVisit(
  store: ReleaseStore,
  staff: StaffContext | null,
  input: { visitId: string; method: ReleaseMethod; today: string },
): Promise<ReleaseResult> {
  if (!staff) return { ok: false, reason: "not_signed_in" };

  const visit = await store.getVisitState(input.visitId);
  if (!visit) return { ok: false, reason: "not_found" };
  if (visit.status !== "parked") return { ok: false, reason: "already_released" };
  if (visit.service_date !== input.today) return { ok: false, reason: "expired" };
  if (visit.held) return { ok: false, reason: "held" };

  const released = await store.release(input.visitId, staff.id, input.method, input.today);
  return released ? { ok: true } : { ok: false, reason: "already_released" };
}
