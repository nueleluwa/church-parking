# Church Parking

A digital replacement for paper parking tallies at church. Drivers check in on their phone and keep a digital pass; the parking team checks the pass against the real car at the exit.

Live at **https://churchparking.online** (used by CCI).

- **Drivers** open the site and tap **Check in** (then choose their car park) or **Scan a car park sign**, then register their car and get a pass. Members have an account, so they check in with two taps.
- **Attendants** scan the pass at the exit, check that the plate matches the car, and release it. With no pass, they look the car up by plate, phone or reference.
- **Coordinators** (team leads) watch live counts for each car park and service, deal with alerts, correct mistakes and sweep the car parks after each service.
- **Admins** manage services, car parks, QR signs, staff and members, and read visits, reports and analytics.

## Status

Built and in use. Everything in [docs/roadmap.md](docs/roadmap.md) is done except the real-phone checklist in [docs/field-test.md](docs/field-test.md), which still needs doing on real phones in a real car park. Remaining decisions and ideas are listed at the end of the roadmap.

## Screens

| Address | What it is | For |
|---|---|---|
| `/` | Home: Check in, Scan a car park sign, member sign-in | Everyone |
| `/c` | "Where are you parking?" The list of car parks | Drivers |
| `/scan` | Scan a car park sign with the camera | Drivers |
| `/c/<car park>` | Check-in for one car park (the same page its QR sign opens) | Drivers |
| `/p/<token>` | The pass | Driver; staff see more |
| `/account/*` | Member sign-up, sign-in, cars and history | Members |
| `/staff` | Team home, scanner, search, register, history, service info | Attendants and up |
| `/staff/dashboard`, `/staff/sweep` | Live board and end-of-service sweep | Coordinators and up |
| `/admin/*` | Dashboard, Visits, Vehicles, Members, Staff, Services, Car parks, QR signs, Reports, Analytics, Settings | Admins (Visits also for coordinators) |

## Tech

- Next.js (App Router), TypeScript in strict mode, Tailwind CSS v4
- PostgreSQL through PostgREST (a hosted Supabase project for development and tests; the church's own server for production, see [docs/architecture.md](docs/architecture.md))
- Custom sessions: members sign in with phone and PIN, staff with phone and password
- `zod` for every server input, `html5-qrcode` to scan, `qrcode` to draw QR codes
- Vitest for unit tests, Playwright for end-to-end tests, axe for accessibility

## Running it locally

You need Node 20 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local     # then fill in the values (see below)
pnpm dev                       # http://localhost:3000
```

`.env.local` needs `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (a long random string), and `ADMIN_PHONE` and `ADMIN_PASSWORD` for the first admin (`pnpm db:seed-admin`). Use a throwaway Supabase project and apply the files in `supabase/migrations/` in order. Never commit `.env.local`.

On a weekday there is no service, so check-in is closed. `pnpm dev:test-service on` opens an all-day test service in the dev database (and `off` hides it again).

## Commands

```bash
pnpm dev                       # development server
pnpm build && pnpm start       # production build
pnpm test                      # unit tests (Vitest)
pnpm test:e2e                  # end-to-end tests (Playwright, phone-sized browser)
pnpm test:perf                 # slow-network and 300-check-in load tests
pnpm lint
pnpm typecheck
pnpm db:seed-admin             # create or update the first admin from .env.local
pnpm dev:test-service on|off   # dev only: all-day service so check-in works on a weekday
```

The end-to-end tests run against the development database and a real browser. Stop any other dev server first.

## Docs

| File | What's in it |
|---|---|
| [docs/spec.md](docs/spec.md) | Product spec: roles, flows, requirements and business rules |
| [docs/decisions.md](docs/decisions.md) | Decisions made, with reasons (D-01 to D-31). Later decisions change the spec where they differ. |
| [docs/architecture.md](docs/architecture.md) | How the app is put together: folders, data access, rules, check-in, passes, scanning, testing |
| [docs/security.md](docs/security.md) | Threat model and the security rules |
| [docs/data-model.md](docs/data-model.md) | Database schema and later additions |
| [docs/roadmap.md](docs/roadmap.md) | Milestones, what is done, and what is next |
| [docs/attendant-guide.md](docs/attendant-guide.md) | One-page guide for the parking team at the exit |
| [docs/admin-guide.md](docs/admin-guide.md) | What each admin screen is for |
| [docs/field-test.md](docs/field-test.md) | The real-phone checklist |
| [docs/audit/](docs/audit/) | The application audit and its findings |
| [CLAUDE.md](CLAUDE.md) | Working instructions for Claude Code |

## Privacy and security in one paragraph

Drivers give a name, phone number and plate. Staff screens show only the last four digits of a phone number unless someone taps **Show number**, which is logged. Names and numbers never appear in URLs, QR codes or logs. Guest records are deleted after 24 months. See [docs/security.md](docs/security.md) for the rules and [docs/decisions.md](docs/decisions.md) for why.

## Licence

MIT. See [LICENSE](LICENSE). The church's name, logo and design images are not covered by the licence.
