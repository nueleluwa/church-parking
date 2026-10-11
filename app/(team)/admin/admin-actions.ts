"use server";

import { hash } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  clearAttempts,
  countActiveAdmins,
  countParkedInArea,
  createArea,
  createService,
  createStaffAccount,
  getMemberPhone,
  getStaffRecord,
  listAreaSlugs,
  saveSettings,
  logAudit,
  resetMemberPinRecord,
  setAreaActive,
  updateService,
  updateStaffAccount,
} from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { checkAreaName, hasRole, makeAreaSlug, normalisePhone, PIN_PATTERN, validateChurch, validatePreferences } from "@/lib/rules";
import { hashKey } from "@/lib/session";
import { currentStaff } from "@/lib/staff-auth";

export type AdminState = { ok?: boolean; error?: string; message?: string };

const NOT_ADMIN: AdminState = { error: "Only an administrator can do this." };
const BAD_FORM: AdminState = { error: "Please check the details and try again." };

/** Every admin action starts here: the check happens on the server, whatever the screen showed. */
async function admin() {
  const staff = await currentStaff();
  return staff && hasRole(staff.role, "admin") ? staff : null;
}

const formObject = (fd: FormData) => Object.fromEntries(fd);

// ---------- Services (AD-1) ----------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const serviceSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2).max(60),
  weekday: z.coerce.number().int().min(0).max(6),
  starts: time,
  ends: time,
  active: z.enum(["on", ""]).optional(),
});

export async function saveServiceAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const raw = formObject(fd);
  if (!raw.id) delete raw.id;
  const p = serviceSchema.safeParse(raw);
  if (!p.success) return { error: "Please give the service a name and start and end times, like 09:30." };
  if (p.data.starts >= p.data.ends) return { error: "The service must end after it starts." };

  const input = {
    name: p.data.name,
    weekday: p.data.weekday,
    starts_at: p.data.starts,
    ends_at: p.data.ends,
    active: p.data.active === "on",
  };
  if (p.data.id) {
    if (!(await updateService(p.data.id, input))) return { error: "We cannot find that service." };
    await logAudit(staff.id, null, "service_update", { after: { service_id: p.data.id, ...input } });
  } else {
    const id = await createService(input);
    await logAudit(staff.id, null, "service_create", { after: { service_id: id, ...input } });
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Service saved." };
}

// ---------- Staff (AD-3) ----------

const roleSchema = z.enum(["attendant", "coordinator", "admin"]);
const password = z.string().min(10, "The password needs at least 10 characters.").max(100);

export async function createStaffAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const p = z
    .object({ name: z.string().trim().min(2).max(80), phone: z.string(), role: roleSchema, password })
    .safeParse(formObject(fd));
  if (!p.success) return { error: p.error.issues[0]?.message.startsWith("The password") ? p.error.issues[0].message : BAD_FORM.error };
  const phone = normalisePhone(p.data.phone);
  if (!phone) return { error: "Please check the phone number." };

  const id = await createStaffAccount({
    fullName: p.data.name,
    phone,
    role: p.data.role,
    passwordHash: await hash(p.data.password),
  });
  if (id === "phone_taken") return { error: "Someone already has an account with that phone number." };
  await logAudit(staff.id, null, "staff_create", { after: { staff_id: id, role: p.data.role } });
  revalidatePath("/admin/staff");
  return { ok: true, message: "Account created. Give them the password in person." };
}

const manageSchema = z.object({
  staffId: z.string().uuid(),
  intent: z.enum(["set_role", "deactivate", "activate", "reset_password", "edit_details"]),
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().optional(),
  role: roleSchema.optional(),
  password: z.string().optional(),
});

export async function manageStaffAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const p = manageSchema.safeParse(formObject(fd));
  if (!p.success) return BAD_FORM;
  const target = await getStaffRecord(p.data.staffId);
  if (!target) return { error: "We cannot find that account." };

  // Nobody can lock the church out: keep yourself and at least one active admin
  const isSelf = target.id === staff.id;
  if (isSelf && p.data.intent === "deactivate") return { error: "You cannot switch off your own account." };
  const losesAdmin =
    target.role === "admin" &&
    target.active &&
    (p.data.intent === "deactivate" || (p.data.intent === "set_role" && p.data.role !== "admin"));
  if (losesAdmin) {
    if (isSelf) return { error: "You cannot remove your own admin access. Ask another admin." };
    if ((await countActiveAdmins()) <= 1) return { error: "There must be at least one active admin." };
  }

  switch (p.data.intent) {
    case "set_role":
      if (!p.data.role) return BAD_FORM;
      await updateStaffAccount(target.id, { role: p.data.role });
      await logAudit(staff.id, null, "staff_role", { after: { staff_id: target.id, role: p.data.role } });
      break;
    case "deactivate":
      await updateStaffAccount(target.id, { active: false });
      await logAudit(staff.id, null, "staff_deactivate", { after: { staff_id: target.id } });
      break;
    case "activate":
      await updateStaffAccount(target.id, { active: true });
      await logAudit(staff.id, null, "staff_activate", { after: { staff_id: target.id } });
      break;
    case "edit_details": {
      const phone = normalisePhone(p.data.phone ?? "");
      if (!p.data.name || !phone) return { error: "Please give a name and a phone number." };
      const result = await updateStaffAccount(target.id, { full_name: p.data.name, phone });
      if (result === "phone_taken") return { error: "Someone already has an account with that phone number." };
      await logAudit(staff.id, null, "staff_edit", { after: { staff_id: target.id } });
      break;
    }
    case "reset_password": {
      const pw = password.safeParse(p.data.password ?? "");
      if (!pw.success) return { error: pw.error.issues[0].message };
      await updateStaffAccount(target.id, { password_hash: await hash(pw.data) });
      await logAudit(staff.id, null, "staff_password_reset", { after: { staff_id: target.id } });
      break;
    }
  }
  revalidatePath("/admin/staff");
  return { ok: true, message: "Saved." };
}

// ---------- Members: PIN reset (AD-3) ----------

export async function resetMemberPinAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const p = z.object({ memberId: z.string().uuid(), pin: z.string() }).safeParse(formObject(fd));
  if (!p.success) return BAD_FORM;
  if (!PIN_PATTERN.test(p.data.pin)) return { error: "The PIN must be 4 numbers." };

  const phone = await getMemberPhone(p.data.memberId);
  if (!phone) return { error: "We cannot find that member." };
  await resetMemberPinRecord(p.data.memberId, await hash(p.data.pin));
  // Forget earlier wrong guesses, or the account would lock again at once
  const secret = serverEnv().SESSION_SECRET;
  await clearAttempts(hashKey("pin-phone", phone, secret));
  await logAudit(staff.id, null, "member_pin_reset", { after: { member_id: p.data.memberId } });
  revalidatePath("/admin/members");
  return { ok: true, message: "PIN changed and the account is unlocked. Tell the member their new PIN in person." };
}

// ---------- Car parks (AD-1) ----------

export async function addAreaAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const checked = checkAreaName(String(fd.get("name") ?? ""));
  if (!checked.ok) return { error: checked.message };

  const slug = makeAreaSlug(checked.name, await listAreaSlugs());
  const id = await createArea(checked.name, slug);
  if (id === "duplicate") return { error: "Another car park already has that name. Please choose a different name." };

  await logAudit(staff.id, null, "area_create", { after: { area_id: id, name: checked.name, slug } });
  revalidatePath("/", "layout");
  return { ok: true, message: `Car park added. Its QR address is /c/${slug}. Print its sign under QR Signs.` };
}

/** Switch a car park off or on. A car park with cars still parked in it cannot be switched off. */
export async function setAreaActiveAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const p = z.object({ areaId: z.coerce.number().int().positive(), active: z.enum(["yes", "no"]) }).safeParse(formObject(fd));
  if (!p.success) return BAD_FORM;
  const on = p.data.active === "yes";

  if (!on) {
    const parked = await countParkedInArea(p.data.areaId);
    if (parked > 0) {
      return { error: `${parked} ${parked === 1 ? "car is" : "cars are"} still parked here. Switch it off after they have left.` };
    }
  }
  if (!(await setAreaActive(p.data.areaId, on))) return { error: "We cannot find this car park." };
  await logAudit(staff.id, null, on ? "area_activate" : "area_deactivate", { after: { area_id: p.data.areaId } });
  revalidatePath("/", "layout");
  return { ok: true, message: on ? "Car park switched on." : "Car park switched off. Drivers who scan its sign cannot check in until you switch it on." };
}

// ---------- Settings ----------

/** Church name, campus and system name. Checked here, saved, and written to the audit log. */
export async function saveChurchSettingsAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const checked = validateChurch(formObject(fd));
  if (!checked.ok) return { error: checked.error };
  try {
    const { before } = await saveSettings(checked.values, staff.id);
    await logAudit(staff.id, null, "settings_update", { after: { group: "church", before, ...checked.values } });
  } catch {
    return { error: "The settings could not be saved. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Church details saved." };
}

/** Default search method and staff session length. Checked here, saved, and written to the audit log. */
export async function savePreferenceSettingsAction(fd: FormData): Promise<AdminState> {
  const staff = await admin();
  if (!staff) return NOT_ADMIN;
  const checked = validatePreferences(formObject(fd));
  if (!checked.ok) return { error: checked.error };
  try {
    const { before } = await saveSettings(checked.values, staff.id);
    await logAudit(staff.id, null, "settings_update", { after: { group: "preferences", before, ...checked.values } });
  } catch {
    return { error: "The settings could not be saved. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferences saved." };
}
