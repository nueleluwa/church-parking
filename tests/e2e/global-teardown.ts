import { setTestService } from "./test-service";

/** After the tests: switch the test service off again so it never appears in the live interface. */
export default async function globalTeardown() {
  await setTestService(false);
}
