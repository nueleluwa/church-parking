# AGENT.md — Instructions for Coding Agents

## Mission

Refactor the existing church parking MVP to implement the agreed QR check-in/check-out flow with minimal disruption. This is not permission to rebuild the product from scratch.

## Product invariants

1. Administrators pre-register members with phone number and vehicle plate number.
2. Unknown phone numbers are directed to parking staff. Do not add public self-registration.
3. Each location has separate fixed check-in and checkout QR codes.
4. Check-in requires phone lookup and explicit vehicle plate confirmation.
5. Successful check-in creates a server-side parking session.
6. The server sets the checkout credential as a `HttpOnly; Secure; SameSite=Lax` cookie in the member's browser. Do not use `localStorage`.
7. Scanning the checkout QR on the same phone/browser should close the active session without re-entering the phone number when the credential is available.
8. Missing credentials: nothing is closed. The member can re-run check-in at the same location to receive a replacement credential for the existing session (old one invalidated, audited), or staff close it. The checkout endpoint never accepts a phone number.
9. Server-side logic is authoritative for session state, location checks, timestamps and permissions.
10. Preserve existing unrelated functionality and data.
11. No OTP or extra verification at check-in. Do not add it.
12. Phone numbers use local format (08012345678); convert `+234`/`234` input.
13. One active session per member across all locations. Checkout is a POST, never a GET.
14. Policy values are in `SRS.md` §11; keep them configurable.

## First actions before coding

- Inspect the repository tree, README, dependency manifests, environment examples, routes/controllers, models/schema, migrations, auth, UI components and tests.
- Identify the current framework, database, API conventions, test commands, lint/format commands and deployment model.
- Map existing entities and workflows to `SRS.md` and `BLUEPRINT.md`.
- Identify current check-in, checkout, QR, member, vehicle and staff implementations.
- Write a short gap analysis before changing code.
- Do not assume route names, framework, ORM, CSS framework or deployment provider.
- Do not ask the user to restate decisions already recorded in these documents.

## Implementation rules

- Make the smallest coherent change that satisfies requirements.
- Follow existing naming, architecture, error-handling, validation and testing patterns.
- Put business rules in shared server-side services/domain logic, not only in UI code.
- Enforce authorization and eligibility on the server for every protected operation.
- Use database transactions and suitable constraints for session creation/closure.
- Design check-in and checkout for safe retries and concurrent requests.
- Use a cryptographically secure, high-entropy session credential if possession authorizes checkout. Do not assume a database ID or ordinary UUID is secret.
- Prefer storing a hash of bearer credentials server-side when feasible.
- Never log session credentials, OTPs, passwords or secrets.
- Do not put member personal information or a session credential in static QR codes.
- Treat phone numbers and plate numbers as personal data; minimize exposure and exports.
- Make timezone handling explicit.
- Do not silently auto-close sessions; implement only an approved expiry policy.
- Add or update tests alongside code, not after the fact.
- Update `ARCHITECTURE.md` if the implementation materially differs from the target or decisions.

## Migration and compatibility rules

- Review the current schema and data before changing it.
- Prefer additive migrations and explicit backfills.
- Detect duplicate normalized phone/plate values before adding uniqueness constraints.
- Preserve historic sessions.
- Provide rollback notes for schema and data migrations.
- Do not remove existing routes or fields until compatibility and data migration are verified.
- Avoid creating duplicate tables/models if current equivalents can be extended safely.

## Required testing

At minimum, cover:
- Admin member registration and validation.
- Staff-only registration of an unknown arrival.
- Public unknown-number path directs to staff and creates no account.
- Inactive member rejection.
- Check-in QR location/action validation.
- Vehicle confirmation before session creation.
- Successful session creation and credential issuance.
- Credential persistence and retrieval on the same browser.
- Successful checkout without phone re-entry.
- Missing/invalid credential fallback (re-check-in reissue and staff closure).
- Credential reissue: no second session, original check-in time kept, old credential rejected, audit event, rate limiting, blocked at a different location.
- Wrong-location checkout rejection.
- Duplicate/concurrent check-in prevention.
- Idempotent/repeated checkout.
- Staff manual closure authorization and audit.
- No raw credential in logs.
- Regression tests for existing supported features.

Run the repository's actual test, lint, type-check and build commands. Report commands run and outcomes honestly. Do not claim tests passed if they were not run.

## Working style

- Explain the intended change before broad or destructive edits.
- Keep commits/patches small and logically grouped if version control is available.
- Do not reformat unrelated files.
- Do not add dependencies unless justified.
- Do not change secrets or production data.
- Never run destructive migrations against production without explicit approval and a backup/rollback plan.
- If a requirement conflicts with current architecture, describe the conflict and propose the least disruptive option.
- Keep implementation notes and decisions concise, concrete and repository-specific.

## Completion report

When finished, report:
1. What changed.
2. Files/modules changed.
3. Migrations and deployment steps.
4. Tests and commands run, including failures.
5. Known limitations and follow-up work.
6. Any deviations from the SRS/ADR and why.
