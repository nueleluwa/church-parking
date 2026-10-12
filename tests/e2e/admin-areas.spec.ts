import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const NEW_NAME = "Roadside Overflow";

test("an admin renames a car park: it shows everywhere, persists, and no record or QR address breaks", async ({
  page,
  browser,
}) => {
  const db = adminClient();
  const { data: before } = await db.from("areas").select("id, name, slug").eq("slug", "road").single();
  const original = before!.name as string;
  const areaId = before!.id as number;

  // A visit already parked in this car park, made BEFORE the rename
  const plate = randomPlate("RN");
  await guestCheckIn(browser, plate, "road");
  const { count: visitsBefore } = await db
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("area_id", areaId);
  const { count: areasBefore } = await db.from("areas").select("id", { count: "exact", head: true });

  try {
    await adminSignIn(page);
    await page.goto("/admin/settings/parking-areas");
    await expect(page.getByRole("main").getByRole("heading", { name: "Parking areas" })).toBeVisible({ timeout: 60_000 });

    // Rename it
    await page.getByRole("button", { name: `Rename ${original}` }).click();
    const input = page.getByLabel("New name");
    await input.fill(NEW_NAME);
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Name saved.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(NEW_NAME, { exact: true })).toBeVisible();

    // It persists after a reload and in the database, with the same id and the same QR address
    await page.reload();
    await expect(page.getByText(NEW_NAME, { exact: true })).toBeVisible({ timeout: 60_000 });
    const { data: after } = await db.from("areas").select("id, name, slug").eq("id", areaId).single();
    expect(after).toEqual({ id: areaId, name: NEW_NAME, slug: "road" });

    // No duplicate car park, and every earlier record still points at it
    const { count: areasAfter } = await db.from("areas").select("id", { count: "exact", head: true });
    expect(areasAfter).toBe(areasBefore);
    const { count: visitsAfter } = await db
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("area_id", areaId);
    expect(visitsAfter).toBe(visitsBefore);

    // The rename is in the audit log, with who did it
    const { data: audit } = await db
      .from("audit_events")
      .select("action, before, after, staff_id")
      .eq("action", "rename_area")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(audit).toMatchObject({
      before: { area_id: areaId, name: original },
      after: { area_id: areaId, name: NEW_NAME },
    });
    expect(audit!.staff_id).not.toBeNull();

    // The same QR address (/c/road) now shows the new name in the check-in flow
    const guest = await (await browser.newContext()).newPage();
    await guest.goto("/c/road");
    await expect(guest.getByRole("heading", { name: NEW_NAME })).toBeVisible({ timeout: 60_000 });

    // ...and an attendant sees it on the car that was parked BEFORE the rename
    const attendant = await createStaff("attendant");
    const aPage = await (await browser.newContext()).newPage();
    try {
      await staffSignIn(aPage, attendant.phone, attendant.password);
      await aPage.goto("/staff/search");
      await aPage.getByLabel("Vehicle plate number").fill(plate);
      await aPage.getByRole("button", { name: "Search" }).click();
      await expect(aPage.locator("[data-area]", { hasText: NEW_NAME })).toBeVisible({ timeout: 60_000 });
      await expect(aPage.locator("[data-area]", { hasText: new RegExp("^" + original + "$") })).toHaveCount(0);

      // Attendants cannot reach the admin screens
      await aPage.goto("/admin/areas");
      await expect(aPage).toHaveURL(/\/staff$/);
      await expect(aPage.getByRole("link", { name: "Admin" })).toHaveCount(0);

      // The add-car list of areas uses the new name too
      await aPage.goto("/staff/register");
      await expect(aPage.getByRole("option", { name: NEW_NAME })).toHaveCount(1);
    } finally {
      await attendant.remove();
    }

    // The live board shows it as well
    await page.goto("/staff/dashboard");
    await expect(page.getByRole("heading", { name: NEW_NAME })).toBeVisible({ timeout: 60_000 });
  } finally {
    // Put the original name back
    await db.from("areas").update({ name: original }).eq("id", areaId);
  }
});

test("a car park name is checked before saving: empty, too short and duplicate names are refused", async ({ page }) => {
  const db = adminClient();
  const { data: areas } = await db.from("areas").select("id, name, slug").order("id");
  const cp1 = areas!.find((a) => a.slug === "cp1")!;
  const cp2 = areas!.find((a) => a.slug === "cp2")!;

  await adminSignIn(page);
  await page.goto("/admin/settings/parking-areas");
  await expect(page.getByRole("main").getByRole("heading", { name: "Parking areas" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: `Rename ${cp2.name}` }).click();
  const input = page.getByLabel("New name");

  // Only spaces: refused by the server
  await input.fill("     ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Please type a name for the car park.")).toBeVisible({ timeout: 60_000 });

  // Too short
  await input.fill("A");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("The name is too short.")).toBeVisible({ timeout: 60_000 });

  // A duplicate of another car park, in different capital letters
  await input.fill(cp1.name.toUpperCase());
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Another car park already has that name.")).toBeVisible({ timeout: 60_000 });

  // What was typed is still there after each refusal, and nothing was saved
  await expect(input).toHaveValue(cp1.name.toUpperCase());
  const { data: unchanged } = await db.from("areas").select("name").eq("id", cp2.id).single();
  expect(unchanged!.name).toBe(cp2.name);

  // Cancel closes the form without saving
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("New name")).toHaveCount(0);
});

test("only an administrator can reach the car park names", async ({ page }) => {
  const coordinator = await createStaff("coordinator");
  try {
    await staffSignIn(page, coordinator.phone, coordinator.password);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto("/admin/areas");
    await expect(page).toHaveURL(/\/staff$/);
  } finally {
    await coordinator.remove();
  }
});

test("the test service is not left in the live interface", async () => {
  // Global teardown switches it off after a run. While tests run it is on, with its plain name.
  const db = adminClient();
  const { data } = await db.from("services").select("name, active").in("name", ["Automated test service", "TEST ALL DAY"]);
  expect((data ?? []).filter((s) => s.name === "TEST ALL DAY")).toEqual([]);
});
