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
  lagosDate,
  normalisePhone,
  normalisePlate,
  pickService,
  releaseVisit,
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
  await raiseNoMatch(staff.id, visitId, normalisePlate(plate));
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
  phone: z.string().trim().min(1),
  name: z.string().trim().max(80).optional(),
});

export type RegisterState = { error?: string; reference?: string; plate?: string };

/** Manual registration (EX-4, OP-4): an attendant registers a car for a driver. */
export async function registerCar(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const staff = await currentStaff();
  if (!staff) return { error: "Please sign in again." };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please fill in the plate number, phone number and area." };

  const phone = normalisePhone(parsed.data.phone);
  if (!phone) return { error: "Please enter a Nigerian phone number, like 0803 123 4567." };
  const plate = normalisePlate(parsed.data.plate);
  if (plate.length < 4 || plate.length > 10) return { error: "Please check the plate number." };

  const area = await getAreaBySlug(parsed.data.area);
  if (!area) return { error: "Please choose an area." };

  const service = pickService(new Date(), await listActiveServices());
  if (!service) return { error: "There is no service right now." };

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
    return { error: "This car is already checked in, or belongs to a member. Tell the coordinator." };
  }
  if (result.status !== "ok") return { error: "Something went wrong. Please try again." };

  await logAudit(staff.id, null, "manual_register", { after: { reference: result.reference } });
  return { reference: result.reference, plate };
}

export async function signOut(): Promise<void> {
  await endStaffSession();
  redirect("/staff/signin");
}
