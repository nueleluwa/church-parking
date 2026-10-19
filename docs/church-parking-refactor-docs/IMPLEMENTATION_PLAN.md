# Implementation Instructions: Phases and Epics

## Guiding principle

Refactor the existing MVP incrementally. Do not begin by replacing the framework, database, authentication or UI architecture. First discover what exists, map it to requirements, then implement the smallest safe set of changes.

## Phase 0 — Repository discovery and baseline

**Epic 0: Baseline and gap analysis**

Tasks:
1. Inspect repository, dependencies, routes, schema, migrations, auth, QR code handling, UI and tests.
2. Run current tests, lint, type checks and build; record baseline failures.
3. Map existing functionality to SRS requirements.
4. Identify data quality issues: duplicate phone numbers, duplicate plates, sessions with inconsistent status/timestamps, and missing location links.
5. Record current API contracts and important existing workflows.
6. Create a refactor checklist and risk register.

Deliverables:
- Repository-specific gap analysis.
- Current architecture snapshot.
- Baseline test/build report.
- Migration and rollback plan.

Exit criteria:
- Existing architecture and data model are understood.
- No destructive implementation work begins before data risks are known.

## Phase 1 — Domain and data integrity

**Epic 1: Member/vehicle data**
- Reuse or extend existing member and vehicle models.
- Normalize phone and plate values consistently.
- Add validation and duplicate detection.
- Ensure admin and staff registration paths are permissioned.
- Ensure unknown public check-in attempts do not create records.

**Epic 2: Parking location and QR configuration**
- Reuse existing location model if available.
- Ensure separate fixed check-in and checkout QR destinations per location.
- Ensure public QR payloads do not expose personal data or session credentials.
- Ensure inactive locations cannot process sessions.

Exit criteria:
- Migration is tested against a copy of representative existing data.
- Registration, duplicate detection and location routing tests pass.
- Existing member data and session history remain intact.

## Phase 2 — Check-in and session credentials

**Epic 3: Check-in workflow**
- Resolve location/action from the QR route.
- Accept and normalize phone number.
- Validate member active status and location eligibility.
- Display registered plate and require confirmation.
- Enforce session policy and create an active session transactionally.
- Handle existing active sessions clearly.

**Epic 4: Credential lifecycle**
- Generate high-entropy checkout credential only after successful check-in.
- Associate credential with the session server-side; store a hash when feasible.
- Set the credential as a `HttpOnly; Secure; SameSite=Lax` cookie (24 hours or until checkout).
- Implement credential reissue on repeat check-in at the same location.
- Define lifetime, revocation and storage failure behaviour.
- Redact credentials from logs and telemetry.

Exit criteria:
- Successful check-in creates one active session and a credential.
- Failed check-in creates neither an active session nor a usable credential.
- Duplicate/concurrent requests are safe.

## Phase 3 — Automatic checkout

**Epic 5: Checkout QR and session closure**
- Route checkout QR to a location-specific checkout page.
- Read the stored credential automatically.
- Submit it to the backend; validate token, session state, location and policy.
- Close session atomically and set checkout timestamp.
- Revoke/clear credential after confirmed success.
- Implement safe responses for already-closed, invalid, expired and wrong-location cases.
- Implement the missing-token message (re-scan check-in QR or ask staff); checkout never accepts a phone number.

Exit criteria:
- Same phone/browser can check out without entering phone number.
- A missing or invalid token never silently closes a session.
- Repeat checkout requests are idempotent.
- Cross-location behaviour follows explicit policy.

## Phase 4 — Staff tools, history and reporting

**Epic 6: Staff exception handling**
- Add or update restricted staff registration workflow.
- Add audited manual session closure with required reason.
- Add member lookup and session lookup.
- Ensure staff cannot perform admin-only actions.

**Epic 7: Reporting**
- Active sessions view.
- Searchable session history.
- Filters by date, location, member/plate and status.
- CSV import/export with validation and permission enforcement.
- No credentials in reports.

Exit criteria:
- Staff can resolve expected operational exceptions.
- Admins can review active and historical sessions.
- Exports respect role permissions.

## Phase 5 — Security, regression and rollout

**Epic 8: Security and quality**
- Rate-limit public lookup and credential endpoints.
- Verify HTTPS and secure cookie/storage decisions.
- Check CSRF/XSS protections and input validation.
- Audit sensitive actions.
- Test concurrency, retries and failure states.
- Run regression suite against supported existing MVP features.
- Review logs for sensitive-data leakage.

**Epic 9: Pilot and deployment**
- Deploy to staging.
- Test printed QR codes on real iOS and Android devices and common browsers.
- Test browser storage cleared, private browsing, another browser, network loss, expired token and staff-assisted recovery.
- Pilot at one location with a small member cohort.
- Monitor check-in/checkout success, fallback rate and session discrepancies.
- Prepare rollback steps and support instructions before production release.

Exit criteria:
- Acceptance criteria in SRS pass.
- Critical/high security findings are resolved or explicitly accepted.
- Backup and rollback plan is tested.
- Staff know how to handle missing-token and failed-session cases.

## Cross-cutting engineering tasks

- Keep business rules in shared server-side services.
- Use transactions and database constraints where appropriate.
- Keep server timestamps authoritative.
- Add unit, integration and end-to-end tests.
- Update `ARCHITECTURE.md` and ADRs when implementation decisions change.
- Preserve existing unrelated functionality.

## Test matrix

| Area | Cases |
|---|---|
| Registration | Valid, invalid, duplicate phone, duplicate plate, CSV errors |
| Eligibility | Active, inactive, unknown, staff registration |
| QR routing | Correct location/action, invalid token, inactive location |
| Check-in | Plate confirmed, plate not confirmed, existing session, concurrent requests |
| Credential | Issued after success, persistence, missing, invalid, expired, revoked |
| Checkout | Happy path, wrong location, already completed, repeated scan, concurrent close |
| Recovery | Missing token, reissue at same location, blocked at other location, old credential rejected, staff override, audit reason |
| Security | Rate limiting, authorization, CSRF/XSS review, token redaction |
| Regression | Existing supported workflows and historic data |
| Browser/device | Same browser, different browser, private mode, cleared storage, mobile browsers |
