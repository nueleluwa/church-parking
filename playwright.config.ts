import { defineConfig, devices } from "@playwright/test";

// Load .env.local so the dev server and the live-flow test see the same settings.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the live-flow test is skipped.
}

const port = 3457;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1, // the dev server compiles pages on demand, so parallel runs time out
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
