"use server";

import { revalidatePath } from "next/cache";
import {
  createVehicle,
  findMembersToLink,
  getStoredVehicle,
  logAudit,
  setVehicleActive,
  updateVehicle,
} from "@/lib/db";
import { checkVehicleForm, describeVehicleBulk, firstError, formatPlate, hasRole, vehicleChanges, type VehicleErrors } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";

export type VehicleFormState = { ok?: boolean; error?: string; fieldErrors?: VehicleErrors; message?: string; id?: string };

/** Every action here starts with this: the check is made on the server, whatever the screen showed. */
async function admin() {
  const staff = await currentStaff();
  return staff && hasRole(staff.role, "admin") ? staff : null;
}

const NOT_ADMIN = { error: "Only an administrator can do this." } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Add a vehicle, or (with an id) change one. Checked, saved, and written to the audit log with what changed. */
export async function saveVehicleAction(fd: FormData): Promise<VehicleFormState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const raw = Object.fromEntries(fd);
  const id = String(raw.id ?? "");
  const editing = id !== "";
  if (editing && !UUID.test(id)) return { error: "That vehicle could not be found." };

  const checked = checkVehicleForm(raw, editing ? "edit" : "add");
  if (!checked.ok) return { error: firstError(checked.errors), fieldErrors: checked.errors };
  const v = checked.values;

  try {
    if (!editing) {
      const made = await createVehicle(v);
      if (made.status === "duplicate") return { error: "This plate is already registered.", fieldErrors: { plate: "This plate is already registered." } };
      if (made.status === "no_member") return { error: "That member could not be found.", fieldErrors: { memberId: "That member could not be found. Search again." } };
      if (made.status === "too_many") return { error: "That member already has the most vehicles allowed.", fieldErrors: { memberId: "That member already has the most vehicles allowed." } };
      await logAudit(staff.id, null, "vehicle_added", {
        after: { vehicle_id: made.id, plate: v.plate, ownership: v.ownership, member_id: v.memberId, active: v.active, summary: `${formatPlate(v.plate)} added as a ${v.ownership} vehicle` },
      });
      revalidatePath("/admin/vehicles");
      return { ok: true, id: made.id, message: `${formatPlate(v.plate)} was added.` };
    }

    const before = await getStoredVehicle(id);
    if (!before) return { error: "That vehicle could not be found." };
    const result = await updateVehicle(id, v);
    if (result.status === "not_found") return { error: "That vehicle could not be found." };
    if (result.status === "no_member") return { error: "That member could not be found.", fieldErrors: { memberId: "That member could not be found. Search again." } };
    if (result.status === "too_many") return { error: "That member already has the most vehicles allowed.", fieldErrors: { memberId: "That member already has the most vehicles allowed." } };
    if (result.status === "in_use") {
      return { error: "This vehicle is checked in right now, so its owner cannot be changed. Change it after the car is released.", fieldErrors: { ownership: "Not while the vehicle is checked in." } };
    }

    const changes = vehicleChanges(before, { type: v.type, make: v.make, colour: v.colour, active: v.active, ownerId: v.memberId });
    const keys = Object.keys(changes);
    if (keys.length > 0) {
      const plate = formatPlate(before.plate);
      const base = { vehicle_id: id, plate: before.plate };
      if ("active" in changes) {
        await logAudit(staff.id, null, v.active ? "vehicle_reactivated" : "vehicle_deactivated", { after: { ...base, summary: `${plate} ${v.active ? "reactivated" : "deactivated"}` } });
      }
      if ("ownerId" in changes) {
        await logAudit(staff.id, null, "vehicle_owner_changed", {
          after: { ...base, from_member_id: before.ownerId, to_member_id: v.memberId, summary: `${plate} owner changed (${before.ownerId ? "member" : "guest"} to ${v.memberId ? "member" : "guest"})` },
        });
      }
      const detailKeys = keys.filter((k) => k === "type" || k === "make" || k === "colour");
      if (detailKeys.length > 0) {
        await logAudit(staff.id, null, "vehicle_updated", { after: { ...base, changes: Object.fromEntries(detailKeys.map((k) => [k, changes[k]])), summary: `${plate}: ${detailKeys.join(", ")} changed` } });
      }
    }
    revalidatePath("/admin/vehicles");
    revalidatePath(`/admin/vehicles/${id}`);
    return { ok: true, id, message: `${formatPlate(before.plate)} was saved.` };
  } catch {
    return { error: "The vehicle could not be saved. Please try again." };
  }
}

export type BulkVehicleState = { ok: boolean; message: string };

/** Activate or deactivate several vehicles. Each is its own audited change; open visits are never touched. Reports exactly what happened. */
export async function setVehiclesActiveAction(ids: string[], active: boolean): Promise<BulkVehicleState> {
  const staff = await admin();
  if (!staff) return { ok: false, message: NOT_ADMIN.error };
  const unique = [...new Set(ids)].filter((i) => UUID.test(i)).slice(0, 100);
  if (unique.length === 0) return { ok: false, message: "Choose at least one vehicle." };

  let done = 0;
  let failed = 0;
  for (const id of unique) {
    try {
      const before = await getStoredVehicle(id);
      if (!before) {
        failed += 1;
        continue;
      }
      if (before.active === active) {
        done += 1; // already in the state asked for
        continue;
      }
      if (await setVehicleActive(id, active)) {
        await logAudit(staff.id, null, active ? "vehicle_reactivated" : "vehicle_deactivated", {
          after: { vehicle_id: id, plate: before.plate, summary: `${formatPlate(before.plate)} ${active ? "reactivated" : "deactivated"}`, bulk: unique.length > 1 },
        });
        done += 1;
      } else failed += 1;
    } catch {
      failed += 1;
    }
  }
  revalidatePath("/admin/vehicles");
  const message = describeVehicleBulk(active ? "activated" : "deactivated", unique.length, { done, failed }, "not found or a database problem");
  return { ok: failed === 0, message };
}

export type MemberChoice = { id: string; name: string; phoneEnd: string };

/** Members to link a vehicle to. Administrators only: it returns names and the last four digits of a phone number. */
export async function findMembersAction(text: string): Promise<MemberChoice[]> {
  if (!(await admin())) return [];
  try {
    return await findMembersToLink(text.slice(0, 60));
  } catch {
    return [];
  }
}
