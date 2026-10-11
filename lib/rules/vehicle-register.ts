import { normalisePlate } from "./plates";
import { COLOUR_MAX, MAKE_MAX } from "./vehicle";

/**
 * The vehicle register (Vehicles screen): the types, the filters in the address, and the check on the add/edit form.
 * A vehicle is a plate. It is a MEMBER vehicle when a member has saved it (member_vehicles), otherwise a GUEST vehicle
 * (it was first seen at a guest check-in, or an admin registered it without an owner). Active/inactive is separate:
 * a deactivated vehicle cannot start a new check-in, but its history stays and an open visit is never touched.
 */

export const VEHICLE_TYPES = [
  { value: "car", label: "Car" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "Van" },
  { value: "bus", label: "Bus" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "other", label: "Other" },
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number]["value"];
export type Ownership = "member" | "guest";
export type VehicleStatus = "active" | "inactive";

export const PLATE_MIN = 3;
export const PLATE_MAX = 10;

export const typeLabel = (type: string | null | undefined): string => VEHICLE_TYPES.find((t) => t.value === type)?.label ?? "Not recorded";

export const parseVehicleType = (v: string | null | undefined): VehicleType | null => VEHICLE_TYPES.find((t) => t.value === v)?.value ?? null;
export const parseOwnership = (v: string | null | undefined): Ownership | null => (v === "member" || v === "guest" ? v : null);
export const parseVehicleStatus = (v: string | null | undefined): VehicleStatus | null => (v === "active" || v === "inactive" ? v : null);

export const REGISTER_PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_REGISTER_PAGE_SIZE = 20;

export function parsePageSize(v: string | null | undefined): number {
  const n = Number.parseInt(v ?? "", 10);
  return REGISTER_PAGE_SIZES.find((s) => s === n) ?? DEFAULT_REGISTER_PAGE_SIZE;
}

/** "Showing 1-20 of 134", with a clear zero. */
export function registerRange(page: number, size: number, shown: number, total: number): { first: number; last: number } {
  if (total === 0 || shown === 0) return { first: 0, last: 0 };
  const first = (page - 1) * size + 1;
  return { first, last: first + shown - 1 };
}

export type VehicleInput = {
  plate: string;
  type: VehicleType | null;
  make: string | null;
  colour: string | null;
  ownership: Ownership;
  memberId: string | null;
  active: boolean;
};

export type VehicleField = "plate" | "type" | "make" | "colour" | "ownership" | "memberId";
export type VehicleErrors = Partial<Record<VehicleField, string>>;

const clean = (input: unknown) =>
  String(input ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check what the add/edit form sent. The plate is normalised (capitals, letters and digits only) and is only checked when
 * adding: a plate is never changed afterwards, because every visit is filed under it. Each problem is reported against
 * its own field.
 */
export function checkVehicleForm(
  raw: Record<string, unknown>,
  mode: "add" | "edit",
): { ok: true; values: VehicleInput } | { ok: false; errors: VehicleErrors } {
  const errors: VehicleErrors = {};

  const plate = normalisePlate(String(raw.plate ?? "").slice(0, 40));
  if (mode === "add") {
    if (!plate) errors.plate = "Enter the plate number.";
    else if (plate.length < PLATE_MIN) errors.plate = `A plate number has at least ${PLATE_MIN} letters or numbers.`;
    else if (plate.length > PLATE_MAX) errors.plate = `A plate number has at most ${PLATE_MAX} letters or numbers.`;
  }

  const typeText = clean(raw.type);
  const type = parseVehicleType(typeText);
  if (typeText && !type) errors.type = "Choose a vehicle type from the list.";

  const make = clean(raw.make);
  if (make.length > MAKE_MAX) errors.make = `Use ${MAKE_MAX} letters or fewer.`;
  const colour = clean(raw.colour);
  if (colour.length > COLOUR_MAX) errors.colour = `Use ${COLOUR_MAX} letters or fewer.`;

  const ownership = parseOwnership(clean(raw.ownership));
  if (!ownership) errors.ownership = "Choose Member or Guest.";

  const memberId = clean(raw.memberId);
  if (ownership === "member") {
    if (!memberId) errors.memberId = "Choose the member who owns this vehicle.";
    else if (!UUID.test(memberId)) errors.memberId = "Choose a member from the search results.";
  }

  if (Object.keys(errors).length > 0 || !ownership) return { ok: false, errors };
  return {
    ok: true,
    values: {
      plate,
      type,
      make: make || null,
      colour: colour || null,
      ownership,
      memberId: ownership === "member" ? memberId : null,
      active: String(raw.status ?? "active") !== "inactive",
    },
  };
}

/** The first error in form order, for a single summary line. */
export function firstError(errors: VehicleErrors): string {
  const order: VehicleField[] = ["plate", "type", "make", "colour", "ownership", "memberId"];
  const f = order.find((k) => errors[k]);
  return f ? (errors[f] as string) : "Please check the details and try again.";
}

type Comparable = { type: string | null; make: string | null; colour: string | null; active: boolean; ownerId: string | null };

/** What changed between the stored vehicle and the form, as `{ field: [before, after] }`, for the audit log. */
export function vehicleChanges(before: Comparable, after: Comparable): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of ["type", "make", "colour", "active", "ownerId"] as const) {
    if (before[k] !== after[k]) out[k] = [before[k], after[k]];
  }
  return out;
}

export type BulkOutcome = { done: number; failed: number };

/** "3 vehicles deactivated." or "2 of 3 vehicles activated. 1 could not be changed (reason)." */
export function describeVehicleBulk(verb: "activated" | "deactivated", total: number, outcome: BulkOutcome, why: string): string {
  const noun = (n: number) => `${n} ${n === 1 ? "vehicle" : "vehicles"}`;
  if (outcome.failed === 0) return `${noun(outcome.done)} ${verb}.`;
  if (outcome.done === 0) return `No vehicles ${verb}. ${noun(outcome.failed)} could not be changed (${why}).`;
  return `${outcome.done} of ${noun(total)} ${verb}. ${outcome.failed} could not be changed (${why}).`;
}
