// Removes the throw-away staff accounts left behind by the tests. Run with: pnpm db:purge-test-staff
import { purgeTestStaff } from "../tests/e2e/purge-test-staff.ts";

const n = await purgeTestStaff();
console.log(`Removed ${n} test staff accounts.`);
