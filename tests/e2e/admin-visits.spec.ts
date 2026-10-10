import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, memberSignUp, randomPlate, staffSignIn } from "./helpers";

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
  await expect(page.locator("li").getByText(/Last activity|No recorded activity yet/).first()).toBeVisible({ timeout: 60_000 });
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

test("visits: summary, search by plate, day buttons, sorting, hold flag, and the export for admins only", async ({ page, browser }) => {
  const plate = randomPlate("VU");
  await guestCheckIn(browser, plate);
  const id = await visitIdOf(plate);
  await adminSignIn(page);

  await page.goto(`/admin/visits?q=${plate}`);
  await expect(page.getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary).toContainText("Parked now");
  await expect(page.locator("li").filter({ hasText: `${plate.slice(0, 3)} ${plate.slice(3, 6)}` })).toHaveCount(1);
  await expect(page.locator("li").filter({ hasText: /so far/ })).toHaveCount(1); // a parked car's stay so far

  // A look-alike letter finds it too, and a plate that is not there lists nothing
  await page.goto(`/admin/visits?q=${plate.replace(/[0-9]/, (d) => (d === "0" ? "O" : d))}`);
  await expect(page.locator("li").filter({ hasText: `${plate.slice(0, 3)} ${plate.slice(3, 6)}` })).toHaveCount(1);
  await page.goto("/admin/visits?q=ZZZ999ZZ");
  await expect(page.getByText("No visits match.")).toBeVisible({ timeout: 60_000 });

  // Sorting is chosen by a link and kept in the address
  await page.goto("/admin/visits");
  await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "Oldest first" }).click();
  await expect(page).toHaveURL(/sort=old/, { timeout: 60_000 });

  // Yesterday, then back to today
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/, { timeout: 60_000 });
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page).not.toHaveURL(/date=/);

  // A held car says so in the list
  await adminClient().rpc("hold_visit", { p_visit: id, p_staff: (await adminClient().from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single()).data!.id });
  await page.goto(`/admin/visits?q=${plate}`);
  await expect(page.locator("li").filter({ hasText: "On hold" })).toHaveCount(1, { timeout: 60_000 });

  // The export is for admins: it follows the day and car park, and a coordinator does not see it
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  expect(href).toMatch(/\/admin\/reports\/export\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    await c.goto("/admin/visits");
    await expect(c.getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(c.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  } finally {
    await lead.remove();
  }
});

test("staff accounts: summary, search and role filter, editing a name and phone, and recent activity", async ({ page }) => {
  const db = adminClient();
  const first = await createStaff("attendant");
  const second = await createStaff("attendant");
  try {
    await adminSignIn(page);
    await page.goto("/admin/staff");
    const summary = page.getByRole("region", { name: "Summary" });
    await expect(summary).toContainText("Attendants", { timeout: 60_000 });
    await expect(summary).toContainText("Admins");

    // Role filter and search
    const attendantsOnly = page.getByRole("navigation", { name: "Role" }).getByRole("link", { name: "Attendants" });
    await attendantsOnly.click();
    await expect(page).toHaveURL(/role=attendant/, { timeout: 60_000 });
    await expect(page.locator("li").filter({ hasText: /\(you\)/ })).toHaveCount(0);
    await page.goto("/admin/staff?q=zzzz-nobody");
    await expect(page.getByText("No one matches.")).toBeVisible({ timeout: 60_000 });

    // Change a name and phone number; a number already in use is refused
    await page.goto(`/admin/staff?q=${encodeURIComponent(first.phone.slice(-7))}`);
    const card = page.locator("li").filter({ hasText: /Manage / }).first();
    await card.getByText(/^Manage /).click();
    const newName = `Renamed ${Math.floor(Math.random() * 100000)}`;
    await card.getByLabel("Full name").fill(newName);
    await card.getByLabel("Phone number").fill(second.phone);
    await card.getByRole("button", { name: "Save name and phone" }).click();
    await expect(card.getByText("Someone already has an account with that phone number.")).toBeVisible({ timeout: 30_000 });
    const freshPhone = `080${Math.floor(10000000 + Math.random() * 89999999)}`;
    await card.getByLabel("Phone number").fill(freshPhone);
    await card.getByRole("button", { name: "Save name and phone" }).click();
    await expect(card.getByText("Saved.").first()).toBeVisible({ timeout: 30_000 });
    const { data: row } = await db.from("staff").select("full_name, phone").eq("id", first.id).single();
    expect(row).toMatchObject({ full_name: newName, phone: `+234${freshPhone.slice(1)}` });

    // The change shows in that person's recent activity on the next look
    await page.goto(`/admin/staff?q=${encodeURIComponent(newName)}`);
    const again = page.locator("li").filter({ hasText: newName });
    await again.getByText(/^Manage /).click();
    await expect(again.getByRole("region", { name: new RegExp(`Recent activity of ${newName}`) })).toBeVisible();
  } finally {
    await first.remove();
    await second.remove();
  }
});

test("vehicles: summary, type and car park filters, sorting, and paging keep the choice in the address", async ({ page, browser }) => {
  const plate = randomPlate("VF");
  await guestCheckIn(browser, plate); // a guest car, in the first car park
  const { data: areas } = await adminClient().from("areas").select("name, slug").eq("active", true).order("sort");
  await adminSignIn(page);

  await page.goto(`/admin/vehicles?q=${plate}`);
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary).toContainText("Cars shown", { timeout: 60_000 });
  await expect(summary).toContainText("Guest cars");
  const row = page.locator("li").filter({ hasText: `${plate.slice(0, 3)} ${plate.slice(3, 6)}` });
  await expect(row).toHaveCount(1);

  // Guests only: still there. Members only: gone. The right car park keeps it; another does not
  await page.goto(`/admin/vehicles?q=${plate}&type=guest`);
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  await page.goto(`/admin/vehicles?q=${plate}&type=member`);
  await expect(page.getByText("No car found with that plate.")).toBeVisible({ timeout: 60_000 });
  await page.goto(`/admin/vehicles?q=${plate}&area=${areas![0].slug}`);
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  await page.goto(`/admin/vehicles?q=${plate}&area=${areas![1].slug}`);
  await expect(page.getByText("No car found with that plate.")).toBeVisible({ timeout: 60_000 });

  // Sorting is a link; a filter keeps the others
  await page.goto("/admin/vehicles?type=guest");
  await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "Most visits" }).click();
  await expect(page).toHaveURL(/type=guest.*sort=visits|sort=visits.*type=guest/, { timeout: 60_000 });
  await page.getByRole("navigation", { name: "Type" }).getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/type=member/);
  await expect(page).toHaveURL(/sort=visits/);
});

test("analytics: average stay, missed rate, members' share, how long cars stay, and a service filter that the quick ranges keep", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("AU"));
  await adminSignIn(page);
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  await page.goto(`/admin/analytics?from=${day}&to=${day}`);
  await expect(page.getByTestId("a-average-stay")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("a-missed-rate")).toHaveText(/^\d+%$/);
  await expect(page.getByTestId("a-members")).toHaveText(/^\d+%$/);
  await expect(page.getByRole("region", { name: "How long cars stay" })).toBeVisible();

  // A service from today's records can be chosen, and the quick links keep the choice
  const options = await page.getByLabel("Service").locator("option").allTextContents();
  if (options.length > 2) {
    await page.getByLabel("Service").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Show analytics" }).click();
    await expect(page).toHaveURL(/service=\d+/, { timeout: 60_000 });
    expect(await page.getByRole("link", { name: "Last 7 days" }).getAttribute("href")).toContain("service=");
  }
  expect(await page.getByRole("link", { name: /Export these visits/ }).getAttribute("href")).toMatch(/export\?from=/);
});
