import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database-backed tests: they talk to the hosted DEVELOPMENT project with the service key (see tests/integration/db.ts for the
// guard that refuses anything else). Run with `pnpm test:integration`. They are not part of `pnpm test` or CI.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the tests skip themselves
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
