"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  claimStore,
  getAreaBySlug,
  getScanDetailByToken,
  getVisitPhone,
  listActiveServices,
  logAudit,
  raiseNoMatch,
  releaseStore,
  searchTodaysVisits,
} from "@/lib/db";
import {
  buildScanCard,
  claimGuestVisit,
  claimVisitForMemberByStaff,
  lagosDate,
  normalisePhone,
  normalisePlate,
  pickService,
  releaseVisit,
  servicesForCheckIn,
  type ScanCard,
} from "@/lib/rules";
import { tokenFromScan } from "@/lib/rules/scan";
import { currentStaff, endStaffSession } from "@/lib/staff-auth";

const today = () => lagosDate(new Date());
const uuid = z.string().uuid();

export type LookupResult = { card: ScanCard } | { error: string };

/** Scanner: turn scanned QR text into the result card. */
export async function lookupPass(scanned: string): Promise<LookupResult> {
  if (!(await currentStaff())) return { error: "Please sign in again." };
  const token = tokenFromScan(scanned);
  if (!token) return { error: "That is not a parking pass." };
  const detail = await getScanDetailByToken(token);
  if (!detail) return { error: "We can't find this pass." };
  return { card: buildScanCard(detail, today()) };
}

export type SearchResult = { cards: ScanCard[] } | { error: string };

/** Search by plate, phone or reference. Results carry no full phone number. */
export async function searchPasses(query: string): Promise<SearchResult> {
  if (!(await currentStaff())) return { error: "Please sign in again." };
  const q = z.string().trim().min(1).max(40).safeParse(query);
  if (!q.success) return { cards: [] };
  const details = await searchTodaysVisits(q.data, today());
  return { cards: details.map((d) => buildScanCard(d, today())) };
}

const RELEASE_MESSAGES = {
  not_signed_in: "Please sign in again.",
  not_found: "We can't find this pass.",
  already_released: "This car was already released.",
  expired: "This pass is from an earlier day.",
  held: "This car is on hold. Ask the coordinator.",
} as const;

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function releaseCar(visitId: string, method: "scan" | "search"): Promise<ActionResult> {
  const staff = await currentStaff();
  if (!uuid.safeParse(visitId).success) return { ok: false, message: "We can't find this pass." };
  const result = await releaseVisit(releaseStore, staff, { visitId, method, today: today() });
  return result.ok ? { ok: true } : { ok: false, message: RELEASE_MESSAGES[result.reason] };
}

export async function doesNotMatch(visitId: string, plate: string): Promise<ActionResult> {
  const staff = await currentStaff();
  if (!staff || !uuid.safeParse(visitId).success) return { ok: false, message: "Please sign in again." };
  const result = await raiseNoMatch(staff.id, visitId, normalisePlate(plate));
  if (result === "not_found") return { ok: false, message: "We can't find this pass." };
  if (result === "bad_state") return { ok: false, message: "This car was already released or closed." };
  return { ok: true };
}

/** "Show number": logs every reveal (R-9). */
export async function revealPhone(visitId: string): Promise<{ phone: string } | { error: string }> {
  const staff = await currentStaff();
  if (!staff || !uuid.safeParse(visitId).success) return { error: "Please sign in again." };
  const phone = await getVisitPhone(visitId);
  if (!phone) return { error: "No number on file." };
  await logAudit(staff.id, visitId, "reveal_phone");
  return { phone };
}

const registerSchema = z.object({
  area: z.string().min(1).max(40),
  plate: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  name: z.string().trim().max(80).optional(),
  forMember: z.enum(["yes", ""]).optional(),
});

export type RegisterState = {
  error?: string;
  reference?: string;
  plate?: string;
  /** The plate belongs to a member: offer "Register for the member". */
  memberPlate?: boolean;
};

/**
 * Manual registration (EX-4, OP-4): an attendant registers a car for a driver.
 * A member's car is registered as the member's own visit when the attendant
 * confirms, for members who are locked out, forgot their PIN or have no data.
 */
export async function registerCar(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const staff = await currentStaff();
  if (!staff) return { error: "Please sign in again." };

  const raw = Object.fromEntries(formData);
  const fail = (error: string, extra: Partial<RegisterState> = {}): RegisterState => ({ error, ...extra });

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fill in the plate number and area.");

  const plate = normalisePlate(parsed.data.plate);
  if (plate.length < 4 || plate.length > 10) return fail("Please check the plate number.");

  const area = await getAreaBySlug(parsed.data.area);
  if (!area) return fail("Please choose an area.");

  const now = new Date();
  const open = servicesForCheckIn(now, await listActiveServices());
  const service = pickService(now, open) ?? open[0];
  if (!service) return fail("The services have finished for today.");

  if (parsed.data.forMember === "yes") {
    const result = await claimVisitForMemberByStaff(claimStore, {
      plate,
      serviceId: service.id,
      areaId: area.id,
      serviceDate: today(),
      staffId: staff.id,
    });
    if (result.status === "not_member") return fail("This car is not saved to a member account.");
    if (result.status === "blocked") {
      return fail("This car is already checked in for someone else. Tell the coordinator.");
    }
    await logAudit(staff.id, null, "register_for_member", { after: { reference: result.reference } });
    return { reference: result.reference, plate };
  }

  const phone = normalisePhone(parsed.data.phone ?? "");
  if (!phone) {
    return fail("Please check the phone number. Example: 0803 123 4567, or +44 7700 900123 from abroad.");
  }

  const result = await claimGuestVisit(claimStore, {
    name: parsed.data.name || "Not given",
    phone,
    plate,
    serviceId: service.id,
    areaId: area.id,
    serviceDate: today(),
    staffId: staff.id,
    ipKey: "",
    phoneKey: "",
  });

  if (result.status === "blocked") {
    return result.reason === "member_plate"
      ? fail("This car belongs to a member. If the member is here, tap Register for the member.", { memberPlate: true })
      : fail("This car is already checked in. Tell the coordinator.");
  }
  if (result.status !== "ok") return fail("Something went wrong. Please try again.");

  await logAudit(staff.id, null, "manual_register", { after: { reference: result.reference } });
  return { reference: result.reference, plate };
}

export async function signOut(): Promise<void> {
  await endStaffSession();
  redirect("/staff/signin");
}
