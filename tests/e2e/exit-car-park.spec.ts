import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

async function twoCarParks() {
  const { data } = await adminClient().from("areas").select("id, name, slug").eq("active", true).order("sort").limit(2);
  expect(data!.length).toBe(2);
  return { a: data![0], b: data![1] };
}

async function chooseStation(page: Page, name: string) {
  await page.goto("/staff");
  await page.getByLabel("Which car park are you at?").selectOption({ label: name });
  await expect(page.getByLabel("Which car park are you at?")).toHaveValue(/.+/);
}

async function lookUp(page: Page, plate: string) {
  await page.goto("/staff/search");
  await page.getByLabel("Vehicle plate number").fill(plate);
  await page.getByRole("button", { name: "Search" }).click();
}

test("an attendant says which car park they are at, and the phone remembers it", async ({ page }) => {
  const { a, b } = await twoCarParks();
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.goto("/staff");
    const picker = page.getByLabel("Which car park are you at?");
    await expect(picker).toHaveValue("");
    await picker.selectOption({ label: b.name });
    await expect(page.getByLabel("Which car park are you at?")).toHaveValue(b.slug, { timeout: 30_000 });

    // Still there after a reload and on the scan and search screens
    await page.reload();
    await expect(page.getByLabel("Which car park are you at?")).toHaveValue(b.slug);
    for (const path of ["/staff/scan", "/staff/search"]) {
      await page.goto(path);
      await expect(page.getByLabel("You are at")).toHaveValue(b.slug, { timeout: 60_000 });
    }

    // Change it from the search screen, and clear it
    await page.getByLabel("You are at").selectOption({ label: a.name });
    await expect(page.getByLabel("You are at")).toHaveValue(a.slug);
    await page.reload();
    await expect(page.getByLabel("You are at")).toHaveValue(a.slug);
    await page.getByLabel("You are at").selectOption({ label: "Not chosen" });
    await page.reload();
    await expect(page.getByLabel("You are at")).toHaveValue("");
  } finally {
    await attendant.remove();
  }
});

test("a car from another car park is flagged at this exit; the attendant can move it, and it is recorded", async ({ page, browser }) => {
  const { a, b } = await twoCarParks();
  const db = adminClient();
  const plate = randomPlate("EX");
  await guestCheckIn(browser, plate, a.slug); // checked in at car park A
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);

    // At A's own exit: no warning
    await chooseStation(page, a.name);
    await lookUp(page, plate);
    await expect(page.getByRole("heading", { name: "Ready for exit" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("car-park-mismatch")).toHaveCount(0);

    // Nowhere chosen: no warning
    await page.goto("/staff");
    await page.getByLabel("Which car park are you at?").selectOption({ label: "Not chosen" });
    await expect(page.getByLabel("Which car park are you at?")).toHaveValue("", { timeout: 30_000 });
    await lookUp(page, plate);
    await expect(page.getByRole("heading", { name: "Ready for exit" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("car-park-mismatch")).toHaveCount(0);

    // At B's exit: the warning names both car parks, with the way to put it right
    await chooseStation(page, b.name);
    await lookUp(page, plate);
    const warning = page.getByTestId("car-park-mismatch");
    await expect(warning).toBeVisible({ timeout: 60_000 });
    await expect(warning).toContainText(`This car checked in at ${a.name}, but you are at ${b.name}.`);
    await expect(warning).toContainText("tap Does not match");
    // Release and Does not match are still there: it is a warning, not a block
    await expect(page.getByRole("button", { name: "Release car" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Does not match" })).toBeVisible();

    // The warning is readable and accessible
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);

    // One tap moves it, and the card shows the new car park
    await warning.getByRole("button", { name: `Move to ${b.name}` }).click();
    await expect(page.getByText(`Car park changed to ${b.name}.`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("car-park-mismatch")).toHaveCount(0);
    await expect(page.locator("[data-area]")).toHaveText(b.name);

    // It really changed, and it was recorded with who did it and why
    const { data: visit } = await db.from("visits").select("id, area_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
    expect(visit!.area_id).toBe(b.id);
    const { data: audit } = await db
      .from("audit_events")
      .select("action, reason, staff_id, before, after")
      .eq("visit_id", visit!.id)
      .eq("action", "change_area")
      .single();
    expect(audit!.reason).toContain(b.name);
    expect(audit!.staff_id).not.toBeNull();
    expect(audit!.before).toMatchObject({ area_id: a.id });
    expect(audit!.after).toMatchObject({ area_id: b.id });

    // And the car can then be released as usual
    await page.getByRole("button", { name: "Release car" }).click();
    await expect(page.getByRole("heading", { name: "Car released" })).toBeVisible({ timeout: 60_000 });
  } finally {
    await attendant.remove();
  }
});

test("any attendant can correct the car park even without saying where they stand; a car that has left cannot be moved", async ({ page, browser }) => {
  const { a, b } = await twoCarParks();
  const db = adminClient();
  const plate = randomPlate("EY");
  await guestCheckIn(browser, plate, a.slug);
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.goto("/staff");
    await page.getByLabel("Which car park are you at?").selectOption({ label: "Not chosen" });
    await lookUp(page, plate);
    await expect(page.getByRole("heading", { name: "Ready for exit" })).toBeVisible({ timeout: 60_000 });

    // The ordinary attendant has no coordinator corrections, but does have this one
    await expect(page.getByText("Corrections (coordinator)")).toHaveCount(0);
    await page.getByText("Wrong car park?").click();
    const choose = page.getByLabel("Move this car to");
    await expect(choose.locator("option", { hasText: a.name })).toHaveCount(0); // not its current car park
    await choose.selectOption({ label: b.name });
    await page.getByRole("button", { name: "Move car" }).click();
    await expect(page.getByText(`Car park changed to ${b.name}.`)).toBeVisible({ timeout: 30_000 });
    const { data: moved } = await db.from("visits").select("area_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
    expect(moved!.area_id).toBe(b.id);

    // The car leaves (released by someone else) while this card is still open: the move is refused plainly
    await db.from("visits").update({ status: "released", released_at: new Date().toISOString(), release_method: "scan" }).eq("vehicle_id", (await db.from("vehicles").select("id").eq("plate", plate).single()).data!.id);
    await choose.selectOption({ label: a.name });
    await page.getByRole("button", { name: "Move car" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This car has already left" })).toBeVisible();
    const { data: still } = await db.from("visits").select("area_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
    expect(still!.area_id).toBe(b.id);

    // A car that has already left shows no way to change its car park
    await lookUp(page, plate);
    await expect(page.getByRole("heading", { name: "Already released" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Wrong car park?")).toHaveCount(0);
  } finally {
    await attendant.remove();
  }
});
