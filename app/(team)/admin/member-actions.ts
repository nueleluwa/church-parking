"use server";

import { hash } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMemberVehicle, createMemberAccount, getMemberById, logAudit, plateProblems, setMemberActive, updateMemberDetails } from "@/lib/db";
import { checkMemberForm, firstMemberError, formatPlate, hasRole, normalisePhone, type MemberErrors } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export type MemberFormState = { ok?: boolean; error?: string; fieldErrors?: MemberErrors; message?: string; id?: string };

/** Every action here starts with this: the check is made on the server, whatever the screen showed. */
async function admin() {
  const staff = await currentStaff();
  return staff && hasRole(staff.role, "admin") ? staff : null;
}

const NOT_ADMIN = "Only an administrator can do this.";
const WHY: Record<string, string> = {
  taken: "is already saved to a member.",
  in_use: "is checked in right now. Add it after the car is released.",
  inactive: "is deactivated. Activate it in Vehicles first.",
};

/** Add a member, with their PIN and (optionally) their cars. Checked, saved, and written to the audit log. */
export async function createMemberAction(fd: FormData): Promise<MemberFormState> {
  const staff = await admin();
  if (!staff) return { error: NOT_ADMIN };
  const plates = fd.getAll("plate");
  const makes = fd.getAll("make");
  const colours = fd.getAll("colour");
  const checked = checkMemberForm(
    {
      name: fd.get("name"),
      phone: fd.get("phone"),
      pin: fd.get("pin"),
      status: fd.get("status"),
      vehicles: plates.map((p, i) => ({ plate: p, make: makes[i], colour: colours[i] })),
    },
    true,
  );
  if (!checked.ok) return { error: firstMemberError(checked.errors), fieldErrors: checked.errors };
  const v = checked.values;

  try {
    // Look at every car before anything is saved, so a refused car does not leave a half-made member
    const problems = await plateProblems(v.vehicles.map((x) => x.plate));
    if (problems.size > 0) {
      const rows = v.vehicles.map((x) => (problems.has(x.plate) ? `${formatPlate(x.plate)} ${WHY[problems.get(x.plate)!]}` : ""));
      return { error: rows.find(Boolean), fieldErrors: { vehicles: rows } };
    }
    const id = await createMemberAccount({ name: v.name, phone: v.phone, pinHash: await hash(v.pin), active: v.active });
    if (id === "phone_taken") {
      return { error: "Someone already has an account with that phone number.", fieldErrors: { phone: "Someone already has an account with that phone number." } };
    }

    let saved = 0;
    for (const car of v.vehicles) {
      if ((await addMemberVehicle(id, car.plate, { make: car.make, colour: car.colour })) === "added") saved += 1;
    }
    await logAudit(staff.id, null, "member_created", { after: { member_id: id, active: v.active, vehicles: saved } });
    revalidatePath("/admin/users");
    const missed = v.vehicles.length - saved;
    const withCars = saved ? ` with ${saved} ${saved === 1 ? "vehicle" : "vehicles"}` : "";
    return {
      ok: true,
      id,
      message: `${v.name} was added${withCars}.${missed ? ` ${missed} could not be saved: add it from their page.` : ""} Tell them their PIN in person.`,
    };
  } catch {
    return { error: "The member could not be saved. Please try again." };
  }
}

const detailsSchema = z.object({ memberId: z.string().uuid(), name: z.string().trim().min(2).max(80), phone: z.string() });

/** Change a member's name and phone number. History and saved cars stay with the member. */
export async function updateMemberAction(fd: FormData): Promise<MemberFormState> {
  const staff = await admin();
  if (!staff) return { error: NOT_ADMIN };
  const p = detailsSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Please give a name and a phone number." };
  const phone = normalisePhone(p.data.phone);
  if (!phone) return { error: "Check the phone number, for example 0803 123 4567." };
  const before = await getMemberById(p.data.memberId);
  if (!before) return { error: "We cannot find that member." };
  const result = await updateMemberDetails(before.id, p.data.name, phone);
  if (result === "phone_taken") return { error: "Someone already has an account with that phone number." };
  if (result === "not_found") return { error: "We cannot find that member." };
  await logAudit(staff.id, null, "member_updated", {
    after: { member_id: before.id, name_changed: before.full_name !== p.data.name, phone_changed: before.phone !== phone },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/members/${before.id}`);
  return { ok: true, message: "Saved." };
}

/** Switch a member on or off. Switching off stops sign-in and new check-ins; nothing is deleted. */
export async function setMemberActiveAction(memberId: string, active: boolean): Promise<MemberFormState> {
  const staff = await admin();
  if (!staff) return { error: NOT_ADMIN };
  const member = z.string().uuid().safeParse(memberId).success ? await getMemberById(memberId) : null;
  if (!member) return { error: "We cannot find that member." };
  if (member.active !== active) {
    await setMemberActive(member.id, active);
    await logAudit(staff.id, null, active ? "member_reactivated" : "member_deactivated", { after: { member_id: member.id } });
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/members/${member.id}`);
  return { ok: true, message: active ? "The account is switched on." : "The account is switched off. Their history is kept." };
}

/** Save one more car to a member (the same rules as when the member does it: no duplicates, at most four). */
export async function addMemberCarAction(fd: FormData): Promise<MemberFormState> {
  const staff = await admin();
  if (!staff) return { error: NOT_ADMIN };
  const memberId = z.string().uuid().safeParse(fd.get("memberId"));
  if (!memberId.success) return { error: "We cannot find that member." };
  const checked = checkMemberForm(
    { name: "Member", phone: "0803 000 0000", pin: "", vehicles: [{ plate: fd.get("plate"), make: fd.get("make"), colour: fd.get("colour") }] },
    false,
  );
  if (!checked.ok) return { error: checked.errors.vehicles?.find(Boolean) ?? checked.errors.general ?? "Please check the plate number." };
  const car = checked.values.vehicles[0];
  if (!car) return { error: "Enter the plate number." };
  const result = await addMemberVehicle(memberId.data, car.plate, { make: car.make, colour: car.colour });
  const words: Record<string, string> = {
    already_yours: "This member has already saved this vehicle.",
    taken: "This plate is already saved to another member.",
    in_use: "This vehicle is checked in right now. Add it after the car is released.",
    too_many: "A member can have at most 4 vehicles.",
    inactive: "This vehicle is deactivated. Activate it in Vehicles first.",
  };
  if (result !== "added") return { error: words[result] };
  await logAudit(staff.id, null, "member_vehicle_added", { after: { member_id: memberId.data, plate: car.plate } });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/members/${memberId.data}`);
  revalidatePath("/admin/vehicles");
  return { ok: true, message: `${formatPlate(car.plate)} was saved.` };
}
