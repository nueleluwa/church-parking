import { expect, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { adminClient, randomPhone, randomPlate } from "./helpers";

/** The address of the test-only car park the QR check-in is switched on for (see playwright.config.ts). */
export const QR_AREA = "qr-test";

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const e164 = (local: string) => `+234${local.slice(1)}`;

/** Make (or reuse) the test-only car park. */
export async function ensureQrArea() {
  const db = adminClient();
  const { data } = await db.from("areas").select("id").eq("slug", QR_AREA).maybeSingle();
  if (data) return data.id as number;
  const made = await db.from("areas").insert({ name: "QR Test Park", slug: QR_AREA, sort: 99 }).select("id").single();
  expect(made.error).toBeNull();
  return made.data!.id as number;
}

/** Remove the test car park and everything that points at it. */
export async function removeQrArea() {
  const db = adminClient();
  const { data } = await db.from("areas").select("id").eq("slug", QR_AREA).maybeSingle();
  if (!data) return;
  const visits = (await db.from("visits").select("id").eq("area_id", data.id)).data ?? [];
  const ids = visits.map((v) => v.id as string);
  if (ids.length) {
    await db.from("audit_events").delete().in("visit_id", ids);
    await db.from("alerts").delete().in("visit_id", ids);
    await db.from("visits").delete().in("id", ids);
  }
  await db.from("areas").delete().eq("id", data.id);
}

export type QrMember = { id: string; local: string; plates: string[]; vehicleIds: string[] };

/** A member with no PIN and one or more vehicles, made directly in the database. */
export async function makeQrMember(over: { active?: boolean; cars?: number; carActive?: boolean } = {}): Promise<QrMember> {
  const db = adminClient();
  const local = randomPhone();
  const m = await db.from("members").insert({ full_name: "Zqq Qr Member", phone: e164(local), pin_hash: null, active: over.active ?? true }).select("id").single();
  expect(m.error).toBeNull();
  const plates: string[] = [];
  const vehicleIds: string[] = [];
  for (let i = 0; i < (over.cars ?? 1); i++) {
    const plate = randomPlate("QR");
    const car = await db.from("vehicles").insert({ plate, make: "Toyota Camry", colour: "Blue", active: over.carActive ?? true }).select("id").single();
    expect(car.error).toBeNull();
    await db.from("member_vehicles").insert({ member_id: m.data!.id, vehicle_id: car.data!.id });
    plates.push(plate);
    vehicleIds.push(car.data!.id as string);
  }
  return { id: m.data!.id as string, local, plates, vehicleIds };
}

/** Remove a member, its vehicles, and every visit, audit row and alert they caused. */
export async function removeQrMember(m: QrMember) {
  const db = adminClient();
  const visits = (await db.from("visits").select("id").eq("member_id", m.id)).data ?? [];
  const ids = visits.map((v) => v.id as string);
  if (ids.length) {
    await db.from("audit_events").delete().in("visit_id", ids);
    await db.from("alerts").delete().in("visit_id", ids);
    await db.from("visits").delete().in("id", ids);
  }
  await db.from("members").delete().eq("id", m.id);
  await db.from("vehicles").delete().in("id", m.vehicleIds);
}

export async function enterPhone(page: Page, typed: string, area = QR_AREA) {
  await page.goto(`/c/${area}`);
  await page.getByLabel("Your phone number").fill(typed);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Check in through the screens, as the member would. Returns the pass address. */
export async function checkInVia(page: Page, local: string, area = QR_AREA): Promise<string> {
  await enterPhone(page, local, area);
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]{22}$/, { timeout: 60_000 });
  return page.url();
}

/** The credential cookie's value in a browser, or undefined. */
export async function credentialOf(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies()).find((c) => c.name === "cp_exit")?.value;
}

/** Put a credential cookie back in a browser, the way the server sets it. */
export async function setCredential(context: BrowserContext, value: string, origin: string) {
  const url = new URL(origin);
  await context.addCookies([{ name: "cp_exit", value, domain: url.hostname, path: "/c", httpOnly: true, sameSite: "Lax", secure: false }]);
}