# ARCHITECTURE.md — Architecture Guide and Required Documentation

> This file defines the architecture that agents must document and the target design principles for the refactor. Replace placeholders with verified repository facts after inspecting the code. Do not invent a framework, database, route name or deployment provider.

## 1. System summary

The product is an existing mobile-first church parking web application. It supports administrator-led member registration, staff-assisted exception handling, location-specific check-in/check-out QR codes, and server-authoritative parking sessions.

## 2. Repository-specific facts to document

Use actual files and code as evidence. If a detail is unknown, mark it unknown rather than guessing.

**Phase 0 inspection, 2026-10-18.** Branch `refactor/qr-checkin-checkout`, tag `pre-qr-refactor` on `a0599a6`. Everything below was read from the repository; "unknown" means it could not be verified from the repository alone. The repository's own architecture notes are in `docs/architecture.md`, its decisions in `docs/decisions.md` (D-01 to D-42), its security rules in `docs/security.md`.

- **Application framework and version:** Next.js 16.4.0 (App Router, Turbopack), React 19.3 (`package.json`, build output). No `middleware.ts` or `proxy.ts` exists.
- **Language/runtime:** TypeScript ~6.0.3, strict. Node v24.19.0 locally; CI uses Node 24 (`.github/workflows/ci.yml`). Production Node version: unknown.
- **Package manager and key dependencies:** pnpm 12.10.1. `@supabase/supabase-js` (PostgREST client), `@node-rs/argon2` (PIN/password hashes), `zod` 4.6.5, `qrcode` (generate), `html5-qrcode` (scan), Tailwind 4, Vitest 5.0.3, Playwright 1.64, ESLint 10. Not used: Prisma, Auth.js, `@zxing/browser`.
- **Database and ORM/query layer:** PostgreSQL. No ORM. All access is server-side through `lib/db/*` using the PostgREST client with the service-role key. Multi-step transactional work is done by plpgsql functions called with `.rpc()` (`claim_guest_visit`, `claim_member_visit`, `release_visit`, `correct_visit`, `sweep_visit`, `hold_visit`, `clear_hold`, `close_open_visits`, `convert_guest_to_member`, `delete_member`, `delete_expired_guest_data`). Row-level security is on for the tables with no policies, so only the service key reads or writes. Development and e2e tests use a hosted Supabase project (`SUPABASE_URL` in `.env.local` is a `*.supabase.co` host). Production uses PostgreSQL 16 on the church's own server behind PostgREST (`deploy/env.production.example` points `SUPABASE_URL` at `127.0.0.1`), so the two are separate databases.
- **Frontend/UI framework:** React Server Components and Server Actions, Tailwind CSS 4, a small design system in `components/ds/` and `app/globals.css`. No shadcn/ui.
- **Authentication/session mechanism:** custom (decision D-03), no Auth.js. Three signed, `httpOnly`, `SameSite=Lax` cookies, `Secure` only when `NODE_ENV=production`: `cp_member` (member id, 180 days, `lib/member-auth.ts`), `cp_staff` (staff id, 12 hours at most, `lib/staff-auth.ts`), `cp_pass` (signed list of up to six pass tokens, 24 hours, `lib/pass-cookie.ts`). Signing is HMAC-SHA256 with `SESSION_SECRET` (`lib/session.ts`). Members sign in with phone + 4-digit PIN (argon2id, lockout after 5 failures for 15 minutes and after 15 in a day). Staff sign in with phone + password. Roles: `attendant < coordinator < admin` (`lib/rules/roles.ts`). Role checks run on the server in `requireStaff()` and in each action.
- **API routing conventions:** Server Actions for nearly all mutations (`app/**/actions.ts`, `app/(team)/admin/*-actions.ts`). Only four route handlers exist: `app/(team)/admin/reports/export/route.ts`, `app/(team)/staff/dashboard/data/route.ts`, `app/p/[token]/status/route.ts`, `app/staff/manifest.webmanifest/route.ts`. There is no REST API. No explicit `Origin` check exists in application code (Next's own Server Action origin check applies; its exact behaviour in this version is unverified and must be read from `node_modules/next/dist/docs/` before relying on it, per `AGENTS.md`).
- **Test/lint/type-check/build commands:** `pnpm test` (Vitest, `tests/unit/**` and `lib/**/*.test.ts`), `pnpm test:e2e` (Playwright, `tests/e2e`, Pixel 7 profile, single worker, starts its own `next dev -p 3457`, uses the hosted dev database), `pnpm test:perf`, `pnpm lint` (`eslint .`), `pnpm typecheck` (`tsc --noEmit`), `pnpm build` (`next build`). CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every push and PR; e2e is run by hand. A push to `main` deploys to production after CI passes (held during services, D-28).
- **Environment/configuration approach:** `.env.local` locally, `.env.example` documents `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_PHONE`, `ADMIN_PASSWORD`. `lib/env.ts` validates `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (min 32 chars) and `APP_URL` with zod, lazily on first call to `serverEnv()`, not at process start. Admin-editable settings live in the `app_settings` table (`lib/rules/settings.ts`, decision D-36). The rate-limit numbers are constants in `lib/rules/claim.ts`, not configuration.
- **Deployment topology:** one Ubuntu server behind Cloudflare, nginx, the app and PostgREST under PM2, PostgreSQL 16 as a system service, nightly backups kept 14 days (`deploy/`, decision D-23). Migrations are the files in `supabase/migrations/` applied by `deploy/db/migrate.sh` before each new version starts, with a backup first. Public URL `https://churchparking.online`. Off-server backup copy: not yet set up (`docs/roadmap.md`). Real server state: unknown (not inspected).
- **Existing entities and migrations:** 15 migrations, `20261009000000_init.sql` to `20261012000000_member_status.sql`. Tables: `areas`, `services`, `members`, `guests`, `vehicles`, `member_vehicles`, `staff`, `visits`, `alerts`, `audit_events`, `rate_events`, `app_settings` (plus `ops.applied_migrations` on the production server only). Details in §6 below.
- **Current QR implementation:** QR codes are drawn server-side as inline SVG by `lib/qr.ts` (`qrcode`). There are two different kinds, and they must not be confused with the target design:
  1. **Car park sign** = `https://<host>/c/<area slug>` (slugs `cp1`, `cp2`, `road`; never change, decision D-12). Printable A4/A5 signs at `/admin/settings/qr-signs`, plus a general sign. This is check-in only. **There is no checkout sign.**
  2. **Pass QR** = `/p/<pass_token>` (128-bit random, base64url, stored in plain text in `visits.pass_token`). The driver shows it; an attendant scans it at the exit with `html5-qrcode` (`app/(team)/staff/scan`). It identifies one visit and is unrelated to the target's "fixed checkout QR".
  The home-page scanner (`/scan`, `lib/rules/sign-scan.ts`) accepts only `/c/<slug>` and `/p/<token>` on our own hosts.
- **Current check-in/checkout implementation:**
  - *Check-in:* `app/c/[area]/actions.ts`. Guest: name + phone + plate, no account, creates a `guests` row and a `visits` row via `claim_guest_visit`. Member: signed in with phone + PIN, picks one of up to four saved cars, `claim_member_visit`. Both are one database transaction, rate limited (5 per phone per 60 minutes, 150 per IP per 10 minutes), safe to repeat through `visits.check_in_key` (D-26), and return a pass token that is remembered in `cp_pass`. Check-in is refused outside service windows (`servicesForCheckIn`). One open visit per vehicle is enforced by the partial unique index `one_open_visit_per_vehicle`.
  - *Checkout:* there is no driver checkout. An attendant scans the pass or searches, and `releaseVisit()` (`lib/rules/release.ts`) calls `release_visit()`, which updates `visits` only `WHERE status='parked' AND held_at IS NULL AND service_date = today` and writes an `audit_events` row in the same transaction (decision D-01; `docs/security.md` rule 1). "Does not match" puts the visit on hold. Closing without release: sweep ("Gone"), coordinator `correct_visit('close')` with a reason, and a midnight job that closes every visit still `parked` as `missed` (R-8).
  - *QR check-in and exit sign (added on this branch, off by default; decision D-43):* `QR_SESSION_FLOW` (`off`/`pilot`/`on`) and `QR_SESSION_AREAS` (`lib/rules/qr-flow.ts`, `lib/env.ts`) choose the car parks. Check-in: `app/c/[area]/qr-actions.ts` (`lookupMember`, `confirmCheckIn`), screen `QrCheckIn.tsx`, one transaction `check_in_with_credential` (migration `20261019030000`): rate limits, member row lock, create or reissue, audit. Exit: `app/c/[area]/out/` (`checkOut` Server Action sent as a POST on page load, `isSameOrigin` requires an `Origin` header naming this site), one transaction `checkout_with_credential` (migration `20261019050000`) that locks the visit found by credential hash and closes it only if open, not held, from today, inside the credential's lifetime and at the sign's car park (`release_method = self`). Credential: `lib/rules/credential.ts` (256 random bits; SHA-256 stored in `visits.credential_hash`), cookie `cp_exit` (`lib/exit-cookie.ts`: HttpOnly, SameSite=Lax, path `/c`, Secure in production, lifetime `credentialHours` from `app_settings`). Staff: `/staff/register/member` (look up, then add a member with no PIN). Tests: `pnpm test:integration` (database, dev project only) and `tests/e2e/qr-*.spec.ts`.
  - *Not covered by automated tests (repository's own statement):* a real camera in real light, printed signs. Real-phone behaviour of cookies on iOS and Android: unknown.

## 3. Logical architecture

Document the actual modules that implement these responsibilities:
- Public QR pages.
- Administrator and staff interfaces.
- Authentication and role-based authorization.
- Member/vehicle management.
- Parking location and QR management.
- Parking session domain/service logic.
- Session credential lifecycle.
- Reporting and CSV import/export.
- Audit logging.
- Persistence and migrations.

Prefer the existing monolith/module structure unless there is a demonstrated reason to introduce services or major new infrastructure.

**Current implementation (verified 2026-10-18):**

| Responsibility | Where it lives today |
|---|---|
| Public QR pages | `app/c/[area]` (check-in), `app/c` (car park list), `app/scan` (sign scanner), `app/p/[token]` (pass). No checkout page. |
| Administrator and staff interfaces | `app/(team)/admin/**` (admin; coordinators reach Visits), `app/(team)/staff/**` (scan, search, register, sweep, live board) |
| Authentication and roles | `lib/member-auth.ts`, `lib/staff-auth.ts`, `lib/member-token.ts`, `lib/staff-token.ts`, `lib/session.ts`, `lib/rules/roles.ts` |
| Member/vehicle management | `lib/db/members.ts`, `lib/db/vehicles.ts`, `lib/rules/member-admin.ts`, `lib/rules/vehicle*.ts`, `app/(team)/admin/member-actions.ts`, `vehicle-actions.ts`, `app/account/**` |
| Parking location and QR management | `areas` table, `app/(team)/admin/settings/parking-areas`, `settings/qr-signs`, `lib/qr.ts` |
| Parking session logic | Visits: `supabase/migrations/*claim_functions*`, `*check_in_key*`, `lib/rules/claim.ts`, `lib/rules/release.ts`, `lib/db/claim-store.ts`, `lib/db/passes.ts`, `lib/db/operations.ts` |
| Session credential lifecycle | None for the target design. Closest: `visits.pass_token` and the `cp_pass` cookie, which have a different purpose (see §2). |
| Reporting and CSV | `lib/report-data.ts`, `lib/rules/report-catalogue.ts`, `app/(team)/admin/reports`, `admin/visits`, `admin/analytics` (all CSV exports are admin only and logged) |
| Audit logging | `audit_events` table, `logAudit()` in `lib/db/staff.ts`, and the plpgsql functions that insert audit rows in the same transaction |
| Persistence and migrations | `supabase/migrations/`, `supabase/seed.sql`, `deploy/db/migrate.sh` |

## 4. Trust boundaries

Describe:
1. Public browser → public QR endpoints.
2. Staff/admin browser → authenticated endpoints.
3. Application → database.
4. Application → logs/monitoring.
5. Import/export files → validation pipeline.

For each boundary, document authentication, authorization, input validation, data minimization and error handling.

## 5. Session lifecycle

The normal flow:
1. Public check-in route resolves an active location and check-in action.
2. Member submits phone number.
3. Server normalizes and resolves the member.
4. Server verifies active status and eligibility.
5. UI displays the associated plate; member confirms.
6. Server transactionally creates an `ACTIVE` session, enforcing duplicate/concurrency rules.
7. Server issues a high-entropy session credential associated with the session.
8. Server sets the credential as a `HttpOnly; Secure; SameSite=Lax` cookie in the check-in response. A repeat check-in at the same location reissues it and invalidates the old one.
9. Checkout QR route resolves location and checkout action.
10. Opening the checkout page sends a POST; the browser attaches the cookie.
11. Server validates credential, session status, location and policy.
12. Server transactionally sets checkout timestamp and `COMPLETED` status, records audit event and invalidates credential.
13. Server clears the cookie after confirmed success and the client displays the result.

Document exact implementation modules, functions, API routes, schema fields and failure modes once known.

## 6. Data model

Document the actual schema and map it to:
- Member.
- Vehicle.
- Parking location.
- Parking session.
- Session credential/token storage.
- Staff user/role.
- Audit event.

Include primary keys, foreign keys, unique constraints, indexes, nullability, deletion behaviour and migration history. Avoid duplicating models if existing tables can be extended safely.

**Current mapping (verified from `supabase/migrations/`, 2026-10-18):**

| Target entity | Current table | Notes |
|---|---|---|
| Member | `members` (`id uuid`, `full_name`, `phone text UNIQUE` in E.164 `+234…`, `pin_hash NOT NULL`, `failed_pins`, `locked_until`, `active`, `created_at`, `last_seen_at`) | Phone is stored as `+234…`, not local format. A PIN is mandatory. No display-phone column. |
| (none in target) | `guests` (`full_name`, `phone`, `member_id`) | Public check-in without an account. Phone is not unique. Deleted after 24 months by `delete_expired_guest_data`. |
| Vehicle | `vehicles` (`plate text UNIQUE`, normalised `^[A-Z0-9]+$`, `make`, `colour`, `active`, `vehicle_type`, `created_at`) and `member_vehicles (member_id, vehicle_id)` PK pair, cascade on delete | Up to four plates per member (`canAddVehicle`). Display form is computed by `formatPlate`. |
| Location | `areas` (`id smallserial`, `name`, `slug UNIQUE`, `active`, `sort`) | The slug is the QR identifier. `services` (name, weekday, start, end, active) also exists and every visit belongs to one. |
| ParkingSession | `visits` (`id uuid`, `reference`, `pass_token UNIQUE`, `vehicle_id`, `member_id` or `guest_id` (exactly one), `service_id`, `area_id`, `service_date`, `status parked/released/missed`, `checked_in_at`, `checked_in_by`, `released_at`, `released_by`, `release_method scan/search/sweep/midnight`, `held_at`, `held_by`, `check_in_key`) | `parked` is the target's `ACTIVE`; `released` is `COMPLETED`; `missed` (closed unscanned) has no target equivalent. Unique `(service_date, reference)`; partial unique `one_open_visit_per_vehicle (vehicle_id) WHERE status='parked'`; partial unique `visits_check_in_key`. No checkout-credential column. |
| StaffUser | `staff` (`full_name`, `phone UNIQUE`, `password_hash`, `role attendant/coordinator/admin`, `active`) | |
| AuditEvent | `audit_events` (`id bigserial`, `staff_id` nullable, `visit_id` nullable, `action`, `reason`, `before jsonb`, `after jsonb`, `created_at`) | No actor type, entity type or request id. Written by `logAudit()` and by the plpgsql functions. |
| (support) | `alerts`, `rate_events (key hash, created_at)`, `app_settings` | |

Deletion behaviour: deleting a member goes through `delete_member()` (migration `…030000`); guest visits older than 24 months are deleted daily; member visits and audit rows have no retention job.

## 7. State transitions and invariants

- `ACTIVE`: checked in, checkout time is null.
- `COMPLETED`: checked out, checkout time is set.
- Session status and timestamps must agree.
- Check-in and checkout transitions are performed on the server.
- Duplicate requests are safe.
- Wrong-location checkout is rejected unless explicit policy permits it.
- Completed sessions are not reopened through normal member actions.
- Staff corrections require an audit record and reason.
- No silent automatic expiry unless separately approved.

## 8. QR and token security

- Public QR codes are fixed per location and action.
- QR payload contains no member PII and no session credential.
- Use opaque location identifiers rather than sequential IDs where public exposure matters.
- Use a high-entropy random bearer credential for checkout authorization; do not assume an ordinary UUID/database ID is secret.
- Store a hash of the credential server-side when feasible.
- Use HTTPS, rate limiting, expiry/revocation and safe error messages.
- Never log raw credentials.
- Storage decision: server-set `HttpOnly; Secure; SameSite=Lax` cookie, path-scoped, 24 hours or until checkout. `localStorage` is not used (readable by script). Check the `Origin` header on the checkout POST. Document any deviation forced by the existing app.
- Missing credentials trigger re-check-in reissue or staff closure. The checkout endpoint never accepts a phone number. Accepted risk: check-in is phone-only, so reissue can be triggered by anyone who knows a member's number; mitigated by rate limits and audit (ADR-001 amendment).

## 9. API documentation

For every relevant endpoint, document:
- Method and route.
- Public/authenticated status.
- Required role.
- Input schema and validation.
- Success response.
- Error responses.
- Idempotency/concurrency behaviour.
- Data logged/audited.
- Rate limiting.

Do not write example routes as if they are real until verified in the codebase.

**Current endpoints (verified 2026-10-18).** The public check-in surface is Server Actions, which Next addresses by internal id, not by a stable route. Pages: `GET /c`, `/c/[area]`, `/scan`, `/p/[token]`, `/account/**`, `/staff/**`, `/admin/**`. Route handlers: `GET /p/[token]/status` (public, no-store status poll), `GET /staff/dashboard/data` (staff), `GET /admin/reports/export` (admin, audited), `GET /staff/manifest.webmanifest`. Public Server Actions: `checkInAsGuest`, `checkInMember` (`app/c/[area]/actions.ts`), `signUp`, `signIn` (`app/account/actions.ts`). Public actions are rate limited through `rate_events`; staff and admin actions check the role on the server. Full per-endpoint documentation (input schema, errors, audit) for the new flow is to be written with the implementation.

## 10. Configuration and secrets

Document required environment variables and safe examples without secret values. Never commit production credentials, private keys or live bearer tokens. State how configuration is validated and how secrets are rotated.

## 11. Observability and operations

Document:
- Log format and correlation IDs.
- Metrics for check-in/checkout success and failures.
- Alerting for elevated errors or unusually long active sessions.
- Backup/restore process.
- Migration and rollback procedure.
- Data retention policy.
- Staff procedures for missing token, wrong plate and manual closure.

Logs must not contain raw tokens, OTPs, passwords or unnecessary full phone numbers.

## 12. Testing strategy

Document where each test layer lives and how to run it:
- Unit tests for domain/state rules.
- Integration tests for persistence and transactions.
- API tests for auth, validation and error handling.
- End-to-end tests for QR flows.
- Concurrency/idempotency tests.
- Regression tests for existing MVP behaviour.
- Manual device/browser test matrix.

## 13. Architecture decision records

Store ADRs in a predictable directory, e.g. `docs/adr/`, if consistent with the repository. Each ADR should contain status, context, decision, alternatives, consequences, security impact and validation. ADR-001 in this pack records the browser-held checkout credential decision.

## 14. Required update discipline

Any implementation change affecting module boundaries, data model, auth, QR format, credential storage, session state, or deployment must update this file and the relevant ADR. Clearly distinguish current implementation from intended future state.

## 15. As built: deviations and open items (2026-10-20)

The implementation follows this document with the differences below. The full table, with reasons, is in `docs/GAP_ANALYSIS.md` section 0, and the operating steps are in `docs/qr-rollout.md`.

- **Checkout** is a Server Action (a POST) at `/c/<car park>/out`, not a REST route. It requires an `Origin` header naming this site (Next's own check lets a request with none through). §9 endpoints as built:
  - `lookupMember`, `confirmCheckIn` (`app/c/[area]/qr-actions.ts`): public, rate limited per address and phone number, reissue limited per phone number; call `check_in_with_credential`; set the `cp_exit` cookie only after success.
  - `checkOut` (`app/c/[area]/out/actions.ts`): public, reads the cookie, calls `checkout_with_credential`, clears the cookie only when the visit is closed.
  - `addMember`, `searchMembers` (`app/(team)/staff/member-actions.ts`): staff, any role; audited as `staff_register_member`.
  - `closeVisitForMember` (`app/(team)/staff/actions.ts`): staff, any role; reason required; calls `staff_close_visit`.
- **Location identifier** in both signs is the existing car park address, not an opaque token.
- **Not built:** request and correlation ids (audit rows and logs), and measurement of time to check in and failed check-ins by reason. There is almost no application logging, and nothing that handles the credential logs (a unit test enforces it).
- **Unchanged on purpose:** the midnight close, retention (guest records 24 months; visits and audit rows kept), the PIN accounts and the attendant's scan and release.
- **Unverified:** real iOS and Android behaviour, the live data checks, any deployment. See the status section of `docs/GAP_ANALYSIS.md`.