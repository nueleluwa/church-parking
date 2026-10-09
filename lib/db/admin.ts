import type { ReportVisit } from "@/lib/rules/reports";
import { db } from "./client";
import type { Service, StaffRole } from "./types";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

const UNIQUE_VIOLATION = "23505";

// ---------- Services (AD-1) ----------

export async function listAllServices(): Promise<Service[]> {
  const { data, error } = await db().from("services").select("*").order("weekday").order("starts_at");
  if (error) fail(error.message);
  return (data ?? []) as Service[];
}

export type ServiceInput = { name: string; weekday: number; starts_at: string; ends_at: string; active: boolean };

export async function createService(input: ServiceInput): Promise<number> {
  const { data, error } = await db().from("services").insert(input).select("id").single();
  if (error || !data) fail(error?.message ?? "no service");
  return data.id as number;
}

export async function updateService(id: number, input: ServiceInput): Promise<boolean> {
  const { data, error } = await db().from("services").update(input).eq("id", id).select("id");
  if (error) fail(error.message);
  return (data ?? []).length === 1;
}

// ---------- Staff (AD-3) ----------

export type StaffRecord = {
  id: string;
  full_name: string;
  phone: string;
  role: StaffRole;
  active: boolean;
  created_at: string;
};

export async function listStaff(): Promise<StaffRecord[]> {
  const { data, error } = await db()
    .from("staff")
    .select("id, full_name, phone, role, active, created_at")
    .order("active", { ascending: false })
    .order("full_name");
  if (error) fail(error.message);
  return (data ?? []) as StaffRecord[];
}

export async function createStaffAccount(input: {
  fullName: string;
  phone: string;
  role: StaffRole;
  passwordHash: string;
}): Promise<string | "phone_taken"> {
  const { data, error } = await db()
    .from("staff")
    .insert({ full_name: input.fullName, phone: input.phone, role: input.role, password_hash: input.passwordHash })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) return "phone_taken";
  if (error || !data) fail(error?.message ?? "no staff");
  return data.id as string;
}

export async function getStaffRecord(id: string): Promise<StaffRecord | null> {
  const { data, error } = await db()
    .from("staff")
    .select("id, full_name, phone, role, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error.message);
  return data as StaffRecord | null;
}

export async function countActiveAdmins(): Promise<number> {
  const { count, error } = await db()
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true);
  if (error) fail(error.message);
  return count ?? 0;
}

export async function updateStaffAccount(
  id: string,
  patch: { role?: StaffRole; active?: boolean; password_hash?: string },
): Promise<void> {
  const { error } = await db().from("staff").update(patch).eq("id", id);
  if (error) fail(error.message);
}

// ---------- Members (AD-3: PIN resets) ----------

export type MemberRecord = {
  id: string;
  full_name: string;
  phone: string;
  locked_until: string | null;
  last_seen_at: string | null;
  created_at: string;
};

/** Find members by phone number (exact) or by part of the name. */
export async function searchMembers(query: { phone?: string | null; text?: string }): Promise<MemberRecord[]> {
  let request = db()
    .from("members")
    .select("id, full_name, phone, locked_until, last_seen_at, created_at")
    .order("full_name")
    .limit(20);
  if (query.phone) request = request.eq("phone", query.phone);
  else if (query.text) request = request.ilike("full_name", `%${query.text.replace(/[%_,()]/g, " ")}%`);
  else return [];
  const { data, error } = await request;
  if (error) fail(error.message);
  return (data ?? []) as MemberRecord[];
}

/** A new PIN and an end to any lock. The caller also clears the failed-attempt records. */
export async function resetMemberPinRecord(id: string, pinHash: string): Promise<boolean> {
  const { data, error } = await db()
    .from("members")
    .update({ pin_hash: pinHash, locked_until: null })
    .eq("id", id)
    .select("id");
  if (error) fail(error.message);
  return (data ?? []).length === 1;
}

export async function getMemberPhone(id: string): Promise<string | null> {
  const { data, error } = await db().from("members").select("phone").eq("id", id).maybeSingle();
  if (error) fail(error.message);
  return (data?.phone as string | undefined) ?? null;
}

// ---------- Reports (AD-4) ----------

type VisitJoin = {
  service_date: string;
  service_id: number;
  area_id: number;
  status: ReportVisit["status"];
  release_method: ReportVisit["releaseMethod"];
  reference: string;
  checked_in_at: string;
  released_at: string | null;
  guest_id: string | null;
  vehicles: { plate: string };
  services: { name: string };
  areas: { name: string };
  staff: { full_name: string } | null;
};

const PAGE = 1000;
/** A safety limit: a few thousand visits is a full year of Sundays. */
const MAX_ROWS = 50_000;

/** Every visit in a date range, with no names or phone numbers. Pages through the results. */
export async function listReportVisits(from: string, to: string): Promise<ReportVisit[]> {
  const out: ReportVisit[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await db()
      .from("visits")
      .select(
        "service_date, service_id, area_id, status, release_method, reference, checked_in_at, released_at, guest_id, " +
          "vehicles(plate), services(name), areas(name), staff:released_by(full_name)",
      )
      .gte("service_date", from)
      .lte("service_date", to)
      .order("service_date", { ascending: false })
      .order("checked_in_at", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) fail(error.message);
    const rows = (data ?? []) as unknown as VisitJoin[];
    for (const r of rows) {
      out.push({
        serviceDate: r.service_date,
        serviceId: r.service_id,
        serviceName: r.services.name,
        areaId: r.area_id,
        areaName: r.areas.name,
        status: r.status,
        releaseMethod: r.release_method,
        plate: r.vehicles.plate,
        reference: r.reference,
        checkedInAt: r.checked_in_at,
        releasedAt: r.released_at,
        releasedByName: r.staff?.full_name ?? null,
        isGuest: r.guest_id !== null,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** The kinds of alerts raised between two Lagos dates (UTC day edges are close enough for a count). */
export async function listAlertKinds(from: string, to: string): Promise<string[]> {
  const out: string[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await db()
      .from("alerts")
      .select("kind")
      .gte("created_at", `${from}T00:00:00+01:00`)
      .lt("created_at", `${addDay(to)}T00:00:00+01:00`)
      .range(start, start + PAGE - 1);
    if (error) fail(error.message);
    const rows = (data ?? []) as { kind: string }[];
    out.push(...rows.map((r) => r.kind));
    if (rows.length < PAGE) break;
  }
  return out;
}

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
