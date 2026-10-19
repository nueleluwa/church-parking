import { expect, test } from "@playwright/test";
import { adminClient, createStaff, live, randomPhone, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(240_000);

const e164 = (local: string) => `+234${local.slice(1)}`;
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

test("an attendant looks first, adds a member with no PIN, and a repeat is refused", async ({ page }) => {
  const db = adminClient();
  const attendant = await createStaff("attendant");
  const local = randomPhone();
  const plate = randomPlate("SM");
  const name = "Zqs Staff Added";
  try {
    const add = page.getByRole("region", { name: "2. Add the member" });
    await staffSignIn(page, attendant.phone, attendant.password);

    // Reachable from More
    await page.goto("/staff/more");
    await page.getByRole("link", { name: "Add Member" }).click();
    await expect(page).toHaveURL(/\/staff\/register\/member$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Add Member" })).toBeVisible();

    // Check first: nobody with this number yet
    await page.getByLabel("Phone number or plate").fill(local);
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.getByText("No member found. You can add them below.")).toBeVisible({ timeout: 30_000 });

    // A search that is neither a Nigerian number nor a plate says so
    await page.getByLabel("Phone number or plate").fill("12");
    await page.getByRole("button", { name: "Check" }).click();
    await expect(page.getByText("Type a phone number such as 0803 123 4567, or a plate number.")).toBeVisible({ timeout: 30_000 });

    // Problems show on their own fields
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText("Enter the member's full name.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Enter the phone number.")).toBeVisible();
    await expect(page.getByText("Add the member's vehicle plate number.")).toBeVisible();

    // An international number cannot be found by the check-in, so staff are told to register the car instead
    await add.getByLabel("Full name").fill(name);
    await add.getByLabel("Phone number").fill("+44 7700 900123");
    await add.getByLabel("Plate number").fill(plate);
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText(/needs a Nigerian number/)).toBeVisible({ timeout: 30_000 });
    expect((await db.from("members").select("id").eq("full_name", name)).data).toHaveLength(0);

    // A good one is saved
    await add.getByLabel("Phone number").fill(local);
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByRole("heading", { name: "Member added" })).toBeVisible({ timeout: 60_000 });

    const { data: m } = await db.from("members").select("id, active, pin_hash, phone_local").eq("phone", e164(local)).single();
    expect(m).toMatchObject({ active: true, pin_hash: null, phone_local: local });
    const links = (await db.from("member_vehicles").select("vehicles(plate)").eq("member_id", m!.id)).data as unknown as { vehicles: { plate: string } }[];
    expect(links.map((l) => l.vehicles.plate)).toEqual([plate]);
    const audit = (await db.from("audit_events").select("staff_id").eq("action", "staff_register_member").eq("after->>member_id", m!.id)).data;
    expect(audit).toEqual([{ staff_id: attendant.id }]);

    // Check again, by number and by plate: found, with a first name, the last four digits and the plate, never the full number
    await page.goto("/staff/register/member");
    for (const query of [local, plate]) {
      await page.getByLabel("Phone number or plate").fill(query);
      await page.getByRole("button", { name: "Check" }).click();
      const found = page.getByRole("list", { name: "Members found" });
      await expect(found).toContainText("Zqs", { timeout: 30_000 });
      await expect(found).toContainText(`•••• ${local.slice(-4)}`);
      await expect(found).toContainText(spaced(plate));
      await expect(found).toContainText("Already a member");
      await expect(found).not.toContainText("Staff Added");
      await expect(page.locator("body")).not.toContainText(local);
    }

    // The same number again, or the same plate, is refused and nothing new is made
    await add.getByLabel("Full name").fill("Someone Else");
    await add.getByLabel("Phone number").fill(local);
    await add.getByLabel("Plate number").fill(randomPlate("SN"));
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText("This phone number is already a member. Search for them above.")).toBeVisible({ timeout: 30_000 });
    await add.getByLabel("Phone number").fill(randomPhone());
    await add.getByLabel("Plate number").fill(plate);
    await add.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText(`${spaced(plate)} is already saved to a member.`)).toBeVisible({ timeout: 30_000 });
    expect((await db.from("members").select("id").eq("phone", e164(local))).data).toHaveLength(1);
    expect((await db.from("audit_events").select("id").eq("action", "staff_register_member").eq("staff_id", attendant.id)).data).toHaveLength(1);
  } finally {
    const found = (await db.from("members").select("id").eq("phone", e164(local))).data ?? [];
    for (const f of found) await db.from("members").delete().eq("id", f.id);
    await db.from("vehicles").delete().eq("plate", plate);
    await attendant.remove();
  }
});

test("only signed-in staff can reach the screen, and it fits narrow phones", async ({ page, browser }) => {
  // Not signed in: sent to the sign-in page
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/staff/register/member");
  await expect(guest).toHaveURL(/\/staff\/signin/, { timeout: 60_000 });

  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/staff/register/member");
      await expect(page.getByRole("heading", { name: "2. Add the member" })).toBeVisible({ timeout: 60_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
    }
  } finally {
    await attendant.remove();
  }
});
