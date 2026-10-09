# Application audit: Church Parking Management System (CCI)

Audit date: 9 October 2026. Audited commit: `45c1e1b` on `main` (plus no uncommitted changes). Spec: `docs/spec.md` v0.3. Machine-readable register: `docs/audit/findings.json` (finding IDs below match it).

Evidence labels used throughout: **[Tested]** I ran it and saw the result. **[Inspected]** I read the code or SQL but did not run it. **[Estimated]** worked out from measured or inspected facts, not timed end to end. **[Unverified]** no evidence either way.

---

## A. Executive summary

The part of the product that matters most for car safety is well built. The exit check, the one-open-visit-per-vehicle rule, first-claim-wins, member plate lock, the atomic release, phone masking with logged reveals, the sweep, corrections with reasons, and the midnight close are all implemented, have unit and end-to-end tests, and behave as the spec says wherever I could test them. The attendant and member screens are consistent, mobile-first and follow the brand.

The product is **not ready for a pilot**. Large parts of the MVP admin and reporting scope are not built: there is no way to print QR signs (AD-2), no reports or CSV export (AD-4), no staff or member-PIN management (AD-3), no service management (AD-1, only car-park renaming exists), and no job that deletes guest records after 24 months (R-11). The roadmap milestones M6 (mostly), M7 and M8 are not done. The camera scanner has never been run on a real phone, and the app has no deployment, CI or security response headers.

**Biggest risks (details in sections E to H and L):**
1. No QR signs can be produced, so drivers cannot reach check-in in the real car park (FUN-01).
2. Pilot success measures (missed check-outs, releases without a pass) cannot be produced because there are no reports (FUN-02).
3. **Does not match** does not actually hold the car. It raises an alert and shows "Car held", but the visit stays `parked` and another attendant can release it (SEC-02).
4. Guest-record retention (R-11) is not implemented, a Nigeria Data Protection Act exposure (FUN-05).
5. The scanner is untested on a real camera, and browsers only allow the camera on https (FUN-06). No deployment exists yet (OPS-01).

**Recommendation: NO-GO for a pilot** until the P0 and P1 items in section L are closed. Nothing found is an exploitable vulnerability in the code that exists today.

---

## B. Scope and methodology

**Inspected:** `docs/*`, all SQL migrations, `lib/rules`, `lib/db`, staff and member auth, server actions, route handlers, check-in, pass, attendant, dashboard and sweep screens, `next.config.ts`, `package.json`.

**Tested (commands run, section M):** unit tests, typecheck, lint, production build, Playwright end-to-end suite against the hosted dev Supabase project, `pnpm audit`, a production-server run (`next start`) for bundle-size and header measurements, curl checks of unauthenticated access, and a database round-trip timing script.

**Environment:** Windows 11, local production build on `localhost`, hosted dev Supabase project with synthetic data created by the tests. No production system exists. No real phone, camera, 3G profile or sunlight was used.

**Limitations (stated plainly):**
- No real-device camera test. No throttled-3G test. No load test (300 check-ins in 20 minutes).
- No automated accessibility scan (axe) was run. Contrast is covered by an existing unit test of the design tokens only. Keyboard and screen-reader behaviour were not tested by hand.
- Concurrent release was verified by a unit test with an in-memory store and by reading the SQL, **not** by two parallel requests against the live database.
- CSRF was not tested directly. Server actions in Next.js carry built-in origin checks, which I relied on without verifying.
- Timings of people (taps, seconds per transaction) are estimates. No usability session was run.
- Nigeria Data Protection Act points are design observations, not legal conclusions.

---

## C. Architecture overview

- **Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase (Postgres) used **only from the server** with the service key. Row-level security is on with no policies, so a browser holding the public key cannot read anything. [Inspected]
- **Data flow, check-in:** QR sign opens `/c/{area}` → server action (`app/c/[area]/actions.ts`) → pure rules in `lib/rules/claim.ts` (R-1, R-2, R-4, R-5) → store functions in `lib/db` → insert into `visits`. The database unique index `one_open_visit_per_vehicle` is the last line of defence for R-2. The pass token is remembered in a signed httpOnly cookie on that phone (CI-6).
- **Data flow, release:** scanner decodes QR in the browser → `lookupPass` server action → `buildScanCard` → attendant taps Release → `releaseCar` → `releaseVisit` (staff check, status, date) → SQL function `release_visit`, which updates `WHERE status='parked'` and writes the audit row in one transaction. [Inspected]
- **Auth:** custom signed cookies (HMAC-SHA256, constant-time compare). Staff 12 hours, member 180 days. The staff account is re-read from the database on every request, so deactivation takes effect immediately. PINs and staff passwords use argon2id. Lockout and rate limits use hashed keys in `rate_events`. [Inspected]
- **Roles:** `requireStaff(minimum)` for pages and `currentStaff()` plus `canCorrect/hasRole` inside every server action and route handler. [Inspected] Unauthenticated requests to staff pages return the sign-in redirect with no data, and `/staff/dashboard/data` returns 401. [Tested, curl]
- **Live board:** the browser polls `/staff/dashboard/data` every 3 seconds and redraws only when numbers change. [Inspected + e2e]
- **Scheduled jobs:** `pg_cron`: midnight close at 23:00 UTC (= 00:00 Africa/Lagos) and a daily clean-up of `rate_events`. No other jobs. [Inspected]

---

## D. Requirements compliance matrix

Status: Pass, Partial, Fail, Not implemented, Not tested. Evidence tags as above. MVP items only unless stated.

| ID | Requirement | Status | Evidence | Gap or risk | Action |
|---|---|---|---|---|---|
| CI-1 | Area QR opens check-in for that area | Partial | `/c/[area]` works [Tested e2e]. No screen or file generates the QR signs | Signs cannot be made in-app | FUN-01 |
| CI-2 | R-1 auto service, driver can change | Pass | `pickService` unit tests cover 07:00, 08:45, 09:05, 11:29, 13:45 [Tested]; change-service control present | None | |
| CI-3 | Guest needs name, phone, plate; plate normalised | Pass | e2e member-flow, claim tests [Tested] | None | |
| CI-4 | Member check-in in two taps | Pass | One car: 1 tap. Several cars: 2 taps (choose car, Check in) [Inspected + e2e member-experience] | None | |
| CI-5 | Open visit blocks check-in, exact message, coordinator alert, never show pass | Pass | claim tests and e2e [Tested] | None | |
| CI-5b | Member plate blocks guest, alert | Pass | claim tests, e2e [Tested] | None | |
| CI-6 | Pass reopens on same phone/account | Pass | e2e member-flow [Tested] | None | |
| CI-7 | Guest to member (v1.1, built early D-15) | Pass | e2e [Tested] | Out of MVP scope | |
| EX-1 | Camera scanner; only staff release | Partial | Staff-only enforced in code and tests [Tested]. Camera never run on a real phone; fails on non-https addresses [Tested, error observed] | Scanner unproven in the field | FUN-06 |
| EX-2 | Scan card: plate, area, service, first name; guest mark and last 4 | Pass | attendant-screens e2e checks no surname and no full number on screen [Tested] | None | |
| EX-3 | Release car / Does not match, both logged | Partial | Release logged with staff and time [Tested]. Does not match logs an alert but does not hold the visit [Inspected] | Hold is cosmetic | SEC-02 |
| EX-4 | Search by plate, phone, reference; method `search` | Pass | e2e [Tested] | None | |
| EX-5 | Does not match alerts coordinator in real time | Pass | alert row + 3-second poll [Tested e2e live-flow] | None | |
| EX-6 | Already-released or old pass warning with who and when | Pass | scan tests, e2e [Tested] | None | |
| EX-7 | Atomic release, first wins | Partial | Unit test with in-memory store [Tested]. SQL `UPDATE … WHERE status='parked'` is correct [Inspected]. No live-DB parallel test | Likely correct, not proven on the real database | SEC-09 |
| OP-1 | Live counts per service and area | Pass | e2e live-flow [Tested] | None | |
| OP-2 | Sweep: Still here / Gone | Pass | e2e operations [Tested] | None | |
| OP-3 | Corrections with reason, audited | Pass | e2e operations [Tested]; role check in `ops-actions.ts` [Inspected] | None | |
| OP-4 | Manual registration | Pass | e2e staff-member [Tested] | None | |
| AD-1 | Manage services and areas | Partial | Only car-park renaming (`/admin/areas`) [Tested]. No service management | Services only change by database edit | FUN-04 |
| AD-2 | Printable A4 QR signs | Not implemented | No route, no component; `lib/qr.ts` only used for the pass | Blocks pilot | FUN-01 |
| AD-3 | Manage staff, reset member PINs | Not implemented | No admin screen; staff are created with `scripts/seed-admin.ts` only | Locked-out members and staff changes need database access | FUN-03 |
| AD-4 | Reports per service, area, Sunday; CSV; export logged | Not implemented | No report route, no CSV code anywhere | Pilot success cannot be measured | FUN-02 |
| AD-6 | Admin works on a phone | Partial | The one admin screen fits at 320 to 412 px [Tested]; the rest do not exist | | |
| R-1…R-7, R-9 | Business rules | Pass | Unit and e2e tests [Tested] | | |
| R-8 | Midnight close, Lagos time | Partial | Cron at 23:00 UTC [Inspected]; the function is exercised by the sweep tests, but the schedule itself has not been observed running | Low | |
| R-10 | Paper-tally fallback | Not implemented | No attendant guide or fallback procedure document | Operational | OPS-01 |
| R-11 | Delete guest data after 24 months; members can delete | Partial | Member deletion works (`delete_member`) [Tested]. No retention job exists | NDPA exposure | FUN-05 |
| NFR | First-load JS under 150 KB | Fail | 196 KB gzip measured [Tested] | | PERF-01 |
| NFR | 300 check-ins / 20 min | Not tested | | | PERF-03 |
| NFR | Dashboard within 5 s | Pass | 3-second poll; e2e live-flow [Tested] | | |
| NFR | Check-in under 2 s on 3G | Not tested | | | PERF-02 |
| NFR | Sunlight readability | Not tested | High-contrast tokens only | | A11Y-01 |

Deliberately deferred and **not** counted as defects: OP-5 (area full), AD-5 (trends), attendant entry scanning (see section W, D-01 and D-17).

---

## E. Security findings

No finding below is an exploit I could demonstrate against the current code. The strongest controls (below) held up under inspection and tests.

**Confirmed controls [Inspected, most also Tested]:**
- Only `releaseVisit` releases; it needs a staff session, refuses passes from earlier days, and relies on one SQL `UPDATE … WHERE status='parked'` plus the audit insert in one function. `release_visit` is revoked from public, anon and authenticated roles.
- Pass tokens are 128-bit random values (`randomBytes(16)`), unique-indexed. The public pass view returns plate and status only; `/p/*` sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store` [Tested, curl].
- Unknown tokens give a not-found result with no information; status endpoint returns 404 for a bad token [Tested].
- Cookies: httpOnly, `SameSite=Lax`, `Secure` in production, HMAC-signed with expiry; member tokens cannot be used as staff tokens (`k` check).
- Role checks are repeated inside each server action and route handler, not only in the UI [Inspected]. Dashboard data returns 401 without a coordinator session [Tested].
- Inputs are validated with zod; all database access uses the supabase-js query builder (no string-built SQL found).
- Rate limits and PIN lockout use hashed keys, so raw phones and IPs are not stored.

**Findings:**

- **SEC-02 (Medium, confirmed): "Does not match" does not hold the car.** `doesNotMatch` only writes an alert (`app/(team)/staff/actions.ts`). The visit stays `parked`. The screen says "Car held. Do not release this vehicle.", but another attendant scanning the same pass sees "Ready for exit" and can release it. It also does not check that the visit exists or is still parked. *Impact:* this is the one human-error path in the theft control, and the wording promises more than the system does. *Fix:* add a flagged state on the visit (or an open `no_match` alert check) that the scan card shows prominently and that blocks Release until a coordinator clears it with a reason. Needs a spec decision because EX-3 only requires an alert (do not change decisions without approval).
- **SEC-01 (Medium, confirmed): no security response headers.** Measured on the production build: no Content-Security-Policy, X-Frame-Options or `frame-ancestors`, X-Content-Type-Options, Strict-Transport-Security, Permissions-Policy; `X-Powered-By: Next.js` is sent. *Impact:* the staff release screen could be framed (clickjacking); no defence in depth against XSS. *Fix:* add headers in `next.config.ts`, set `poweredByHeader: false`; HSTS on the production host.
- **SEC-03 (Medium, confirmed): the lockout recovery path and staff deactivation have no screen.** T-4 says an account locked after 15 failures needs an admin reset, and T-5 says admins can deactivate accounts. Neither has a UI (AD-3). Until built, both need direct database access. Related to FUN-03.
- **SEC-05 (High, confirmed): no guest-data retention job** (R-11). See FUN-05.
- **SEC-06 (Low, confirmed): signing out does not invalidate the token.** `endStaffSession` deletes the cookie only; a copied cookie stays valid until its 12-hour expiry unless the account is deactivated. Acceptable for this threat model; note for training (T-5).
- **SEC-04 (Low, confirmed): dependency audit.** `pnpm audit`: 1 high advisory, `braces` (stack exhaustion on deeply nested patterns) through `eslint-config-next`. Development tooling only, no patched version, not in the production bundle.
- **SEC-09 (Medium, test gap): EX-7 is not proven on the live database.** See D table. *Test:* run two parallel `release_visit` calls on one synthetic parked visit and assert exactly one non-null result.
- **SEC-07 (Info, unverified): deployment requirements in `docs/security.md`** (client-IP header from the proxy, no path logging of `/p/*`) cannot be checked until a host exists.

**Not assessed:** CSRF against server actions (relied on framework origin checks), SSRF (no outbound fetches from user input found), file uploads (none).

---

## F. Functional defects and gaps

- **FUN-01 (High, pilot blocker): QR signs cannot be printed (AD-2, CI-1).** No route or component builds a sign. `lib/qr.ts` makes the pass QR only. Without signs the check-in entry point does not exist physically.
- **FUN-02 (High, pilot blocker): no reports or CSV export (AD-4).** The pilot success criteria (missed check-outs under 5%, 70% digital) cannot be calculated. Export logging also unbuilt.
- **FUN-03 (High): no staff or member-PIN management (AD-3).** See SEC-03.
- **FUN-04 (Medium): services cannot be managed (AD-1).** Only car-park renaming exists. The test service is switched by a script.
- **FUN-05 (High): no retention job (R-11).** Add a daily `pg_cron` job deleting guest visits and guests older than 24 months, with a test that seeds an old record.
- **FUN-06 (High, unverified): scanner not proven on a real device (EX-1).** On `http://192.168.x.x` the browser refuses the camera (observed: "Camera streaming not supported by the browser"). Real use needs https (a deployed host solves this). Not yet seen decoding a real printed or on-screen pass, in sunlight, or from a typical distance. *Test:* run on two Android and one iPhone against the deployed https build.
- **FUN-07 (Low): scanner restarts the camera after every result.** See workflow section.
- **FUN-08 (Low, unexplained): a layout check failed once** ("history at 320px: text spills out of its box") in the full end-to-end run and passed on the next run. Could be a real intermittent overflow or a timing artefact in the test. Not reproduced.

---

## G. UI/UX and accessibility findings

**What is good [Tested via screenshots and e2e layout checks at 320, 360 and 412 px]:** consistent tokens and shared components; status colours that also carry words (VALID PASS, ALREADY RELEASED, OLD PASS) so colour is never the only signal; large plate display; one-line plates; the red/black separation so Release (black) and Does not match (red) cannot be confused; plain wording; loading and empty states.

- **A11Y-01 (Medium, not tested): no automated or manual accessibility audit.** Only a token-contrast unit test exists. Not checked: keyboard order, focus visibility, screen-reader announcements for the result card and scan errors, text scaling to 200%, touch targets by measurement, sunlight legibility. *Fix:* add an axe pass to the Playwright suite and a manual TalkBack/VoiceOver pass.
- **UX-01 (Low): "Does not match" label is clear for staff but the follow-up is not.** After tapping it the screen says "Car held" with no instruction about what the attendant does next (call coordinator?). See SEC-02.
- **UX-02 (Low): mockup items intentionally not built:** torch button, "Contact an attendant", "View all", "View details", "My Profile". Recorded in D-17. None is a spec requirement.
- **UX-03 (Low): the scanner error for non-https addresses is now explicit** (fixed this session) but the tester still needs an https host to see the camera work.

---

## H. Data integrity and business logic

**Verified [Inspected + Tested]:**
- `one_open_visit_per_vehicle` is a unique index on open visits; claims also catch the conflict at insert time and return the blocked result.
- Plates are normalised in one function used by every path; the table has a `plate ~ '^[A-Z0-9]+$'` check; search normalises look-alike characters.
- Release, correction, sweep, close, rename and delete are SQL functions that write the audit row in the same transaction.
- Carry-over: "Still here" keeps the visit open for the next service; leaving and returning creates a new visit.
- Dashboard counts and the sweep list read the same `visits` rows (e2e checks counts after check-in, release and sweep).

**Findings:**
- **DAT-01 (Low): pass expiry (R-7) is enforced in application code, not in `release_visit`.** The SQL checks only `status='parked'`. This is safe in practice because the midnight job closes old open visits, but the rule could be bypassed by a future code path that calls the RPC directly. *Fix:* pass the service date into the function.
- **DAT-02 (Low, unverified): the midnight job has not been observed running.** Only its function is exercised by tests.
- **DAT-03 (Info): alerts store the plate** and audit rows store method and status only. No names, phones or tokens were found in the audit payloads I read.

Nothing was changed or reconciled during the audit.

---

## I. Performance and reliability

**Measured [Tested]:**
- First-load JavaScript, production build, gzip of every script on the page: `/c/cp1` 196 KB (12 scripts), `/staff/signin` 199 KB, `/staff/scan` 200 KB, `/` 190 KB. The spec budget is 150 KB. Most of it is shared framework code (the home page is 190 KB), so a fix needs the shared bundle examined (PERF-01). The QR library loads on demand and is not in these numbers.
- Server page time on localhost, warm: 28 to 39 ms; the first cold request took 1.6 s.
- Database round trip from this computer to the hosted dev project: 212 to 300 ms typical (two cold samples at about 650 ms). `visits` held 251 rows. Count of the visits table took 274 ms.

**Estimated from code and the round-trip figure [Estimated]:** the check-in actions make about 9 to 12 database calls in sequence (guest: area, held pass, services, two rate records, vehicle lookup, stale close, open check, member check, create vehicle, create guest, insert). At about 230 ms each that is roughly 2 to 3 seconds of server time on this network, plus the device's own latency. A release is about 3 calls (staff lookup, state read, release RPC), roughly 0.7 s. A scan lookup is about 2 calls, roughly 0.5 s. A real deployment in the same region as the database would be faster. These are not measured end to end.

- **PERF-01 (Medium, confirmed): first-load JS is 196 KB, over the 150 KB budget.**
- **PERF-02 (Medium, estimate): chained database calls dominate action latency.** Combine into one SQL function per action, or run independent reads in parallel.
- **PERF-03 (Medium, unverified): 300 check-ins in 20 minutes, 3G load time and the 5-second dashboard under many viewers have not been load-tested.** The dashboard polls every 3 seconds per open device, which is cheap for a few coordinators. *Test:* k6 or Playwright load against a deployed staging project with a paid-tier database.
- **OPS-01 (High): no deployment, no production Supabase project, no CI, no backups plan, no attendant guide or paper-fallback procedure.** Roadmap M8 is not started.
- **OPS-02 (Medium): the end-to-end suite takes about 18 minutes, runs against the shared dev database, and cannot run while a dev server is running.** One layout check was flaky (FUN-08).

---

## J. Analytics and reporting

The only metrics in the app are the live dashboard counts (checked in, released, still parked, per service and area) and the alert feed. They are computed from `visits` and `alerts`, not from mock data [Inspected]; the e2e tests reconcile counts after real actions [Tested]. No other reports, KPIs or charts exist, and no CSV. "Releases without a pass" can be counted from `release_method='search'` in the database, but nothing shows it. Missed check-outs have a status (`missed`) but no report. See FUN-02. No capacity percentages or spaces-left figures are shown, as the spec requires.

---

## K. Strengths and weaknesses

**Strengths (with evidence):**
1. Exit security design: atomic release function with audit in the same transaction, staff checks repeated server-side, expired and already-released handling [Inspected, unit and e2e tested].
2. Database-enforced rules: unique open visit, plate format check, RLS on with no policies.
3. Privacy at the screen: no surname or full number on attendant cards, reveals logged, public pass view limited [Tested].
4. Test depth: 171 unit tests, about 50 end-to-end tests covering the real flows, including edge cases such as plate conflicts, lockout, corrections and layout at three phone widths.
5. UI consistency and plain language suited to volunteers.

**Weaknesses:** missing admin, QR sign and reporting scope; no retention job; Does not match not enforced; scanner unproven on hardware; no deployment or CI; bundle over budget; no accessibility audit; sequential database calls.

---

## L. Prioritised remediation roadmap

Effort: S (hours), M (a day or two), L (several days). MVP unless marked.

**P0 critical (before any operational use)**
- None found in the code that exists. The first operational use is blocked by the P1 items below, not by an exploitable flaw.

**P1 high (block a safe pilot)**
| ID | Item | Effort | Verify by |
|---|---|---|---|
| FUN-01 | Printable A4 QR signs per area (church name, logo, large area name) | M | Print, scan at 1.5 m in daylight |
| FUN-02 | Reports per service, area, Sunday; missed check-outs; releases without a pass; CSV, logged | L | Reconcile numbers to database; open CSV in Excel |
| FUN-03 / SEC-03 | Staff management and member PIN reset (admin only, audited) | M | e2e: admin resets a locked member |
| FUN-05 / SEC-05 | Retention job for guest data (24 months) | S | Seed old record, run job, assert deleted |
| SEC-02 | Make Does not match hold the visit until a coordinator clears it (needs your decision on D-entry) | M | e2e: second attendant cannot release a flagged visit |
| FUN-06 | Prove the camera scanner on real phones over https | S (once hosted) | Field test on 3 phones |
| OPS-01 | Deploy to staging and production hosts, production Supabase project, backups, CI, attendant guide | L | Run section 11 of the spec |

**P2 medium**
| ID | Item | Effort |
|---|---|---|
| SEC-01 | Security headers, hide X-Powered-By | S |
| SEC-09 | Live-database parallel release test | S |
| PERF-01 | Bring first-load JS under 150 KB | M |
| PERF-02 | Collapse chained database calls into single functions | M |
| PERF-03 | Load test 300 check-ins in 20 minutes; throttled-3G check | M |
| FUN-04 | Service management screen | M |
| A11Y-01 | axe pass in the suite and a manual screen-reader pass | M |
| OPS-02 | Faster, isolated test environment; fix flaky layout check | M |

**P3 low**
SEC-04 (dev-only advisory, update when patched), SEC-06 (document logout caveat), DAT-01 (date check in SQL), DAT-02 (observe the midnight job), FUN-07 (scanner restart), FUN-08 (investigate flake), UX-01, UX-02.

**v1.1 and later (not MVP blockers):** OP-5 area full, AD-5 trends, optional attendant entry scanning if you decide to change D-01.

---

## M. Test results

| Command | Result |
|---|---|
| `pnpm test` (Vitest) | 22 files, 171 tests, all passed (run twice this session) |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm build` | compiled successfully, all routes built |
| `pnpm test:e2e` (full, Pixel 7 viewport, hosted dev DB) | 48 passed, 2 failed in the first full run. The `operations` failure was an outdated test selector (fixed; file re-run: 5 passed). The layout "history at 320px" failure did not repeat in the next run (all `layout` tests passed). No full 50-of-50 run was done after the fixes |
| `pnpm test:e2e attendant-screens.spec.ts` | 7 of 7 passed |
| `pnpm audit` | 1 high (dev-only, no patch) |
| Production server measurements | bundle size, headers, unauthenticated access (section I and E) |
| DB round-trip script | 8 samples, 212 to 300 ms typical |
| Skipped or not run | camera on a real device, throttled 3G, load test, axe, live-DB parallel release, CSRF probe |

---

## N. Pilot go/no-go

**NO-GO.** Reasons, all evidenced above: the QR signs, reports, staff and PIN management and the retention job required by the MVP are not built (D table); the Does not match control does not hold the car (SEC-02); the scanner has not been shown to work on a real camera (FUN-06); there is no deployment, CI or fallback guide (OPS-01); and the bundle is over budget (PERF-01). The tests and build pass, but that does not cover these gaps.

## O. First five actions

1. Decide how **Does not match** should hold a car (SEC-02), since it changes the exit rule.
2. Build QR sign printing (FUN-01), the smallest item that unblocks a physical test.
3. Deploy to a staging host with https and test the scanner on real phones (OPS-01, FUN-06).
4. Build reports and CSV (FUN-02) plus the retention job (FUN-05).
5. Build staff and PIN management (FUN-03), add the security headers (SEC-01) and the live-database release test (SEC-09).

---

## W. Workflow efficiency and optimisation

Method: step counts come from reading the components; durations are labelled. No timed usability session was run, so no time saving below is measured. The database round trip (about 230 ms) is the only timing measured, and it feeds the latency estimates.

### W1. Member check-in (target under 10 s)

**Current journey [Inspected, e2e covers the path]:** scan QR → page loads with the member recognised from the cookie → car list. One car: it goes straight to Confirm, so **1 tap** (Check in). Several cars: tap a car (advances to Confirm), tap **Check in** = **2 taps**. Pass appears after the server confirms. No typing. Service and area are automatic (R-1, QR).

**Compared with the options:**
- Option A (choose car, Check in): already the multi-car flow.
- Option B (single car, one prominent Check in): already built, 1 tap.
- Option C (open visit): the blocked card shows the prescribed message and never the pass [Tested].
- Auto check-in on scan: not recommended. It would remove the driver's confirmation and the chance to change the service.

**Elapsed time:** human part about 3 to 6 s [Estimated]. Server part about 2 s [Estimated: 9 chained calls × about 230 ms], plus page load. So the 10-second target is plausible but unproven on a real phone and network.

**Bottleneck (confirmed by code, not timed):** chained database calls in `claimMemberVisit`/the action (PERF-02). **Recommendation (quick win to workflow):** one SQL function doing the member-ownership check, stale close, open check and insert; read the services and area in parallel. **Expected:** server time from about 2 s to about 0.5 s (estimate). **Risk:** the rules must stay identical; the existing claim tests and e2e protect this. **Tests:** existing claim suite, plus a timed Playwright run of the member flow against a staging host.

### W2. Guest check-in (target under 45 s)

**Current [Inspected]:** scan → "Continue as guest" (1 tap) → fill name, phone, plate (3 fields; phone uses a tel keyboard, plate auto-capitalises) → "Get my pass" (tap 2) → confirmation screen → "Yes, get my pass" (tap 3) → pass. 3 taps, 3 fields. Typing about 15 to 30 s [Estimated], plus about 2.5 to 3 s server time [Estimated]. Within 45 s on paper.

**Is the confirmation screen worth it?** Yes. A mistyped plate would issue a pass for the wrong car and leave the real one unprotected, so the review step guards the security check. Keep it. Fields are kept when an error returns the form [Tested e2e].

**Recommendations:** (quick win) move the "Service" selector below the fields or hide it behind "Change" like members have, since R-1 chooses correctly; (backend) same single-function change as W1. **Do not remove** name, phone or plate. **Test:** timed e2e with realistic typing delay; a usability session with 5 first-time guests.

### W3. Attendant exit

**Current sequence [Inspected]:** Home → Scan pass (1 tap) → camera starts (first time asks permission) → QR detected automatically (no extra tap) → `lookupPass` (about 2 calls, about 0.5 s [Estimated]) → result card → attendant checks, asks the driver for name and phone when a guest → **Release car** (1 tap) → `releaseCar` (about 3 calls, about 0.7 s [Estimated]) → "Car released" → **Scan next pass** (1 tap) → the scanner component stops and restarts the camera.

**Taps per car** once the scanner is open: **2** (Release car, Scan next pass), plus the attendant's questions. From Home: 3. Screens: result card only; no intermediate confirm. **Time per car:** driver conversation dominates; system part about 1.5 to 2 s plus camera restart [Estimated]. The camera restart cost per scan is a **hypothesis** to measure on a real phone.

**Safer faster options evaluated:**
- Keep the camera stream alive between scans (pause instead of stop). *Benefit:* removes restart time. *Risk:* low; battery. Medium effort, medium confidence.
- Auto-return to the scanner a few seconds after "Car released". *Benefit:* saves the Scan next pass tap. *Risk:* an attendant might miss the confirmation; keep the tap as the default and make the timeout opt-in. Needs usability testing.
- Never auto-release on a valid scan. Keep both required checks. Agreed with your rule.
- Failed requests cannot show false success: `releaseCar` returns the real result and the card shows "already released" or an error [Tested].

**Expected effect on queues:** small per car, meaningful at two attendants and 300 cars; unmeasured. **Tests:** timed field trial with a stopwatch protocol (see W8), and e2e for scan, release, scan-next without a reload.

### W4. Attendant entry

The spec gives drivers self check-in and attendants only release (D-01, D-17), so there is no attendant entry scan to optimise and this is not a defect. If you later decide attendants should record entries, it needs a new rule decision (duplicate protection, who owns the pass). The related efficient path that exists is manual registration (W5).

### W5. Manual lookup and registration

**Lookup [Inspected, Tested]:** scanner → "Enter plate number manually" (1 tap) → choose By plate/phone/reference → type → Search → result card → Release. Plate search tolerates look-alike characters (0/O, 1/I) and a reference works without "PK-". Results are today's visits only and show the last 4 digits. A failed search says "No car found today." with no suggested next step. **Recommendation (quick win):** on no result, offer "Add car" with the plate typed in already filled. **Phone search ranking:** results are not ranked [Inspected]; low impact.

**Registration:** plate and phone required, name optional, area; duplicate and member-plate checks run before creating [Tested]. Efficient already. **Recommendation:** pre-select the area last used on this device. **Risk:** none to the checks. **Tests:** e2e for each.

### W6. Coordinator and sweep

**Sweep [Inspected, Tested]:** cars grouped by area; each shows plate and decision buttons; each decision saves at once (one action, about 3 calls); a "N cars left to check" counter shows unresolved ones; contradictory decisions are blocked by status checks (`bad_state`). **Taps:** one per car. **Bottleneck:** for a large carry-over list, one tap per car. **Option:** "Mark the rest Still here" with a confirmation that lists the count, applied as individual audited sweeps. Never "Gone" in bulk, never release. **Risk:** accidental bulk; mitigated by the confirmation and per-visit audit rows.

**Urgent issues:** alerts appear on the live board, which is a separate screen from the sweep. A badge count of open alerts on the coordinator's tab bar would avoid opening the board. Medium effort.

### W7. Admin tasks

Not assessable: signs, staff, services and reports do not exist (FUN-01 to FUN-04). Design them so each is reachable in two taps from Admin and works at 320 px.

### W8. Optimisation table

| Workflow | Current steps | Current duration | Main bottleneck | Recommended change | Expected benefit | Risk |
|---|---|---|---|---|---|---|
| Member check-in | 1 tap (one car), 2 taps (several) | Human 3 to 6 s; server about 2 s [Estimated] | About 9 chained DB calls | One SQL function for the claim | Server time about 2 s to about 0.5 s [Estimated] | Rules must stay identical |
| Guest check-in | 3 taps, 3 fields | Typing 15 to 30 s; server 2.5 to 3 s [Estimated] | Typing; chained DB calls | Hide service picker; single SQL claim | Less to read; faster server | Keep review step |
| Attendant entry | Not in spec | n/a | n/a | None | n/a | Needs rule change |
| Attendant exit | 2 taps once scanner is open; 3 from Home | System about 1.5 to 2 s plus camera restart [Estimated; restart unmeasured] | Camera restart; DB calls | Keep camera alive; fewer calls | Faster next scan [Hypothesis] | Never auto-release |
| Manual lookup | 1 tap to open, type, Search, Release | Typing dominated | Typing the full plate | Offer Add car on no result | Fewer dead ends | None |
| Manual registration | Fill plate, phone, area, Add | Typing dominated | Area re-selection | Remember last area | One field fewer | Low |
| End-of-service sweep | 1 tap per car | Proportional to cars | Many carried-over cars | Bulk "rest are Still here" with confirmation | Large lists much faster | Accidental bulk; mitigated |

### W9. Prioritised workflow recommendations

| ID | Role | Change | Complexity | Confidence | Acceptance | Tests |
|---|---|---|---|---|---|---|
| WF-01 | Member, guest | Single SQL claim functions, parallel reads | Medium | Medium | Same results as the claim test suite; server time cut by at least half on staging | Existing claim tests, timed e2e |
| WF-02 | Guest | Hide service picker behind Change | Low | High | R-1 service still chosen; changing still works | e2e guest flow |
| WF-03 | Attendant | Keep camera stream alive between scans | Medium | Medium | Next scan ready under 1 s after "Scan next pass" on a mid-range phone | Real-phone timing |
| WF-04 | Attendant | Offer Add car with the plate on no result | Low | High | Link carries plate into the form | e2e |
| WF-05 | Attendant | Remember last area on the device | Low | High | Area preselected on next registration | e2e |
| WF-06 | Coordinator | "Mark rest Still here" with count confirmation | Medium | Medium | One audited row per visit; Gone never bulk | e2e, audit check |
| WF-07 | Coordinator | Open-alert count on the tab bar | Low | High | Count matches unresolved alerts within 5 s | e2e |
| WF-08 | Attendant | Optional auto-return to the scanner after release | Low | Low | Only if usability testing shows no missed confirmations | Usability test |

Quick wins: WF-02, WF-04, WF-05, WF-07. Workflow improvements: WF-03, WF-06, WF-08. Backend: WF-01 (also PERF-02). Higher risk: anything that touches the release step (none recommended).

### W10. Measures of success

Define start and end points and do not reward speed alone.

| Metric | Start | End |
|---|---|---|
| Member check-in time | QR page request | Pass shown |
| Share of members under 10 s | same | same, 10 s threshold |
| Guest registration time | "Continue as guest" tap | Pass shown; target under 45 s |
| Attendant exit time per car | Pass detected | "Car released" shown (system part only) |
| Taps per transaction | First tap | Last tap |
| Scan failure rate | Camera started | Result card or error; failures divided by attempts |
| Manual lookup rate | Releases by `search` divided by all releases (already in the database) |
| Retry rate | Repeat actions on the same visit within a minute |
| Mismatch rate | `no_match` alerts divided by releases |
| Duplicate rate | `plate_conflict` alerts divided by check-ins |
| Exit queue duration | Needs a stopwatch observation on pilot Sundays |
| Sweep time | Sweep opened | counter reaches zero |
| Missed check-out rate | `missed` divided by all visits after the sweep (spec target under 5%) |

Guard against gaming: report mismatch and manual-lookup rates alongside speed, and review the audit log for unusually fast releases of guest passes.

Instrumentation needed (none exists): timestamps for page load and action completion, kept free of names, phones and tokens (security rule 6).


---

## R. Remediation status (added after the fixes)

Re-checked on the same day. The register (`docs/audit/findings.json`) now carries a `status` and `status_note` on each finding.

**Fixed and tested**
SEC-01 security headers, SEC-02 hold on Does not match (D-18), SEC-03 and FUN-03 staff and member-PIN management, SEC-05 and FUN-05 guest retention job (D-20), SEC-09 live-database parallel release test, FUN-01 QR signs, FUN-02 reports and CSV, FUN-04 services, DAT-01 service date inside `release_visit`, UX-01 wording, WF-02, WF-04, WF-05, WF-06. Also added at the owner's request: show/hide buttons on every PIN and password box, and adding and switching off car parks.

**Partly fixed**
- A11Y-01: an automated axe scan now runs over every screen and passes (it found one real problem, a scrollable table that keyboards could not reach, now fixed). Keyboard order, screen-reader wording, text scaling and sunlight legibility still need a person.
- OPS-01: CI workflow (`.github/workflows/ci.yml`) and the attendant guide with the paper fallback (`docs/attendant-guide.md`) are added. Hosting, a production Supabase project and backups are not done.
- PERF-01: re-measured at about 157 KB gzip for current phones (the 196 KB figure included a 39 KB legacy-browser file that modern browsers do not download). Still above the 150 KB budget.
- PERF-02 and WF-01: independent reads in both check-in actions now run together and two rule checks are asked together. A single SQL claim function was not built.
- WF-07: the admin overview shows the open-exceptions count; there is no live badge on the tab bar.

**Still open (cannot be closed from this computer)**
FUN-06 camera scanner on real phones over https; PERF-03 load and 3G tests; SEC-07 deployment checks; DAT-02 first real midnight run; WF-03 camera keep-alive and WF-08 auto-return (both need device timing and usability testing); OPS-02 a dedicated test project; SEC-04 and SEC-06 accepted risks; FUN-07 and FUN-08.

**Test results after the fixes**
- `pnpm test`: 187 unit tests passed.
- `pnpm typecheck`, `pnpm lint`: clean. `pnpm build`: compiled.
- `pnpm test:e2e`: 65 passed, 0 failed (the earlier layout failures were real and fixed: the narrow-phone History row and a test that counted the hidden desktop menu).

**Pilot recommendation after remediation:** still NO-GO until the scanner is proven on real phones over https and the app is deployed, with a production database and backups. The functional MVP gaps listed in section D are closed.
