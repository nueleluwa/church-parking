import { hash } from "@node-rs/argon2";
import { createClient } from "@supabase/supabase-js";
import { expect, type Browser, type Page } from "@playwright/test";

export const live = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ADMIN_PHONE);

export const randomPhone = () => `080${Math.floor(10000000 + Math.random() * 89999999)}`;

export const randomPlate = (tail = "ZZ") =>
  `${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}${
    100 + Math.floor(Math.random() * 900)
  }${tail}`;

export function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function staffSignIn(page: Page, phone: string, password: string) {
  await page.goto("/staff/signin");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff\/scan$/, { timeout: 60_000 });
}

export async function adminSignIn(page: Page) {
  await staffSignIn(page, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);
}

/** Make a throw-away staff account. Call the returned `remove` when done: it switches the account off. */
export async function createStaff(role: "attendant" | "coordinator") {
  const db = adminClient();
  const phone = `+234${randomPhone().slice(1)}`;
  const password = "stability-test-password";
  const { data, error } = await db
    .from("staff")
    .insert({ full_name: `Test ${role}`, phone, password_hash: await hash(password), role })
    .select("id")
    .single();
  expect(error).toBeNull();
  return {
    phone,
    password,
    remove: async () => {
      await db.from("staff").update({ active: false }).eq("id", data!.id);
    },
  };
}

export async function memberSignUp(page: Page, pin = "4821", next = "") {
  const phone = randomPhone();
  await page.goto(`/account/signup${next}`);
  await page.getByLabel("Your name").fill("Stability Member");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Choose a PIN (4 numbers)").fill(pin);
  await page.getByLabel("Type the PIN again").fill(pin);
  await page.getByRole("button", { name: "Create my account" }).click();
  return phone;
}

/** A guest checks in on their own phone. Returns the pass URL. */
export async function guestCheckIn(browser: Browser, plate: string, area = "cp1") {
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(`/c/${area}`);
  await guest.getByLabel("Your name").fill("Stability Guest");
  await guest.getByLabel("Phone number").fill(randomPhone());
  await guest.getByLabel("Plate number").fill(plate);
  await guest.getByRole("button", { name: "Get my pass" }).click();
  await guest.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(guest.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const url = guest.url();
  await ctx.close();
  return url;
}

/**
 * Watch a page for `seconds` and report what an interrupted user would notice:
 * full document loads, the header being torn down and rebuilt, and whether the
 * browser's own state (a marker on the document) survived.
 */
export async function observe(page: Page, seconds: number) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__marker = Math.random();
    document.body.dataset.marker = String(w.__marker);
    const header = document.querySelector("header");
    w.__header = header;
    w.__headerRemoved = 0;
    w.__bodyMutations = 0;
    const watch = new MutationObserver((list) => {
      for (const m of list) {
        m.removedNodes.forEach((n) => {
          if (n === header || (n instanceof Element && n.contains(header))) (w.__headerRemoved as number)++;
        });
      }
    });
    watch.observe(document.documentElement, { childList: true, subtree: true });
  });
  const startUrl = page.url();
  const requests: string[] = [];
  const onRequest = (r: { url(): string; method(): string }) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/_next") || u.pathname.startsWith("/__nextjs")) return;
    requests.push(`${r.method()} ${u.pathname}`);
  };
  page.on("request", onRequest);
  let loads = 0;
  const onLoad = () => loads++;
  page.on("load", onLoad);

  await page.waitForTimeout(seconds * 1000);

  page.off("request", onRequest);
  page.off("load", onLoad);
  const state = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return {
      markerSurvived: document.body.dataset.marker === String(w.__marker),
      headerStillThere: (w.__header as Element | null)?.isConnected ?? false,
      headerRemoved: w.__headerRemoved as number,
    };
  });
  return { ...state, loads, urlChanged: page.url() !== startUrl, requests };
}
