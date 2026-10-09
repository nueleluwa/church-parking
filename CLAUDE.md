# Church Parking

A mobile web app that replaces paper parking tallies at church. Drivers scan a QR code to register their car and get a digital pass. At the exit, an attendant scans the pass, checks the plate against the real car and releases it.

The project is in the planning stage: there's no code yet. Build it in the order set out in `docs/roadmap.md`.

## Read before working

- `docs/spec.md` is the product spec and the source of truth for behaviour.
- `docs/security.md` lists the security rules. Never break them.
- `docs/data-model.md` has the database schema.
- `docs/decisions.md` records decisions already made, with reasons. Don't reopen one without asking the user.
- `docs/roadmap.md` is the build plan, broken into milestones.

## Stack

- Next.js (App Router) with TypeScript in strict mode
- Supabase Postgres
- Tailwind CSS
- `zod` to validate every input on the server
- `html5-qrcode` to scan passes, `qrcode` to generate QR codes
- Vitest for unit tests, Playwright for end-to-end flows
- Hosted on Vercel. PM2 on a VPS is the alternative if the church self-hosts (decision D-09).
- No Docker. Development uses a free hosted Supabase project, not local Supabase.

## Commands

These will be valid once milestone M0 has scaffolded the app:

```bash
pnpm dev          # local dev server
pnpm test         # vitest
pnpm test:e2e     # playwright
pnpm lint
pnpm typecheck
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
| Service | One of three Sunday services: 07:30, 09:30 and 11:30, each 2 hours long. |
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
- Never put names or phone numbers in URLs, QR codes or logs.

## Visual direction

`references/original-*.webp` is the user's style reference: a parking-booking dashboard. Take its look, not its features.

- **Use:** the church palette from decision D-10: near-black (`#141414`) header and tab bar with the CCI logo, church red (`#B3121B`) as the accent, black main buttons, a warm off-white page, white rounded cards, a pale red tint for the selected state, the Inter font and a "P" mark.
- **Ignore:** choosing a vehicle type, choosing a parking spot, time slots, prices, maps and the driving view. None of these are in the spec.
- **Contrast:** the pale red selected state is too faint alone in sunlight, so pair it with a dark border and a tick. Keep pass and scanner screens at WCAG AA contrast or better. `tests/unit/contrast.test.ts` checks the theme colours.

## Done means

A milestone is done when it passes `pnpm typecheck`, `pnpm lint` and `pnpm test`, every new rule has a unit test, and its acceptance checks in `docs/roadmap.md` pass.
