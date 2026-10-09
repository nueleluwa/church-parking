# Roadmap

Build one milestone at a time. Each one ends with working, tested code and passing acceptance checks.

## M0 Project setup
- Scaffold Next.js with TypeScript in strict mode, Tailwind, ESLint, Vitest and Playwright. Use pnpm.
- Link the Supabase CLI to a free hosted dev project (no Docker). Add `.env.example` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_PHONE`, `ADMIN_PASSWORD` and `APP_URL`.
- Add the scripts listed in CLAUDE.md.

**Acceptance:** `pnpm dev` shows a placeholder home page. `pnpm test`, `pnpm lint` and `pnpm typecheck` pass.

## M1 Database and rules
- Migration with the schema from `docs/data-model.md`, plus the seed data.
- `lib/rules`: `normalisePlate`, `formatPlate`, `pickService` (R-1), `makeReference` and `makePassToken`, with unit tests.
- `lib/db`: typed data-access functions.

**Acceptance:** the `pickService` tests cover 07:00, 08:45, 09:05, 11:29, 13:45 and a weekday. `pnpm db:reset` loads the seed data.

## M2 Guest check-in and pass
- `/c/[area]`: guest form, privacy notice and church branding.
- `claimVisit()`: applies R-2, R-4 and R-5, raises alerts and enforces rate limits.
- `/p/[token]`: pass page, high contrast with a large plate. Shows the public view to anyone without a staff session.
- The pass is remembered on the phone that created it (CI-6).

**Acceptance:** a guest gets a pass in under 45 seconds on a throttled 3G profile. Registering the same plate a second time is blocked and the response contains no token.

## M3 Staff sign-in, scanner and release
- Staff sign-in and 12-hour sessions.
- `/staff/scan`: camera scanner, result card, **Release car** and **Does not match** (EX-1 to EX-3, EX-5 and EX-6).
- `releaseVisit()`: atomic (EX-7) and audited.
- `/staff/search`, `/staff/register` (EX-4, OP-4) and phone masking with logged reveals (R-9).

**Acceptance:** the security tests in `docs/security.md` for release and expired passes pass. Two releases of the same visit at once give exactly one success.

## M4 Member accounts
- Sign up, sign in, PIN lockout (T-4), 180-day sessions, adding vehicles.
- Two-tap member check-in (CI-4). Member plates locked (R-5).
- `/account`: vehicles, history, change PIN, delete account.
- A prompt to add the app to the home screen after sign-up.

**Acceptance:** a signed-in member checks in in two taps. A guest claim on a member's plate is blocked. The lockout tests pass.

## M5 Dashboard and sweep
- `/staff/dashboard`: live counts per area and service (OP-1), alerts feed, updated within 5 seconds.
- `/staff/sweep` (OP-2) and corrections with a required reason (OP-3).
- Midnight job (R-8).

**Acceptance:** a check-in made on one phone appears on the dashboard on another phone within 5 seconds. A car marked Gone in the sweep becomes `missed`.

## M6 Admin
- Manage services, areas, staff and member PIN resets (AD-1, AD-3). Must work on a phone (AD-6).
- Printable A4 QR signs per area, with church name and logo (AD-2).

**Acceptance:** printed signs scan correctly from 1.5 m away in daylight.

## M7 Reports and retention
- Reports and CSV export (AD-4). Each export is logged.
- Daily retention job (R-11).

**Acceptance:** the CSV opens correctly in Excel. A test guest record older than 24 months is deleted.

## M8 Pilot readiness
- Load test: 300 check-ins in 20 minutes.
- Practise the 09:30 changeover with two attendants at one exit.
- Write a one-page guide for attendants. Print the QR signs.
- Deploy to Vercel, or to a VPS with PM2 (D-09), with a separate production Supabase project and backups.

**Acceptance:** the staff run-through goes smoothly, and the parking lead signs off for the one-service pilot.
