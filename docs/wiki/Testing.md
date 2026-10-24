# Testing

- `pnpm test`: unit tests for the rules and helpers.
- `pnpm test:integration`: database tests (hosted development project only).
- `pnpm test:e2e`: Playwright in a phone-sized browser, with a synthetic camera, axe accessibility scans and layout checks at 320, 360 and 412 px.
- `pnpm test:perf`: slow-network and 300-check-in load tests.

Tips:

- The browser tests start their own server on port 3457. Stop `pnpm dev` first.
- Run large suites one file at a time: `pnpm exec playwright test settings.spec.ts`. If a run reports `ERR_CONNECTION_REFUSED`, run that file again before suspecting the code.
- Every new rule gets a unit test, every new screen an end-to-end test, and new screens go into the accessibility and layout checks.
- Not covered: a real camera in real light, and printed signs (see `docs/field-test.md`).
