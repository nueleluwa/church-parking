import { expect, test } from "@playwright/test";

test("the app can be installed: manifests, icons, service worker and the offline page", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "Church Parking", display: "standalone", start_url: "/", scope: "/" });
  expect(m.shortcuts.length).toBeGreaterThan(0);

  const team = await (await request.get("/staff/manifest.webmanifest")).json();
  expect(team).toMatchObject({ start_url: "/staff", display: "standalone" });

  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);

  // The service worker is always fetched fresh and caches nothing but the offline page
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-store");
  const code = await sw.text();
  expect(code).not.toMatch(/\/p\/|\/account|\/staff|\/admin/);
  // Build files are kept for speed; pages and data never are
  expect(code).toContain("/_next/static/");
  expect(code).toContain("preloadResponse");

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "No internet connection" })).toBeVisible();
});
