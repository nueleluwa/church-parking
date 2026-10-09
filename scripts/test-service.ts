// Switch the dev-only test service on or off, for trying the app on a weekday.
//   pnpm dev:test-service on    open all day today, so check-in works
//   pnpm dev:test-service off   hide it again (the automated tests do this too)
import { setTestService } from "../tests/e2e/test-service.ts";

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("Usage: pnpm dev:test-service on|off");
  process.exit(1);
}
await setTestService(mode === "on");
console.log(`Test service is ${mode}.`);
