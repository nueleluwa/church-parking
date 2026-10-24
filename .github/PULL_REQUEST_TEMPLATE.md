## What this changes

<!-- One or two sentences, in plain words. -->

## Before merging

**A merge to `main` deploys the live site** (it waits if a service is on). Check each box that applies.

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass
- [ ] The browser tests for the files this touches pass (`pnpm exec playwright test <file>.spec.ts`)
- [ ] No names, phone numbers or check-out codes in logs, addresses or QR codes (`docs/security.md`)
- [ ] A change to the database has a migration with its rollback, and the live-data check was run on a copy
- [ ] Nothing here reopens a decision in `docs/decisions.md` without asking
- [ ] The docs (CLAUDE.md, README, the guides) match what changed

## How it was checked

<!-- What you opened or ran, and on which phone or screen size. -->
