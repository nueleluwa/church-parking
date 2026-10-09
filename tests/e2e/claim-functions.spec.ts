import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, createStaff, live, randomPhone } from "./helpers";

// The check-in rules, tested against the real database functions claim_guest_visit and
// claim_member_visit (one call does a whole check-in). Uses its own throw-away plates and members.
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(240_000);

const db = adminClient();
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const plate = () => `CLM${100 + Math.floor(Math.random() * 900)}${letters(2)}`;
const REF = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const reference = () => `PK-${Array.from({ length: 4 }, () => REF[Math.floor(Math.random() * 32)]).join("")}`;
const token = () => randomBytes(16).toString("base64url");
const candidates = (n = 3) => Array.from({ length: n }, () => ({ reference: reference(), token: token() }));

let serviceId: number;
let areaId: number;
const plates: string[] = [];
const rateKeys: string[] = [];
const memberIds: string[] = [];

test.beforeAll(async () => {
  serviceId = (await db.from("services").select("id").eq("name", "Automated test service").single()).data!.id;
  areaId = (await db.from("areas").select("id").eq("slug", "cp1").single()).data!.id;
});

test.afterAll(async () => {
  const { data: vehicles } = await db.from("vehicles").select("id").in("plate", plates);
  const ids = (vehicles ?? []).map((v) => v.id as string);
  if (ids.length) {
    const { data: visits } = await db.from("visits").select("id, guest_id").in("vehicle_id", ids);
    const visitIds = (visits ?? []).map((v) => v.id as string);
    const guestIds = (visits ?? []).map((v) => v.guest_id as string).filter(Boolean);
    if (visitIds.length) {
      await db.from("audit_events").update({ visit_id: null }).in("visit_id", visitIds);
      await db.from("alerts").delete().in("visit_id", visitIds);
      await db.from("visits").delete().in("id", visitIds);
    }
    await db.from("alerts").delete().in("plate", plates);
    if (guestIds.length) await db.from("guests").delete().in("id", guestIds);
    await db.from("member_vehicles").delete().in("vehicle_id", ids);
    await db.from("vehicles").delete().in("id", ids);
  }
  if (memberIds.length) await db.from("members").delete().in("id", memberIds);
  if (rateKeys.length) await db.from("rate_events").delete().in("key", rateKeys);
});

function guestClaim(p: string, over: Record<string, unknown> = {}) {
  if (!plates.includes(p)) plates.push(p);
  return db.rpc("claim_guest_visit", {
    p_plate: p,
    p_name: "Claim Test",
    p_phone: `+234${randomPhone().slice(1)}`,
    p_service: serviceId,
    p_area: areaId,
    p_date: today,
    p_staff: null,
    p_candidates: candidates(),
    p_phone_key: null,
    p_phone_max: 0,
    p_phone_mins: 0,
    p_ip_key: null,
    p_ip_max: 0,
    p_ip_mins: 0,
    ...over,
  });
}

async function makeMember(p: string) {
  if (!plates.includes(p)) plates.push(p);
  const { data: member } = await db
    .from("members")
    .insert({ full_name: "Claim Member", phone: `+234${randomPhone().slice(1)}`, pin_hash: "x" })
    .select("id")
    .single();
  memberIds.push(member!.id);
  const { data: vehicle } = await db.from("vehicles").insert({ plate: p }).select("id").single();
  await db.from("member_vehicles").insert({ member_id: member!.id, vehicle_id: vehicle!.id });
  return { memberId: member!.id as string, vehicleId: vehicle!.id as string };
}

function memberClaim(m: { memberId: string; vehicleId: string }, p: string, over: Record<string, unknown> = {}) {
  return db.rpc("claim_member_visit", {
    p_member: m.memberId,
    p_vehicle: m.vehicleId,
    p_plate: p,
    p_service: serviceId,
    p_area: areaId,
    p_date: today,
    p_staff: null,
    p_candidates: candidates(),
    ...over,
  });
}

const alertsFor = async (p: string, kind: string) =>
  ((await db.from("alerts").select("id", { count: "exact", head: true }).eq("plate", p).eq("kind", kind)).count ?? 0);

test.describe("guest check-in in one call", () => {
  test("a new plate gets a pass and is parked", async () => {
    const p = plate();
    const { data, error } = await guestClaim(p);
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "ok" });
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const visit = (await db.from("visits").select("status, pass_token, service_id, area_id, service_date, vehicles!inner(plate)").eq("vehicles.plate", p).single()).data!;
    expect(visit).toMatchObject({ status: "parked", pass_token: data.token, service_id: serviceId, area_id: areaId, service_date: today });
  });

  test("a second claim on the same plate is refused, alerts, shows no pass and leaves no stray guest", async () => {
    const p = plate();
    await guestClaim(p);
    const phone = `+234${randomPhone().slice(1)}`;
    const { data } = await guestClaim(p, { p_phone: phone });
    expect(data).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(JSON.stringify(data)).not.toMatch(/token|reference/);
    expect(await alertsFor(p, "plate_conflict")).toBe(1);
    expect((await db.from("guests").select("id", { count: "exact", head: true }).eq("phone", phone)).count).toBe(0);
  });

  test("a guest cannot claim a member's plate", async () => {
    const p = plate();
    await makeMember(p);
    const { data } = await guestClaim(p);
    expect(data).toEqual({ status: "blocked", reason: "member_plate" });
    expect(await alertsFor(p, "member_plate_claim")).toBe(1);
  });

  test("a visit left open from an earlier day is closed so the plate can check in", async () => {
    const p = plate();
    await guestClaim(p);
    const { data: old } = await db.from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", p).single();
    await db.from("visits").update({ service_date: "2020-01-01" }).eq("id", old!.id);
    const { data } = await guestClaim(p);
    expect(data).toMatchObject({ status: "ok" });
    expect((await db.from("visits").select("status").eq("id", old!.id).single()).data!.status).toBe("missed");
  });

  test("a plate that left earlier today can check in again", async () => {
    const p = plate();
    await guestClaim(p);
    const { data: v } = await db.from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", p).single();
    await db.from("visits").update({ status: "released", released_at: new Date().toISOString() }).eq("id", v!.id);
    expect((await guestClaim(p)).data).toMatchObject({ status: "ok" });
  });

  test("when a reference is already taken the next one is used", async () => {
    const first = plate();
    const { data: a } = await guestClaim(first);
    const second = plate();
    const { data: b } = await guestClaim(second, {
      p_candidates: [{ reference: a.reference, token: token() }, { reference: reference(), token: token() }],
    });
    expect(b.status).toBe("ok");
    expect(b.reference).not.toBe(a.reference);
    // and a token that is already taken is skipped too
    const third = plate();
    const { data: c } = await guestClaim(third, {
      p_candidates: [{ reference: reference(), token: a.token }, { reference: reference(), token: token() }],
    });
    expect(c.status).toBe("ok");
    expect(c.token).not.toBe(a.token);
  });

  test("when every reference is taken it says so, and makes nothing", async () => {
    const first = plate();
    const { data: a } = await guestClaim(first);
    const p = plate();
    const { data } = await guestClaim(p, { p_candidates: [{ reference: a.reference, token: token() }] });
    expect(data).toEqual({ status: "error" });
    expect((await db.from("vehicles").select("id", { count: "exact", head: true }).eq("plate", p)).count).toBe(1);
    expect((await db.from("visits").select("id, vehicles!inner(plate)", { count: "exact", head: true }).eq("vehicles.plate", p)).count).toBe(0);
  });

  test("six phones claiming one plate at the same moment: exactly one wins", async () => {
    const p = plate();
    const results = await Promise.all(Array.from({ length: 6 }, () => guestClaim(p)));
    const answers = results.map((r) => r.data as { status: string; reason?: string });
    expect(answers.filter((a) => a.status === "ok")).toHaveLength(1);
    expect(answers.filter((a) => a.status === "blocked" && a.reason === "plate_conflict")).toHaveLength(5);
    const { count } = await db.from("visits").select("id, vehicles!inner(plate)", { count: "exact", head: true }).eq("vehicles.plate", p).eq("status", "parked");
    expect(count).toBe(1);
    expect(await alertsFor(p, "plate_conflict")).toBe(5);
  });

  test("rate limits: a phone is refused after its limit, attempts are recorded, and attendants are not limited", async () => {
    const key = `claim-test-phone:${randomBytes(6).toString("hex")}`;
    rateKeys.push(key);
    const limited = { p_phone_key: key, p_phone_max: 2, p_phone_mins: 60 };
    expect((await guestClaim(plate(), limited)).data.status).toBe("ok");
    expect((await guestClaim(plate(), limited)).data.status).toBe("ok");
    expect((await guestClaim(plate(), limited)).data).toEqual({ status: "rate_limited" });
    expect((await db.from("rate_events").select("id", { count: "exact", head: true }).eq("key", key)).count).toBe(3);
    // the refused try made no vehicle or visit
    const staff = await createStaff("attendant");
    try {
      for (let i = 0; i < 4; i++) expect((await guestClaim(plate(), { p_staff: staff.id })).data.status).toBe("ok");
      const p = plate();
      await guestClaim(p, { p_staff: staff.id });
      expect((await db.from("visits").select("checked_in_by, vehicles!inner(plate)").eq("vehicles.plate", p).single()).data!.checked_in_by).toBe(staff.id);
    } finally {
      await staff.remove();
    }
  });

  test("an address is refused after its own limit", async () => {
    const key = `claim-test-ip:${randomBytes(6).toString("hex")}`;
    rateKeys.push(key);
    const limited = { p_ip_key: key, p_ip_max: 1, p_ip_mins: 10 };
    expect((await guestClaim(plate(), limited)).data.status).toBe("ok");
    expect((await guestClaim(plate(), limited)).data).toEqual({ status: "rate_limited" });
  });
});

test.describe("member check-in in one call", () => {
  test("a member checks in a saved vehicle", async () => {
    const p = plate();
    const m = await makeMember(p);
    const { data } = await memberClaim(m, p);
    expect(data).toMatchObject({ status: "ok", existing: false });
    const visit = (await db.from("visits").select("member_id, guest_id, status").eq("pass_token", data.token).single()).data!;
    expect(visit).toMatchObject({ member_id: m.memberId, guest_id: null, status: "parked" });
  });

  test("a vehicle that is not theirs is refused", async () => {
    const p = plate();
    const m = await makeMember(p);
    const other = await makeMember(plate());
    expect((await memberClaim(other, p, { p_vehicle: m.vehicleId })).data).toEqual({ status: "blocked", reason: "not_your_vehicle" });
  });

  test("staying for the second service returns the same pass, with no alert", async () => {
    const p = plate();
    const m = await makeMember(p);
    const { data: first } = await memberClaim(m, p);
    const { data: again } = await memberClaim(m, p);
    expect(again).toMatchObject({ status: "ok", existing: true, token: first.token, reference: first.reference });
    expect(await alertsFor(p, "plate_conflict")).toBe(0);
  });

  test("someone else's open visit on the plate is refused, alerts and shows no pass", async () => {
    const p = plate();
    const m = await makeMember(p);
    const { data: v } = await db
      .from("visits")
      .insert({ reference: reference(), pass_token: token(), vehicle_id: m.vehicleId, guest_id: (await db.from("guests").insert({ full_name: "Other", phone: "+2348000000000" }).select("id").single()).data!.id, service_id: serviceId, area_id: areaId, service_date: today })
      .select("id")
      .single();
    expect(v).not.toBeNull();
    const { data } = await memberClaim(m, p);
    expect(data).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(await alertsFor(p, "plate_conflict")).toBe(1);
  });

  test("a visit left open from an earlier Sunday is closed and the member can check in", async () => {
    const p = plate();
    const m = await makeMember(p);
    const { data: first } = await memberClaim(m, p);
    await db.from("visits").update({ service_date: "2020-01-05" }).eq("pass_token", first.token);
    const { data } = await memberClaim(m, p);
    expect(data).toMatchObject({ status: "ok", existing: false });
    expect(data.token).not.toBe(first.token);
    expect((await db.from("visits").select("status").eq("pass_token", first.token).single()).data!.status).toBe("missed");
  });

  test("an attendant registering for a member is recorded", async () => {
    const p = plate();
    const m = await makeMember(p);
    const staff = await createStaff("attendant");
    try {
      const { data } = await memberClaim(m, p, { p_staff: staff.id });
      expect((await db.from("visits").select("checked_in_by").eq("pass_token", data.token).single()).data!.checked_in_by).toBe(staff.id);
    } finally {
      await staff.remove();
    }
  });
});
