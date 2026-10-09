import fs from "node:fs";
import { expect, test, type Browser } from "@playwright/test";

// Loads the check-in page on a PRODUCTION build with the network slowed down like a 3G phone,
// from an empty cache (a driver's first scan). "Usable" means the guest button is on screen AND the
// page has started up, shown by the guest form opening when it is tapped.
//
// The spec asks for under 2 seconds "on 3G". 3G is not one speed, so three profiles are measured:
//  - "3G (Lighthouse)": 1.6 Mbps down, 750 Kbps up, 150 ms round trip. This is the one the 2 s target is judged on.
//  - "Fast 3G (DevTools)": 1.6 Mbps down, 750 Kbps up, 562 ms round trip.
//  - "Slow 3G (DevTools)": 400 Kbps both ways, 2 000 ms round trip. Reported only.
const PROFILES = [
  { name: "3G (Lighthouse)", down: 1_600_000, up: 750_000, latency: 150, judged: true },
  { name: "Fast 3G (DevTools)", down: 1_600_000, up: 750_000, latency: 562, judged: false },
  { name: "Slow 3G (DevTools)", down: 400_000, up: 400_000, latency: 2000, judged: false },
] as const;

const RUNS = 3;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(browser: Browser, profile: (typeof PROFILES)[number]) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: profile.down / 8,
    uploadThroughput: profile.up / 8,
    latency: profile.latency,
  });
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e: { encodedDataLength: number }) => (bytes += e.encodedDataLength));

  const start = Date.now();
  await page.goto("/c/cp1", { waitUntil: "commit" });
  const guest = page.getByRole("button", { name: "Continue as guest" });
  await guest.waitFor({ state: "visible", timeout: 120_000 });
  const visible = Date.now() - start;
  // A tap before the page has started up does nothing, as for a real driver, so keep tapping until the form opens
  const form = page.getByLabel("Your name");
  const deadline = Date.now() + 120_000;
  while (!(await form.isVisible())) {
    if (Date.now() > deadline) throw new Error("The page never started up");
    await guest.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(100);
  }
  const usable = Date.now() - start;

  await context.close();
  return { visible, usable, kb: Math.round(bytes / 1024) };
}

test("the check-in page loads in under 2 seconds on 3G, and the slower profiles are measured", async ({ browser }) => {
  const rows: Record<string, unknown>[] = [];
  let judged = 0;
  for (const profile of PROFILES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, profile));
    const row = {
      profile: profile.name,
      "page visible (ms, median)": median(runs.map((r) => r.visible)),
      "usable (ms, median)": median(runs.map((r) => r.usable)),
      "downloaded (KB)": median(runs.map((r) => r.kb)),
    };
    rows.push(row);
    if (profile.judged) judged = row["usable (ms, median)"] as number;
  }
  console.table(rows);
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/slow-3g.json", JSON.stringify(rows, null, 2));

  expect(judged, "usable time on 3G (Lighthouse profile)").toBeLessThan(2000);
});
