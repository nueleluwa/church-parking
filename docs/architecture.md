# Architecture

How the app is put together. For what it does, read [spec.md](spec.md); for why it is this way, [decisions.md](decisions.md).

## Folders

| Folder | What lives there |
|---|---|
| `app/` | Pages and server actions (Next.js App Router). Public pages at the top, `(team)/` holds the staff and admin screens behind one shared frame, `account/` the member screens, `p/` the pass, `c/` check-in, `scan/` the sign scanner. |
| `components/` | Shared pieces: headers, side menu, tab bar, status badges, tables (`AdminTable`), pager, charts, the sign scanner page, forms. `ui.ts` holds the shared button and card styles. |
| `lib/rules/` | Business rules as pure functions with unit tests: choosing the service, plates, phone numbers, claims, release checks, reports and analytics, scanning, camera problems. Pages and actions call these and never repeat the logic. |
| `lib/db/` | The only place that talks to the database (through the PostgREST client). The browser never holds a database key. |
| `lib/` | Sessions, passwords, pass cookie, retry key, station choice, environment checks. |
| `supabase/migrations/` | The database, as ordered SQL files. |
| `tests/` | End-to-end (`e2e/`), performance (`perf/`) tests. Unit tests sit beside the code they test. |
| `scripts/` | Seed the first admin, switch the dev test service, tidy test staff. |
| `docs/` | These documents. |

## How a request is protected

1. Every server action and page checks the session on the server (`lib/staff-auth.ts`, member helpers). What a screen hides is never the protection.
2. Every input is validated with `zod` before use.
3. Business rules run in `lib/rules`, so they are the same wherever they are called and are covered by unit tests.
4. Anything a staff member does to a visit writes an `audit_events` row in the same database transaction.

## Check-in

Check-in is one database call, `claim_guest_visit` or `claim_member_visit` (D-21). In one transaction it applies the rate limit, the one-open-visit-per-car rule (R-2, R-4, R-5), creates the visit and any alert, and returns the pass. A one-time key sent with the attempt (`visits.check_in_key`) makes a repeat of the same attempt return the same pass instead of an error (D-26).

Two ways reach the same check-in page, `/c/<car park>`:
- **Check in** at `/` goes to `/c`, the list of car parks.
- **Scan a car park sign** goes to `/scan`, which reads the sign's QR code, looks the car park up among the open car parks, and opens `/c/<car park>`. Another website's code, an unknown or switched-off car park, or a parking pass each get a plain message and never choose a car park.

## Passes

A pass is a random 128-bit token in the address `/p/<token>`. A phone remembers the passes it made in a signed cookie (up to six, one day). A signed-in member sees their own pass on any phone. Without either, a driver recovers a pass only through an attendant lookup (D-25).

## Exit

`releaseVisit()` in `lib/rules` is the only way to release a car. It needs a staff session and updates the visit only while it is `parked`, so two releases at once give exactly one success. **Does not match** puts the visit on hold (`visits.held_at`); only a coordinator clears a hold, with a reason (D-18). Attendants choose which car park they stand at (kept on the phone); a car from another car park gets a warning and a one-tap fix, never a block (D-27).

## Admin screens

All admin screens share the team frame (`components/StaffChrome.tsx`): a side menu on wide screens and a tab bar on phones. Lists are tables on desktop and cards on phones (D-29). Filters, sorting and paging live in the address, so they survive a reload and can be shared. Drivers' names and numbers are not in lists; the visit page shows them masked until **Show number**.

## Deployment

Production runs on one Ubuntu server behind Cloudflare: nginx, the app and PostgREST under PM2, and PostgreSQL 16 (D-23). A push to `main` runs the checks and then deploys, except while a service is on (D-28). Backups run nightly. The deploy scripts and server notes are kept with the church's private repository and are not part of this public copy.

## Testing

- `pnpm test`: unit tests for the rules and helpers.
- `pnpm test:e2e`: Playwright in a phone-sized browser against the development database, including a synthetic camera that shows QR codes to the scanner, an accessibility scan (axe) of every screen, and layout checks at 320, 360 and 412 px.
- `pnpm test:perf`: slow-3G page loads and a 300-check-in load run.
- Not covered by tests: a real camera in real light, and printed signs. See [field-test.md](field-test.md).
