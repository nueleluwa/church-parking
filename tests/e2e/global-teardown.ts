import { purgeTestStaff } from "./purge-test-staff";
import { setTestService } from "./test-service";

/** After the tests: switch the test service off again, and remove the throw-away test staff accounts. */
export default async function globalTeardown() {
  await setTestService(false);
  await purgeTestStaff();
}
