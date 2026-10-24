import { defineConfig, devices } from "@playwright/test";

// Load .env.local so the dev server and the live-flow test see the same settings.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the live-flow test is skipped.
}

const port = 3457;

// The QR check-in is switched on for one test-only car park (its address is "qr-test", made and removed by the QR specs).
// Every other car park keeps the original check-in, so the older specs are unaffected.
process.env.QR_SESSION_FLOW = "pilot";
// Hide Next's development overlay in the browser: it can sit over a button and swallow clicks (see app/layout.tsx).
process.env.E2E_HIDE_DEV_OVERLAY = "1";
process.env.QR_SESSION_AREAS = "qr-test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  workers: 1, // the dev server compiles pages on demand, so parallel runs time out
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
