import { MAX_MEMBER_VEHICLES } from "./limits";
import { normalisePhone } from "./phone";
import { normalisePlate } from "./plates";
import { PLATE_MAX, PLATE_MIN } from "./vehicle-register";
import { checkVehicleDetails } from "./vehicle";

/**
 * The Users screen, members side: the filters in the address, and the check on the add / edit member form.
 * A member has a name, a phone number, a PIN and saved cars. There is no department or email in the data, so none is asked for.
 * "Inactive" means an admin switched the account off: it cannot sign in or start a check-in, and its history stays.
 * "Locked" is different: the PIN was guessed wrong too often, and an admin PIN reset clears it.
 */

export type MemberStatus = "active" | "inactive";
export type MemberCars = "with" | "none";
export type MemberState = "active" | "inactive" | "locked";

export const parseMemberStatus = (v: string | null | undefined): MemberStatus | null => (v === "active" || v === "inactive" ? v : null);
export const parseMemberCars = (v: string | null | undefined): MemberCars | null => (v === "with" || v === "none" ? v : null);

export const MEMBER_PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_MEMBER_PAGE_SIZE = 20;

export function parseMemberPageSize(v: string | null | undefined): number {
  const n = Number.parseInt(v ?? "", 10);
  return MEMBER_PAGE_SIZES.find((s) => s === n) ?? DEFAULT_MEMBER_PAGE_SIZE;
}

/** What to show for a member. Switched off wins over locked. */
export function memberState(m: { active: boolean; locked_until: string | null }, now: Date): MemberState {
  if (!m.active) return "inactive";
  return m.locked_until !== null && new Date(m.locked_until) > now ? "locked" : "active";
}

export const MEMBER_STATE_LABEL: Record<MemberState, string> = { active: "Active", inactive: "Inactive", locked: "Locked" };

/** The first moment of the current month in Lagos (UTC+1, no daylight saving), as an ISO time, for "New this month". */
export function lagosMonthStart(now: Date): string {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  const y = lagos.getUTCFullYear();
  const m = String(lagos.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01T00:00:00+01:00`;
}

/** Initials for the round badge: "John Okafor" gives JO. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

export type MemberVehicleInput = { plate: string; make: string | null; colour: string | null };

export type MemberInput = {
  name: string;
  phone: string;
  pin: string;
  active: boolean;
  vehicles: MemberVehicleInput[];
};

export type MemberErrors = {
  name?: string;
  phone?: string;
  pin?: string;
  /** One entry per vehicle row typed (same order), a message or empty. */
  vehicles?: string[];
  general?: string;
};

const clean = (x: unknown) =>
  String(x ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Check the add member form. A PIN is optional: a member added for the QR check-in has none and is found by phone number
 * (a PIN, if typed, must still be 4 numbers; `needPin` makes it required). `needVehicle` asks for at least one plate, because
 * the check-in shows the registered plate for the member to confirm. Vehicle rows that are completely empty are ignored; the others need a good plate, details within the limits, and no plate
 * twice in the same form.
 */
export function checkMemberForm(
  raw: { name?: unknown; phone?: unknown; pin?: unknown; status?: unknown; vehicles?: { plate?: unknown; make?: unknown; colour?: unknown }[] },
  needPin: boolean,
  needVehicle = false,
): { ok: true; values: MemberInput } | { ok: false; errors: MemberErrors } {
  const errors: MemberErrors = {};

  const name = clean(raw.name);
  if (name.length < 2) errors.name = "Enter the member's full name.";
  else if (name.length > 80) errors.name = "Use 80 letters or fewer.";

  const phone = normalisePhone(clean(raw.phone));
  if (!clean(raw.phone)) errors.phone = "Enter the phone number.";
  else if (!phone) errors.phone = "Check the phone number, for example 0803 123 4567.";

  const pin = String(raw.pin ?? "");
  if (needPin || pin !== "") {
    if (!/^\d{4}$/.test(pin)) errors.pin = "The PIN must be 4 numbers.";
  }

  const rows = (raw.vehicles ?? []).filter((v) => clean(v.plate) || clean(v.make) || clean(v.colour));
  const vehicleErrors: string[] = [];
  const seen = new Set<string>();
  const vehicles: MemberVehicleInput[] = [];
  if (rows.length > MAX_MEMBER_VEHICLES) errors.general = `A member can have at most ${MAX_MEMBER_VEHICLES} vehicles.`;
  else if (needVehicle && rows.length === 0) errors.general = "Add the member's vehicle plate number.";
  for (const row of rows) {
    const plate = normalisePlate(String(row.plate ?? "").slice(0, 40));
    const details = checkVehicleDetails({ make: String(row.make ?? ""), colour: String(row.colour ?? "") });
    let problem = "";
    if (!plate) problem = "Enter the plate number.";
    else if (plate.length < PLATE_MIN || plate.length > PLATE_MAX) problem = `A plate number has ${PLATE_MIN} to ${PLATE_MAX} letters or numbers.`;
    else if (seen.has(plate)) problem = "This plate is in the list twice.";
    else if (!details.ok) problem = details.message;
    vehicleErrors.push(problem);
    if (!problem && details.ok) {
      seen.add(plate);
      vehicles.push({ plate, make: details.details.make, colour: details.details.colour });
    }
  }
  if (vehicleErrors.some(Boolean)) errors.vehicles = vehicleErrors;

  if (Object.keys(errors).length > 0 || !phone) return { ok: false, errors };
  return { ok: true, values: { name, phone, pin, active: String(raw.status ?? "active") !== "inactive", vehicles } };
}

/** The first message to show above the form. */
export function firstMemberError(errors: MemberErrors): string {
  return errors.name ?? errors.phone ?? errors.pin ?? errors.vehicles?.find(Boolean) ?? errors.general ?? "Please check the details and try again.";
}
