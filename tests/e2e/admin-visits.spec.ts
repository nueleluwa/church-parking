import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, guestCheckIn, live, memberSignUp, randomPlate } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

test("Visits lists today's visits by car park and status, and opens one; the dashboard numbers lead here", async ({ page, browser }) => {
  const plate = randomPlate("VS");
  await guestCheckIn(browser, plate);
  await adminSignIn(page);

  await page.goto("/admin/visits");
  await expect(page.getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
  const row = page.locator("li").filter({ hasText: spaced(plate) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Parked");
  await expect(row).toContainText("Guest");
  await expect(page.locator("main")).not.toContainText(/\+?234\d{9}|080\d{8}/);

  // The status buttons say how many each would list, and Released does not list a parked car
  await page.getByRole("link", { name: /^Released \(/ }).click();
  await expect(page).toHaveURL(/status=released/);
  await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(0);
  await page.getByRole("link", { name: /^Parked \(/ }).click();
  await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(1);

  // Opening the visit goes to its details
  await page.getByRole("link", { name: `Visit of ${spaced(plate)}` }).click();
  await expect(page).toHaveURL(/\/admin\/visits\/[0-9a-f-]{36}$/, { timeout: 60_000 });

  // The dashboard's Still parked number and a car park card lead to the list
  await page.goto("/admin");
  await page.getByRole("link", { name: /Still parked/ }).click();
  await expect(page).toHaveURL(/\/admin\/visits\?status=parked/, { timeout: 60_000 });
  await page.goto("/admin");
  await page.getByRole("link", { name: /see its visits/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/visits\?area=/, { timeout: 60_000 });
});

test("a day with nothing says so, and a made-up car park or status is ignored", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin/visits?date=2020-01-01&area=nowhere&status=bogus");
  await expect(page.getByText("No visits match.")).toBeVisible({ timeout: 60_000 });
});

test("members: a recent list to begin with, counts on each card, and a page with the member's cars and visits", async ({ page, browser }) => {
  const memberPage = await (await browser.newContext()).newPage();
  const phone = await memberSignUp(memberPage, "4821");
  await expect(memberPage).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });

  await adminSignIn(page);
  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "Seen most recently" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("li").filter({ hasText: phone.slice(1) })).toHaveCount(1);

  await page.goto(`/admin/members?q=${phone}`);
  const card = page.locator("li").filter({ hasText: phone.slice(1) });
  await expect(card).toContainText("0 saved cars");
  await card.getByRole("link", { name: "View cars and visits" }).click();
  await expect(page).toHaveURL(/\/admin\/members\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByText("No saved cars.")).toBeVisible();
  await expect(page.getByText("No visits yet.")).toBeVisible();
  await page.goto("/admin/members/not-an-id");
  await expect(page.getByText("We cannot find that page")).toBeVisible();
});

test("staff accounts show when each person last did something", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin/staff");
  await expect(page.getByText(/Last activity|No recorded activity yet/).first()).toBeVisible({ timeout: 60_000 });
});

test("reports and analytics can be limited to one car park, and the CSV follows the choice", async ({ page, browser }) => {
  const plate = randomPlate("RA");
  await guestCheckIn(browser, plate); // the first car park
  await adminSignIn(page);

  const { data: areas } = await adminClient().from("areas").select("name, slug").eq("active", true).order("sort");
  const [first, other] = [areas![0], areas![1]];

  await page.goto(`/admin/reports?area=${first.slug}&view=visitors`);
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: new RegExp(`Visit details for ${plate.slice(0, 3)}`) }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();

  // The CSV for that car park has the car, and for another car park it does not
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  expect(href).toContain(`area=${first.slug}`);
  expect(await (await page.request.get(href!)).text()).toContain(plate);
  const otherHref = href!.replace(`area=${first.slug}`, `area=${other.slug}`);
  const res = await page.request.get(otherHref);
  expect(res.headers()["content-disposition"]).toContain(other.slug);
  expect(await res.text()).not.toContain(plate);

  await page.goto(`/admin/analytics?area=${other.slug}`);
  await expect(page.getByText(other.name, { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("(today is not over yet)").first()).toBeVisible();
});

test("members can also be found by the plate of a saved car", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("MP");
  const memberPage = await (await browser.newContext()).newPage();
  const phone = await memberSignUp(memberPage, "4821");
  await expect(memberPage).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  const { data: member } = await db.from("members").select("id").eq("phone", `+234${phone.slice(1)}`).single();
  const { data: car } = await db.from("vehicles").insert({ plate }).select("id").single();
  await db.from("member_vehicles").insert({ member_id: member!.id, vehicle_id: car!.id });

  await adminSignIn(page);
  await page.goto(`/admin/members?q=${plate}`);
  await expect(page.locator("li").filter({ hasText: phone.slice(1) })).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator("li").filter({ hasText: phone.slice(1) })).toContainText("1 saved car");
});

test("the dashboard lets you pick which service's numbers to see", async ({ page }) => {
  const db = adminClient();
  const weekday = new Date().getUTCDay() === 0 ? 0 : new Date().getUTCDay();
  const name = `Picker test ${Math.floor(Math.random() * 100000)}`;
  const { data: extra } = await db.from("services").insert({ name, weekday, starts_at: "00:00", ends_at: "23:59", active: true }).select("id").single();
  try {
    await adminSignIn(page);
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Choose a service" });
    await expect(nav).toBeVisible({ timeout: 60_000 });
    await nav.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(new RegExp(`service=${extra!.id}`), { timeout: 60_000 });
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("aria-current", "true");
    await expect(page.getByText(new RegExp(`${name} · 00:00 to 23:59`)).first()).toBeVisible();
  } finally {
    await db.from("services").delete().eq("id", extra!.id);
  }
});

test("reports have four views: service, car park, exceptions and the visitor list, and the summary stays above them", async ({ page }) => {
  const { data: areas } = await adminClient().from("areas").select("name").eq("active", true);
  await adminSignIn(page);
  await page.goto("/admin/reports");
  const tabs = page.getByRole("navigation", { name: "Report" });
  await expect(tabs.getByRole("link", { name: "Service report" })).toHaveAttribute("aria-current", "page", { timeout: 60_000 });
  await expect(page.getByTestId("r-checked-in")).toBeVisible();

  await tabs.getByRole("link", { name: "Car park report" }).click();
  await expect(page).toHaveURL(/view=area/, { timeout: 60_000 });
  for (const a of areas!) await expect(page.locator("li").filter({ hasText: a.name }).first()).toBeVisible();
  await expect(page.getByTestId("r-checked-in")).toBeVisible();

  await tabs.getByRole("link", { name: "Exceptions" }).click();
  await expect(page.getByRole("heading", { name: "Released without a pass" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Missed check-outs" })).toBeVisible();

  await tabs.getByRole("link", { name: "Visitor list" }).click();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 60_000 });
});
