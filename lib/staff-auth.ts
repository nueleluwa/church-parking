import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings, getStaffById } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { hasRole, type StaffContext, type StaffRole } from "@/lib/rules/roles";
import { makeStaffToken, readStaffToken, STAFF_SESSION_SECONDS } from "@/lib/staff-token";

const COOKIE = "cp_staff";

export async function startStaffSession(staffId: string): Promise<void> {
  // The length an admin chose in Settings (12 hours at most), for people who sign in from now on
  const seconds = Math.min((await getSettings()).staffSessionHours * 3600, STAFF_SESSION_SECONDS);
  (await cookies()).set(COOKIE, makeStaffToken(staffId, serverEnv().SESSION_SECRET, Date.now(), seconds), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: seconds,
  });
}

export async function endStaffSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export type StaffSession = StaffContext & { name: string };

/**
 * The signed-in staff member, or null. The account is read from the database
 * every time, so deactivating someone ends their session at once (T-5).
 */
export async function currentStaff(): Promise<StaffSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = readStaffToken(token, serverEnv().SESSION_SECRET);
  if (!id) return null;
  const staff = await getStaffById(id);
  if (!staff || !staff.active) return null;
  return { id: staff.id, role: staff.role, name: staff.full_name };
}

/**
 * For pages: send people who aren't signed in to sign in, and people who are
 * signed in but lack the role straight back to the attendant home.
 */
export async function requireStaff(minimum: StaffRole = "attendant"): Promise<StaffSession> {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/signin");
  if (!hasRole(staff.role, minimum)) redirect("/staff");
  return staff;
}
