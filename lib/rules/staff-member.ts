import { formatPlate, normalisePlate } from "./plates";
import { localPhone, maskPhone } from "./phone";
import { PLATE_MAX, PLATE_MIN } from "./vehicle-register";

/**
 * Staff registering a new member (QR check-in). Staff look first, so they do not add someone twice, then add.
 * What a lookup shows is limited the same way as the rest of the staff screens (R-9): a first name, the last four digits
 * of the phone number and the plates, never the full name or number.
 */

export type MemberSearch = { kind: "phone"; local: string } | { kind: "plate"; plate: string };

/** What staff typed: a Nigerian phone number (any usual spelling) or a plate. Anything else is not a search. */
export function parseMemberSearch(input: string): MemberSearch | null {
  const text = input.trim();
  if (!text) return null;
  const local = localPhone(text);
  if (local) return { kind: "phone", local };
  const plate = normalisePlate(text.slice(0, 40));
  if (plate.length >= PLATE_MIN && plate.length <= PLATE_MAX) return { kind: "plate", plate };
  return null;
}

export type MemberMatch = { full_name: string; phone: string; active: boolean; plates: string[] };

export type MemberMatchCard = { firstName: string; phoneEnding: string; plates: string[]; active: boolean };

/** The part of a member staff may see in a lookup. */
export function memberMatchCard(m: MemberMatch): MemberMatchCard {
  return {
    firstName: m.full_name.trim().split(/\s+/)[0] ?? "",
    phoneEnding: maskPhone(m.phone),
    plates: m.plates.map(formatPlate),
    active: m.active,
  };
}
