import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomInt } from "node:crypto";
import { makePassToken, makeReference } from "@/lib/rules/tokens";

/**
 * Refuses to run against anything but the hosted development project: its address must be a *.supabase.co one.
 * Production is PostgreSQL on the church's own server (127.0.0.1), so it can never match.
 */
export function devDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!new URL(url).hostname.endsWith(".supabase.co")) {
    throw new Error("Integration tests only run against the hosted development project.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const randomLocalPhone = () => `080${randomInt(10_000_000, 99_999_999)}`;
export const randomPlate = (tail = "IT") =>
  `${Array.from({ length: 3 }, () => String.fromCharCode(65 + randomInt(26))).join("")}${randomInt(100, 999)}${tail}`;
export const randomHash = () => `test-${randomBytes(12).toString("hex")}`;
export const candidates = () => Array.from({ length: 5 }, () => ({ reference: makeReference(), token: makePassToken() }));

export const lagosToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
export const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** A member (no PIN) with one active vehicle, and everything made for it, removable afterwards. */
export async function makeFixture(db: SupabaseClient, over: { memberActive?: boolean; vehicleActive?: boolean } = {}) {
  const local = randomLocalPhone();
  const plate = randomPlate();
  const member = await db
    .from("members")
    .insert({ full_name: "Zit Integration", phone: `+234${local.slice(1)}`, pin_hash: null, active: over.memberActive ?? true })
    .select("id")
    .single();
  if (member.error) throw new Error(member.error.message);
  const car = await db.from("vehicles").insert({ plate, active: over.vehicleActive ?? true }).select("id").single();
  if (car.error) throw new Error(car.error.message);
  const link = await db.from("member_vehicles").insert({ member_id: member.data.id, vehicle_id: car.data.id });
  if (link.error) throw new Error(link.error.message);
  return { local, plate, memberId: member.data.id as string, vehicleId: car.data.id as string };
}

export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

/** Remove a fixture and the visits, audit rows and alerts it caused. */
export async function removeFixture(db: SupabaseClient, f: Fixture, extra: { guestIds?: string[]; rateKeys?: string[] } = {}) {
  const visits = (await db.from("visits").select("id").eq("vehicle_id", f.vehicleId)).data ?? [];
  const ids = visits.map((v) => v.id as string);
  if (ids.length) {
    await db.from("audit_events").delete().in("visit_id", ids);
    await db.from("alerts").delete().in("visit_id", ids);
    await db.from("visits").delete().in("id", ids);
  }
  await db.from("alerts").delete().eq("plate", f.plate);
  await db.from("members").delete().eq("id", f.memberId);
  await db.from("vehicles").delete().eq("id", f.vehicleId);
  if (extra.guestIds?.length) await db.from("guests").delete().in("id", extra.guestIds);
  if (extra.rateKeys?.length) await db.from("rate_events").delete().in("key", extra.rateKeys);
}

export async function anyService(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from("services").select("id").limit(1).single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function areaId(db: SupabaseClient, slug: string): Promise<number> {
  const { data, error } = await db.from("areas").select("id").eq("slug", slug).single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export type CheckInArgs = {
  local: string;
  vehicleId: string;
  serviceId: number;
  areaId: number;
  date?: string;
  hash?: string;
  expires?: string;
  limits?: { phoneKey?: string; phoneMax?: number; ipKey?: string; ipMax?: number; reissueKey?: string; reissueMax?: number };
};

export type CheckOutAnswer = {
  status: string;
  plate?: string;
  reference?: string;
  checked_in_at?: string;
  released_at?: string;
};

/** Call checkout_with_credential the way the app does. */
export async function checkOut(db: SupabaseClient, a: { hash: string; areaId: number; today?: string }) {
  const { data, error } = await db.rpc("checkout_with_credential", { p_hash: a.hash, p_area: a.areaId, p_today: a.today ?? lagosToday() });
  if (error) throw new Error(error.message);
  return data as CheckOutAnswer;
}

/** Call check_in_with_credential the way the app does. */
export async function checkIn(db: SupabaseClient, a: CheckInArgs) {
  const l = a.limits ?? {};
  const { data, error } = await db.rpc("check_in_with_credential", {
    p_local: a.local,
    p_vehicle: a.vehicleId,
    p_service: a.serviceId,
    p_area: a.areaId,
    p_date: a.date ?? lagosToday(),
    p_hash: a.hash ?? randomHash(),
    p_expires: a.expires ?? inHours(24),
    p_candidates: candidates(),
    p_phone_key: l.phoneKey ?? null,
    p_phone_max: l.phoneMax ?? 0,
    p_phone_mins: l.phoneKey ? 10 : 0,
    p_ip_key: l.ipKey ?? null,
    p_ip_max: l.ipMax ?? 0,
    p_ip_mins: l.ipKey ? 10 : 0,
    p_reissue_key: l.reissueKey ?? null,
    p_reissue_max: l.reissueMax ?? 0,
    p_reissue_mins: l.reissueKey ? 60 : 0,
  });
  if (error) throw new Error(error.message);
  return data as { status: string; reissued?: boolean; token?: string; reference?: string; plate?: string; reason?: string };
}
