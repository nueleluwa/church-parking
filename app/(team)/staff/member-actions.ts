"use server";

import { z } from "zod";
import { addMemberVehicle, createMemberAccount, findMembersForStaff, logAudit, plateProblems } from "@/lib/db";
import { checkMemberForm, firstMemberError, formatPlate, memberMatchCard, parseMemberSearch, toLocalPhone, type MemberMatchCard } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export type MemberSearchResult = { cards: MemberMatchCard[]; searched: boolean } | { error: string };

/**
 * Staff look for a member before adding one (so nobody is added twice). Works by phone number or plate, and shows only a first
 * name, the last four digits and the plates. Any signed-in staff member may look.
 */
export async function searchMembers(query: string): Promise<MemberSearchResult> {
  if (!(await currentStaff())) return { error: "Please sign in again." };
  const text = z.string().max(60).safeParse(query);
  const search = text.success ? parseMemberSearch(text.data) : null;
  if (!search) return { error: "Type a phone number such as 0803 123 4567, or a plate number." };
  const found = await findMembersForStaff(search);
  return { cards: found.map(memberMatchCard), searched: true };
}

export type AddMemberState = { error?: string; fieldErrors?: { name?: string; phone?: string; plate?: string }; added?: { firstName: string; plate: string } };

const WHY: Record<string, string> = {
  taken: "is already saved to a member.",
  in_use: "is checked in right now. Add it after the car is released.",
  inactive: "is deactivated. Ask an administrator.",
};

/**
 * Staff add a member who has not been registered, for example someone who arrives and is sent to parking staff by the check-in
 * page. Needs a Nigerian phone number (the check-in finds people by it) and one plate. No PIN is set. Attendants, coordinators and
 * admins may do this; it is audited with who did it. A phone number or plate that is already a member is refused, whatever was
 * searched first.
 */
export async function addMember(_prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const staff = await currentStaff();
  if (!staff) return { error: "Please sign in again." };

  const checked = checkMemberForm(
    {
      name: formData.get("name"),
      phone: formData.get("phone"),
      vehicles: [{ plate: formData.get("plate"), make: formData.get("make"), colour: formData.get("colour") }],
    },
    false,
    true,
  );
  if (!checked.ok) {
    const e = checked.errors;
    return { error: firstMemberError(e), fieldErrors: { name: e.name, phone: e.phone, plate: e.vehicles?.[0] || e.general } };
  }
  const v = checked.values;
  if (!toLocalPhone(v.phone)) {
    const message = "The check-in needs a Nigerian number, for example 0803 123 4567. Register this driver's car at the exit instead.";
    return { error: message, fieldErrors: { phone: message } };
  }

  try {
    const problems = await plateProblems(v.vehicles.map((x) => x.plate));
    const bad = v.vehicles.find((x) => problems.has(x.plate));
    if (bad) {
      const message = `${formatPlate(bad.plate)} ${WHY[problems.get(bad.plate)!]}`;
      return { error: message, fieldErrors: { plate: message } };
    }
    const id = await createMemberAccount({ name: v.name, phone: v.phone, pinHash: null, active: true });
    if (id === "phone_taken") {
      const message = "This phone number is already a member. Search for them above.";
      return { error: message, fieldErrors: { phone: message } };
    }
    let saved = 0;
    for (const car of v.vehicles) {
      if ((await addMemberVehicle(id, car.plate, { make: car.make, colour: car.colour })) === "added") saved += 1;
    }
    await logAudit(staff.id, null, "staff_register_member", { after: { member_id: id, vehicles: saved } });
    // Someone else took the plate in the moment between the check and the save: the member exists but has no car yet
    if (saved === 0) return { error: "The member was added, but their car could not be saved. Tell an administrator." };
    return { added: { firstName: v.name.split(" ")[0] ?? v.name, plate: v.vehicles[0].plate } };
  } catch {
    return { error: "The member could not be saved. Please try again." };
  }
}
