import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);


async function visitIdOf(plate: string) {
  const { data } = await adminClient().from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  return data!.id as string;
}

test("a visit has Details, Timeline and Member / guest tabs, and a coordinator can release the car from it after one confirmation", async ({ page, browser }) => {
  const plate = randomPlate("VA");
  await guestCheckIn(browser, plate);
  const id = await visitIdOf(plate);
  await adminSignIn(page);
  await page.goto(`/admin/visits/${id}`);

  const tabs = page.getByRole("navigation", { name: "Visit" });
  await expect(tabs.getByRole("link", { name: "Details" })).toHaveAttribute("aria-current", "page", { timeout: 60_000 });
  await tabs.getByRole("link", { name: "Timeline" }).click();
  await expect(page.getByText("Checked in", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await tabs.getByRole("link", { name: "Member / guest" }).click();
  await expect(page.getByText("GUEST", { exact: true })).toBeVisible({ timeout: 60_000 });
  await tabs.getByRole("link", { name: "Details" }).click();

  // Cancel does nothing; confirming releases
  await page.getByRole("button", { name: "Release car" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await adminClient().from("visits").select("status").eq("id", id).single()).data!.status).toBe("parked");
  await page.getByRole("button", { name: "Release car" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page.getByText("Released", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const { data: done } = await adminClient().from("visits").select("status, release_method").eq("id", id).single();
  expect(done).toMatchObject({ status: "released", release_method: "search" });
  await expect(page.getByRole("button", { name: "Release car" })).toHaveCount(0);
});

test("Mark as mismatch holds the car and raises an alert", async ({ page, browser }) => {
  const plate = randomPlate("VM");
  await guestCheckIn(browser, plate);
  const id = await visitIdOf(plate);
  await adminSignIn(page);
  await page.goto(`/admin/visits/${id}`);
  await page.getByRole("button", { name: "Mark as mismatch" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page.getByText("ON HOLD", { exact: true })).toBeVisible({ timeout: 60_000 });
  const { data: alert } = await adminClient().from("alerts").select("kind").eq("visit_id", id);
  expect(alert!.map((a) => a.kind)).toContain("no_match");
  await expect(page.getByRole("button", { name: "Release car" })).toHaveCount(0);
});

test("signs: the QR code can be downloaded, and a sign can be set for A4 or A5 paper", async ({ page }) => {
  const { data: areas } = await adminClient().from("areas").select("name, slug").eq("active", true).order("sort");
  const first = areas![0];
  await adminSignIn(page);
  await page.goto("/admin/signs");
  const card = page.locator("li").filter({ hasText: first.name }).first();
  const download = card.getByRole("link", { name: "Download the QR code" });
  await expect(download).toHaveAttribute("download", `qr-${first.slug}.svg`, { timeout: 60_000 });
  expect(decodeURIComponent((await download.getAttribute("href"))!)).toContain("<svg");

  await page.goto(`/admin/signs/${first.slug}`);
  const size = page.getByRole("navigation", { name: "Paper size" });
  await expect(size.getByRole("link", { name: "A4 (portrait)" })).toHaveAttribute("aria-current", "true", { timeout: 60_000 });
  expect(await page.locator("style").evaluateAll((els) => els.map((e) => e.textContent).join(" "))).toContain("size: A4 portrait");
  await size.getByRole("link", { name: "A5 (portrait)" }).click();
  await expect(page).toHaveURL(/size=a5/, { timeout: 60_000 });
  await expect(size.getByRole("link", { name: "A5 (portrait)" })).toHaveAttribute("aria-current", "true");
  expect(await page.locator("style").evaluateAll((els) => els.map((e) => e.textContent).join(" "))).toContain("size: A5 portrait");
});

test("a coordinator can see the Visits list from the live board, but not the admin-only screens", async ({ browser }) => {
  const lead = await createStaff("coordinator");
  try {
    const page = await (await browser.newContext()).newPage();
    await staffSignIn(page, lead.phone, lead.password);
    await page.goto("/staff/dashboard");
    await page.getByRole("link", { name: "View all vehicles" }).click();
    await expect(page).toHaveURL(/\/admin\/visits\?status=parked/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Visits", exact: true })).toBeVisible();
    await page.goto("/admin/vehicles");
    await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await lead.remove();
  }
});
