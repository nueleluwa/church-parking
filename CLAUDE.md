# Church Parking

A mobile web app that replaces paper parking tallies at church. Drivers scan a QR code to register their car and get a digital pass. At the exit, an attendant scans the pass, checks the plate against the real car and releases it.

The app is built and live at https://churchparking.online. `docs/roadmap.md` says what is done and what is next. Work in small steps, keep the tests green, and read `docs/architecture.md` for how it fits together.

## Read before working

- `docs/spec.md` is the product spec and the source of truth for behaviour.
- `docs/security.md` lists the security rules. Never break them.
- `docs/data-model.md` has the database schema.
- `docs/decisions.md` records decisions already made, with reasons. Don't reopen one without asking the user.
- `docs/roadmap.md` is the build plan, with the current status and what is next.
- `docs/architecture.md` explains the folders, data access, check-in, passes and testing.
- `docs/admin-guide.md` and `docs/attendant-guide.md` describe the screens for the team.

## Stack

- Next.js (App Router) with TypeScript in strict mode
- Supabase Postgres
- Tailwind CSS
- `zod` to validate every input on the server
- `html5-qrcode` to scan passes, `qrcode` to generate QR codes
- Vitest for unit tests, Playwright for end-to-end flows
- Production runs on the church's own server with PM2, its own PostgreSQL and PostgREST (decision D-23). A push to `main` deploys it automatically, except while a service is on (D-28). Do not push without being asked, because a push deploys.
- No Docker. Development and tests use a hosted Supabase project, not local Supabase.

## Commands

Run these from the project folder (stop any other dev server first for the end-to-end tests):

```bash
pnpm dev          # local dev server
pnpm test         # vitest
pnpm test:e2e     # playwright
pnpm lint
pnpm typecheck
pnpm test:perf    # slow-network and 300-check-in load tests
pnpm db:seed-admin   # create or update the first admin from .env.local
pnpm db:reset     # reset the hosted dev database (supabase db reset --linked) and load seed data
pnpm dev:test-service on|off   # dev only: open or hide the all-day test service, so check-in works on a weekday
```

## Architecture rules

- **All database access runs on the server**, in Server Actions or route handlers, through one module: `lib/db`. The browser never holds a Supabase key. Row-level security is turned on as a second layer of protection.
- **Authentication is custom** (see decision D-03). Members sign in with phone number and PIN, staff with phone number and password. Sessions are signed, httpOnly cookies: 180 days for members, 12 hours for staff.
- **Business rules live in `lib/rules/`** as pure functions with unit tests: choosing the service, normalising plates, plate claims and release checks. Pages and actions call these functions and never repeat the logic.
- **Every staff action that changes a visit writes a row to `audit_events`** in the same database transaction.

## Domain terms

| Term | Meaning |
|---|---|
| Area | Where a car parks: Car Park 1, Car Park 2 or Roadside. Each area has its own QR sign. |
| Service | One of three Sunday services: 07:30, 09:30 and 11:30, each 2 hours long. Admins can add others. |
| Station | The car park an attendant says they are standing at, kept on their phone (D-27). |
| Hold | A visit put on hold by **Does not match**; only a coordinator clears it (D-18). |
| Visit | One car parked for one service. Status is `parked`, `released` or `missed`. |
| Pass | What the driver shows at the exit: a QR code holding a random `pass_token`, plus a short reference like `PK-7Q4M`. |
| Release | An attendant confirms the plate matches and lets the car leave. |
| Sweep | The end-of-service walk-round that closes visits for cars that left unchecked. |
| Plate claim | Registering a plate for a visit. The first claim on a plate each day wins. |

## Conventions

- Store plates normalised: uppercase, letters and digits only (`PHC234AB`). Display Nigerian plates as `PHC 234 AB`.
- Write the UI in plain, short English for non-technical volunteers. Make buttons say exactly what they do: "Release car", not "Submit".
- Design mobile first. Pages that drivers or attendants use must load in under 150 KB of JavaScript and be readable in bright sunlight.
- Store times in UTC. Display them in Africa/Lagos time. Calculate "today" and service windows in Africa/Lagos time.
- Mask phone numbers to the last 4 digits in staff screens, unless staff tap "Show number". Log every reveal.
- The product is called **Church Parking**. The live car parks are Domino's, AA and Roadside.
- Admin lists are tables on wide screens and cards on phones; filters, sorting and paging live in the address (D-29).
- Tests: every new rule gets a unit test, every new screen gets an end-to-end test, and new screens are added to the accessibility and layout checks.
- Never put names or phone numbers in URLs, QR codes or logs.

## Visual direction

`references/original-*.webp` (kept in the private repository, not in the public copy) is the user's style reference: a parking-booking dashboard. Take its look, not its features.

- **Use:** the church palette from decision D-10: near-black (`#141414`) header and tab bar with the CCI logo, church red (`#B3121B`) as the accent, black main buttons, a warm off-white page, white rounded cards, a pale red tint for the selected state, the Inter font and a "P" mark.
- **Ignore:** choosing a vehicle type, choosing a parking spot, time slots, prices, maps and the driving view. None of these are in the spec.
- **Contrast:** the pale red selected state is too faint alone in sunlight, so pair it with a dark border and a tick. Keep pass and scanner screens at WCAG AA contrast or better. `tests/unit/contrast.test.ts` checks the theme colours.

## Done means

A milestone is done when it passes `pnpm typecheck`, `pnpm lint` and `pnpm test`, every new rule has a unit test, and its acceptance checks in `docs/roadmap.md` pass.
