import { expect, test } from "@playwright/test";
import { adminClient, live, randomPhone, randomPlate } from "./helpers";
import { fakeCameraArgs } from "./fake-camera";

test.setTimeout(240_000);
test.skip(!live, "needs .env.local with the Supabase key");

const SIGN_HOST = "https://churchparking.online";

async function openAreas() {
  const { data } = await adminClient().from("areas").select("name, slug").eq("active", true).order("sort");
  expect(data!.length).toBeGreaterThan(1);
  return data!;
}

async function visitsFor(plate: string) {
  const db = adminClient();
  const { data: v } = await db.from("vehicles").select("id").eq("plate", plate);
  if (!v?.length) return [];
  const { data } = await db.from("visits").select("id, areas(name)").in("vehicle_id", v.map((x) => x.id));
  return data ?? [];
}

test.describe("scanning a real sign", () => {
  let areas: Awaited<ReturnType<typeof openAreas>>;
  test.beforeAll(async () => {
    areas = await openAreas();
  });
  test("the sign picks the car park; the driver reviews their details and completes one check-in", async () => {
    const target = areas[1];
    const { chromium } = await import("@playwright/test");
    const b = await chromium.launch({ args: fakeCameraArgs("valid", `${SIGN_HOST}/c/${target.slug}`) });
    const context = await b.newContext({ permissions: ["camera"], viewport: { width: 412, height: 915 }, baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3457" });
    const page = await context.newPage();
    try {
      await page.goto("/scan");
      await expect(page.getByRole("heading", { name: "Scan the car park sign" })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Where are you parking?")).toHaveCount(0);

      // Found: the car park is named, then its check-in opens once
      await expect(page.getByRole("status").getByText(target.name)).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveURL(new RegExp(`/c/${target.slug}$`), { timeout: 60_000 });
      await expect(page.getByText(target.name, { exact: true }).first()).toBeVisible();

      const plate = randomPlate();
      await page.getByRole("button", { name: "Continue as guest" }).click();
      await page.getByLabel("Your name").fill("Scan Tester");
      await page.getByLabel("Phone number").fill(randomPhone());
      await page.getByLabel("Plate number").fill(plate);
      await page.getByRole("button", { name: "Get my pass" }).click();
      await page.getByRole("button", { name: "Yes, get my pass" }).click();
      await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });

      // Exactly one visit, in the car park the sign named
      const visits = await visitsFor(plate);
      expect(visits).toHaveLength(1);
      expect((visits[0].areas as unknown as { name: string }).name).toBe(target.name);

      // Back from the pass does not start a second check-in
      await page.goBack();
      expect(await visitsFor(plate)).toHaveLength(1);
    } finally {
      await b.close();
    }
  });
});

const bad: [string, string | undefined, RegExp][] = [
  ["another website's QR code", "https://example.com/c/cp1", /not a Church Parking car park sign/],
  ["a sign for a car park that does not exist", `${SIGN_HOST}/c/old-lot`, /not in use/],
  ["a parking pass", `${SIGN_HOST}/p/aaaaaaaaaaaaaaaaaaaaaa`, /parking pass, not a car park sign/],
];

for (const [label, text, message] of bad) {
  test(`${label}: a clear message, the camera keeps looking, and no car park is chosen`, async () => {
    const { chromium } = await import("@playwright/test");
    const b = await chromium.launch({ args: fakeCameraArgs(`bad-${label.replace(/W+/g, "-")}`, text) });
    const context = await b.newContext({ permissions: ["camera"], viewport: { width: 360, height: 740 }, baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3457" });
    const page = await context.newPage();
    try {
      await page.goto("/scan");
      await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(2500); // a repeated scan of the same code changes nothing
      await expect(page).toHaveURL(new RegExp("/scan$"));
      await expect(page.getByRole("alert").filter({ hasText: message })).toHaveCount(1);
      await expect(page.getByRole("status")).toHaveCount(0);
      await page.getByRole("link", { name: "Go back" }).click();
      await expect(page.getByRole("heading", { name: "Welcome to Church Parking" })).toBeVisible({ timeout: 60_000 });
    } finally {
      await b.close();
    }
  });
}

test("a refused camera permission shows the reason and Try again, and the page stays put", async () => {
  const { chromium } = await import("@playwright/test");
  const b = await chromium.launch();
  const context = await b.newContext({ viewport: { width: 360, height: 740 }, baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3457" });
  const page = await context.newPage();
  // What a browser does when the driver taps "Block"
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  try {
    await page.goto("/scan");
    await expect(page.getByRole("alert").filter({ hasText: /Camera access is blocked/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Where are you parking?")).toHaveCount(0);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Camera access is blocked/ })).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp("/scan$"));
  } finally {
    await b.close();
  }
});
