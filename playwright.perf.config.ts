import { defineConfig, devices } from "@playwright/test";

// Performance checks run against a PRODUCTION build (`pnpm build` first), because a dev server
// is much slower and says nothing about what drivers will get. Run with: pnpm test:perf
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the live checks are skipped.
}

const port = 3458;

export default defineConfig({
  testDir: "tests/perf",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  workers: 1,
  timeout: 15 * 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
