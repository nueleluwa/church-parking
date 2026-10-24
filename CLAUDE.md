# Church Parking

A mobile web app that replaces paper parking tallies at church. Drivers scan a QR code to register their car and get a digital pass. At the exit, an attendant scans the pass, checks the plate against the real car and releases it.

The app is built and live at https://churchparking.online, for Celebration Church (the logo file and some names still say CCI). `docs/roadmap.md` says what is done and what is next. Work in small steps, keep the tests green, and read `docs/architecture.md` for how it fits together.

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
- Check-in runs two ways per car park: the original (guest form or member PIN) and the phone-number flow (D-43: type the phone number, confirm the car, a check-out code stays on that phone, and the **exit sign** checks out with no typing). `QR_SESSION_FLOW` (`off`, `pilot`, `on`) and `QR_SESSION_AREAS` choose which car parks use it. It is **off on the live server** until the steps in `docs/qr-rollout.md` are done. For local testing set `QR_SESSION_FLOW=on` in `.env.local` and run `pnpm dev:test-service on` (check-in is closed when no service is open).

## Commands

Run these from the project folder (stop any other dev server first for the end-to-end tests):

```bash
pnpm dev          # local dev server
pnpm test         # vitest
pnpm test:e2e     # playwright
pnpm test:integration   # database tests, against the hosted dev project only
pnpm lint
pnpm typecheck
pnpm test:perf    # slow-network and 300-check-in load tests
pnpm db:seed-admin   # create or update the first admin from .env.local
pnpm db:reset     # reset the hosted dev database (supabase db reset --linked) and load seed data
pnpm dev:test-service on|off   # dev only: open or hide the all-day test service, so check-in works on a weekday
```

Running the browser tests:

- They start their own server on port 3457, so stop `pnpm dev` first (two dev servers cannot share the folder).
- Run the big suites one file at a time (`pnpm exec playwright test settings.spec.ts`). A whole-suite run is long and the dev server can drop mid-run. If a run reports `ERR_CONNECTION_REFUSED` or "not able to start", run that file again before suspecting the code.
- After a long pause the first `next dev` start can exit with an upgrade reminder. Start it again.
- To try the app on a phone on the same Wi-Fi, open `http://<laptop address>:3000` (`next.config.ts` already allows 192.168.x.x). The QR scanner needs https there: use `pnpm dev:https`.

## Architecture rules

- **All database access runs on the server**, in Server Actions or route handlers, through one module: `lib/db`. The browser never holds a Supabase key. Row-level security is turned on as a second layer of protection.
- **Authentication is custom** (see decision D-03). Members sign in with phone number and PIN, staff with phone number and password. Sessions are signed, httpOnly cookies: 180 days for members, 12 hours for staff.
- **Business rules live in `lib/rules/`** as pure functions with unit tests: choosing the service, normalising plates, plate claims and release checks. Pages and actions call these functions and never repeat the logic.
- **Every staff action that changes a visit writes a row to `audit_events`** in the same database transaction.
- **Filter and search forms use `GetForm`** (`components/ds/GetForm.tsx`) so they change the address without reloading the page. A bare `<form>` that submits with GET loads a whole new page, which flashes and throws away the side menu and the scroll position.
- **Admin results are toasts.** Saves, errors, notices and warnings use `useToast()` (or `ToastNotice` for a message a server component puts in the page), not message boxes. A message stays inline only when it belongs to one field, sits inside a modal dialog (a toast would be behind it), explains a disabled control (the Reports dates), or is on an attendant or driver screen, where the result must stay in front of the person.
- **Reports** are built as plain tables in `lib/rules/report-catalogue.ts` (`buildReportTable`). A single report is a CSV; `report=all` on `/admin/reports/export` gives one Excel workbook with a Contents sheet and a sheet per report (`lib/report-workbook.ts`, using `write-excel-file`). `report=pdf` gives the designed PDF with the church logo, key figures and charts (`lib/report-pdf.ts`, using `pdf-lib`, drawn as vectors on A4; its tests render nothing and just check the file). A new report is added to the catalogue once and appears in the CSV and the workbook; the PDF shows a fixed set of charts and tables.
- **Deleting** services, car parks, staff and members works one at a time or in bulk (`components/ds/Bulk.tsx`, actions at the end of `admin/admin-actions.ts`), always after a confirmation that says what is removed. Nothing with history is forced: the database refuses (foreign keys), the record is kept and the screen says why. A deleted member's visits stay as "Deleted member". Every delete is audited. The rules are tested in `tests/integration/delete-records.test.ts`.

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
| Check-out code | A random code kept in a cookie on the phone that checked in by phone number. The exit sign uses it to check that phone out (D-43). Never logged, never put in an address. |
| Exit sign | The sign at the exit (`/c/<car park>/out`). Scanning it checks out the phone that checked in at that car park. |
| On site now | Cars recorded as parked right now, longest first, whatever the service. Shown on the admin Dashboard and on Live Parking. |

## Conventions

- Store plates normalised: uppercase, letters and digits only (`PHC234AB`). Display Nigerian plates as `PHC 234 AB`.
- Write the UI in plain, short English for non-technical volunteers. Make buttons say exactly what they do: "Release car", not "Submit".
- Design mobile first. Pages that drivers or attendants use must load in under 150 KB of JavaScript and be readable in bright sunlight.
- Store times in UTC. Display them in Africa/Lagos time. Calculate "today" and service windows in Africa/Lagos time.
- Attendants and coordinators see phone numbers masked to the last 4 digits, unless they tap "Show number". Log every reveal. Admins see full numbers in the Members list and on member pages (decided 24 Oct 2026); a visit's driver number stays masked until "Show number" is tapped, for everyone.
- Member visits and the audit log are kept **forever** (decided 24 Oct 2026). Only guest records are deleted, after 24 months. Do not add a deletion job for the rest without asking.
- The product is called **Church Parking** and the church is **Celebration Church**. The live car parks are Domino's, AA and Roadside.
- Admin lists are tables on wide screens and cards on phones; filters, sorting and paging live in the address (D-29).
- Spacing on the team screens: a 4px base scale; 32px between sections on desktop and 24px on a phone; 20px card padding (tables need the room); KPI cards 24px on desktop. Table cells stay at 10px: tables must fit at 1440px without sideways scrolling (a test checks it), so do not widen cells or the card padding around a table.
- Fields are `.input` (44px) and buttons are `.btn` (44px) on every team screen. Do not use the large phone styles from `components/ui.ts` there.
- A big confirmation (checked out, released, added) uses `IconCheckAnimated` inside a `.check-pop` circle: the circle pops, a ring pulses once, the tick draws itself. It stays still and fully drawn for people who ask for less motion.
- The checked-out card ends with a blessing, not "Safe journey": "Thank you for worshipping with us. Go well, and have a blessed week."
- Tests: every new rule gets a unit test, every new screen gets an end-to-end test, and new screens are added to the accessibility and layout checks. Anything that talks to the database gets an integration test.
- Never put names or phone numbers in URLs, QR codes or logs.

## Visual direction

`references/original-*.webp` (kept in the private repository, not in the public copy) is the user's style reference: a parking-booking dashboard. Take its look, not its features.

- **Church logo:** `/cci-logo.svg` (the Celebration Church wordmark) is the brand. It shows in the sidebar, in the logo header (home, sign-in, check-in, the exit sign, the driver's pass) and beside the title on the team screens on a phone (hidden below 360px wide). Never replace it with a letter or a symbol.
- **Desktop shell (1024px and up) for coordinators and admins:** the dark sidebar with the logo and a grouped menu (Operate, Insights, Records, Setup, Tools), and a slim top bar with a vehicle-number search and the date. The phone-style title bar is hidden there, so the page's own heading is the only title.
- **Use:** the church palette from decision D-10: near-black (`#141414`) header and tab bar with the CCI logo, church red (`#B3121B`) as the accent, black main buttons, a warm off-white page, white rounded cards, a pale red tint for the selected state, the Inter font and a "P" mark.
- **Ignore:** choosing a vehicle type, choosing a parking spot, time slots, prices, maps and the driving view. None of these are in the spec.
- **Contrast:** the pale red selected state is too faint alone in sunlight, so pair it with a dark border and a tick. Keep pass and scanner screens at WCAG AA contrast or better. `tests/unit/contrast.test.ts` checks the theme colours.

## Done means

A milestone is done when it passes `pnpm typecheck`, `pnpm lint` and `pnpm test`, every new rule has a unit test, the browser tests for the files it touched pass, and its acceptance checks in `docs/roadmap.md` pass.
