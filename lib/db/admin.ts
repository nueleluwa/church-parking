import type { ReportAlert } from "@/lib/rules/report-catalogue";
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

/** When each person on the team last did something that was recorded (a release, a correction, a change). */
export async function staffLastActive(): Promise<Map<string, string>> {
  const { data, error } = await db()
    .from("audit_events")
    .select("staff_id, created_at")
    .not("staff_id", "is", null)
    .order("id", { ascending: false })
    .limit(3000);
  if (error) fail(error.message);
  const out = new Map<string, string>();
  for (const e of data ?? []) if (!out.has(e.staff_id as string)) out.set(e.staff_id as string, e.created_at as string);
  return out;
}

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
  patch: { role?: StaffRole; active?: boolean; password_hash?: string; full_name?: string; phone?: string },
): Promise<"ok" | "phone_taken"> {
  const { error } = await db().from("staff").update(patch).eq("id", id);
  if (error?.code === UNIQUE_VIOLATION) return "phone_taken";
  if (error) fail(error.message);
  return "ok";
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

/** Members who have saved a car whose plate matches (0/O and 1/I look-alikes included). */
export async function searchMembersByPlate(plate: string): Promise<MemberRecord[]> {
  if (plate.length < 3) return [];
  const { data: cars, error } = await db()
    .from("vehicles")
    .select("id")
    .like("plate", `%${plate.replace(/[0O1I]/g, "_")}%`)
    .limit(30);
  if (error) fail(error.message);
  const carIds = (cars ?? []).map((c) => c.id as string);
  if (carIds.length === 0) return [];
  const { data: links, error: linkError } = await db().from("member_vehicles").select("member_id").in("vehicle_id", carIds);
  if (linkError) fail(linkError.message);
  const memberIds = [...new Set((links ?? []).map((l) => l.member_id as string))];
  if (memberIds.length === 0) return [];
  const { data, error: memberError } = await db()
    .from("members")
    .select("id, full_name, phone, locked_until, last_seen_at, created_at")
    .in("id", memberIds)
    .order("full_name")
    .limit(20);
  if (memberError) fail(memberError.message);
  return (data ?? []) as MemberRecord[];
}

/** The members seen most recently (or, if none has signed in again, the newest). */
export async function listRecentMembers(limit = 30): Promise<MemberRecord[]> {
  const { data, error } = await db()
    .from("members")
    .select("id, full_name, phone, locked_until, last_seen_at, created_at")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail(error.message);
  return (data ?? []) as MemberRecord[];
}

/** How many visits and saved cars each of these members has. */
export async function memberCounts(ids: string[]): Promise<Map<string, { visits: number; cars: number }>> {
  const out = new Map<string, { visits: number; cars: number }>(ids.map((id) => [id, { visits: 0, cars: 0 }]));
  if (ids.length === 0) return out;
  const [visits, cars] = await Promise.all([
    db().from("visits").select("member_id").in("member_id", ids).limit(20000),
    db().from("member_vehicles").select("member_id").in("member_id", ids).limit(5000),
  ]);
  if (visits.error) fail(visits.error.message);
  if (cars.error) fail(cars.error.message);
  for (const v of visits.data ?? []) out.get(v.member_id as string)!.visits++;
  for (const c of cars.data ?? []) out.get(c.member_id as string)!.cars++;
  return out;
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
  id: string;
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
        "id, service_date, service_id, area_id, status, release_method, reference, checked_in_at, released_at, guest_id, " +
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
        id: r.id,
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

/** Every alert raised between two Lagos dates, resolved or not, oldest first. Nothing is merged or dropped. */
export async function listReportAlerts(from: string, to: string): Promise<ReportAlert[]> {
  type Row = {
    id: number;
    kind: string;
    plate: string | null;
    detail: { area_id?: number; service_id?: number } | null;
    created_at: string;
    resolved_at: string | null;
    visits: { areas: { name: string } | null; services: { id: number; name: string } | null } | null;
  };
  const rows: Row[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await db()
      .from("alerts")
      .select("id, kind, plate, detail, created_at, resolved_at, visits(areas(name), services(id, name))")
      .gte("created_at", `${from}T00:00:00+01:00`)
      .lt("created_at", `${addDay(to)}T00:00:00+01:00`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) fail(error.message);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  // A conflict alert has no visit of its own, only the car park and service ids in its detail
  const [areas, services] = await Promise.all([db().from("areas").select("id, name"), db().from("services").select("id, name")]);
  const areaName = new Map((areas.data ?? []).map((a) => [a.id as number, a.name as string]));
  const serviceName = new Map((services.data ?? []).map((s) => [s.id as number, s.name as string]));
  return rows.map((r) => {
    const serviceId = r.visits?.services?.id ?? r.detail?.service_id ?? null;
    return {
      id: r.id,
      kind: r.kind,
      plate: r.plate,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      areaName: r.visits?.areas?.name ?? (r.detail?.area_id ? (areaName.get(r.detail.area_id) ?? null) : null),
      serviceId,
      serviceName: r.visits?.services?.name ?? (serviceId !== null ? (serviceName.get(serviceId) ?? null) : null),
    };
  });
}

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------- Car parks (AD-1) ----------

/** Add a car park. The name must be new (compared without capital letters); the slug is its permanent QR address. */
export async function createArea(name: string, slug: string): Promise<number | "duplicate"> {
  const { data: top } = await db().from("areas").select("sort").order("sort", { ascending: false }).limit(1);
  const sort = ((top?.[0]?.sort as number | undefined) ?? 0) + 1;
  const { data, error } = await db().from("areas").insert({ name, slug, sort }).select("id").single();
  if (error?.code === UNIQUE_VIOLATION) return "duplicate";
  if (error || !data) fail(error?.message ?? "no area");
  return data.id as number;
}

export async function listAreaSlugs(): Promise<string[]> {
  const { data, error } = await db().from("areas").select("slug");
  if (error) fail(error.message);
  return (data ?? []).map((a) => a.slug as string);
}

/** How many cars are parked in a car park right now. */
export async function countParkedInArea(areaId: number): Promise<number> {
  const { count, error } = await db()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("area_id", areaId)
    .eq("status", "parked");
  if (error) fail(error.message);
  return count ?? 0;
}

export async function setAreaActive(areaId: number, active: boolean): Promise<boolean> {
  const { data, error } = await db().from("areas").update({ active }).eq("id", areaId).select("id");
  if (error) fail(error.message);
  return (data ?? []).length === 1;
}
