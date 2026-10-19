# Church Parking MVP Blueprint

## 1. Product goal

Reduce arrival and departure friction while preserving administrative control over who may park.

**Happy path**
1. Admin pre-registers a member's phone number and plate.
2. Member scans the location's check-in QR.
3. Member enters phone number and confirms the plate.
4. Server creates an active session and issues a secure browser credential.
5. Member later scans the location's separate checkout QR on the same phone/browser.
6. Browser submits the retained credential; server closes the active session.
7. If the credential is missing, nothing closes. The member scans the check-in QR again (phone and plate) to get a replacement credential for the same session, or asks staff.

No OTP is used anywhere. Phone numbers use local format (08012345678).

## 2. Service blueprint

| Stage | Member action | Frontstage UI | Backend action | Failure path |
|---|---|---|---|---|
| Pre-registration | None | Admin/staff form | Validate normalized phone and plate; create member/vehicle | Show validation and duplicate conflicts |
| Arrival | Scan check-in QR | Location-specific check-in page | Resolve active location/action | Inactive/invalid QR message |
| Identify | Enter phone | Phone form | Normalize and look up member | Unknown/inactive → staff |
| Confirm | Confirm plate | Vehicle confirmation | Validate eligibility and session constraints | Existing session, same location → reissue credential; other location → block |
| Start session | Submit confirmation | Success state | Transactionally create session; issue credential | Retry-safe error |
| Persist | Continue to parking | No extra step | Client stores credential securely within browser limitations | Explain if persistence unavailable |
| Departure | Scan checkout QR | Checkout page | Resolve location and checkout action | Invalid/inactive location message |
| Resolve session | No input on happy path | Loading/status UI | Client submits stored credential | Missing/invalid token → fallback |
| Close session | Wait | Success confirmation | Verify active session/location; atomically close; audit | Already closed → safe response |
| Operations | Staff assist as needed | Restricted staff tools | Record staff actions and reasons | Escalate to admin |

## 3. Screen inventory

### Public/member screens
- Check-in landing page: location context, phone input.
- Member/vehicle confirmation: plate display and explicit confirmation.
- Check-in result: active status and brief instructions.
- Checkout landing page: automatically attempts credential-based checkout.
- Checkout result: success, already closed, or actionable fallback.
- Fallback: scan the check-in QR again to restore the session, or see staff; never reveal member data to an unauthenticated arbitrary user.

### Administrator screens
- Overview/dashboard.
- Member directory and member form.
- CSV import with preview, validation and row-level errors.
- Vehicle details (can be integrated into member form for single-vehicle MVP).
- Location management and QR display/download/print.
- Session history and active sessions.
- Staff and role management.
- Audit log and CSV export.

### Staff screens
- Search member/plate.
- Register an unregistered arrival.
- Review active session.
- Resolve failed checkout or other exception with required reason.
- Limited session history.

## 4. Logical components

1. **Web UI:** responsive public QR pages and protected admin/staff pages.
2. **Authentication/authorization:** staff/admin authentication and role checks.
3. **Member service:** registration, normalization, lookup, status.
4. **Location/QR service:** location state, action-specific QR URLs.
5. **Parking session service:** create, resolve, close, idempotency and transition rules.
6. **Session credential service:** generate, hash/store, validate, revoke and expire credentials.
7. **Reporting service:** session queries, dashboard metrics and CSV export.
8. **Audit service:** append-only record of relevant actions.
9. **Persistence layer:** reuse existing database and migration patterns.

Do not implement the above as separate deployable services unless the current architecture already requires it. They may be modules within a monolith.

## 5. Suggested state model

Parking session states:
- `ACTIVE`: check-in recorded; no checkout timestamp.
- `COMPLETED`: checkout recorded; checkout timestamp exists.
- Optional `CANCELLED` or `VOIDED` only if an operational requirement exists; define who can apply it and why.

Allowed transitions:
- No session → `ACTIVE` after successful check-in.
- `ACTIVE` → `COMPLETED` after authorized checkout.
- `COMPLETED` is terminal for normal member actions.
- Staff correction/override is a separately audited operation, not a silent rewrite.

## 6. QR and credential model

- Check-in QR: opaque location identifier + check-in action.
- Check-out QR: opaque location identifier + checkout action.
- QR content is fixed for a location; it does not contain a member's session token.
- Session credential is created at check-in and set by the server as a `HttpOnly; Secure; SameSite=Lax` cookie in the member's browser (24 hours or until checkout).
- Prefer a high-entropy random bearer credential, separate from the session UUID. A UUID can identify the record internally, but should not be treated as a secret merely because it is a UUID.
- Persist only a hash of the bearer credential where feasible.
- Use HTTPS, short/defined credential lifetime, revocation on checkout, rate limits, and redaction from logs.
- Scope the cookie path to the parking routes. Store no member data in the cookie.
- Repeat check-in at the same location reissues the credential and invalidates the old one (audited).
- Checkout credential resolution must verify the requested location and active session. A token from another location must not close the session unless cross-location checkout is explicitly allowed.
- The checkout endpoint never accepts a phone number. Recovery is re-check-in (reissue) or staff closure.

## 7. Core API capabilities

Adapt route style to the existing codebase; these are capability names, not mandatory literal paths:
- Create/update/search member.
- Import member CSV and report validation results.
- Create/update/deactivate location and obtain its QR URLs.
- Resolve member for check-in.
- Create parking session after member/vehicle confirmation.
- Validate or exchange session credential for checkout.
- Close active session at a specified location.
- Search session history and export CSV.
- Staff-assisted registration and audited manual closure.

Use server-side authorization for protected routes. Validate input at the boundary and enforce state rules in a shared domain/service layer.

## 8. Security and privacy guardrails

- Do not expose internal sequential IDs in public QR URLs.
- Do not log phone numbers in full unless necessary; prefer redaction.
- Never log bearer tokens, passwords or OTPs.
- Use CSRF protections where applicable and secure cookie settings if cookies are used.
- Rate-limit phone lookup, token attempts and public endpoints.
- Avoid overly revealing responses that permit phone-number enumeration.
- Audit staff overrides and sensitive administrative changes.
- Keep secrets in environment/configuration management, not source control.
- Define data retention before production rollout.

## 9. Migration and compatibility blueprint

1. Inspect current routes, models, schema, UI, tests and auth.
2. Map existing member, vehicle, location and session fields to the target model.
3. Prefer additive migrations; avoid destructive schema changes in the first refactor pass.
4. Backfill normalized phone/plate fields if needed and identify duplicates before enforcing unique constraints.
5. Preserve existing session history.
6. Add new session credential storage in a migration with a rollback plan.
7. Introduce new routes behind existing conventions; maintain compatibility where reasonable.
8. Test old workflows that are meant to remain supported.
9. Remove obsolete paths only after usage and data migration are verified.

## 10. Pilot success metrics

- Median time from QR scan to successful check-in.
- Median time from checkout QR scan to closed session.
- Percentage of checkouts completed without re-entering phone number.
- Missing/invalid browser credential rate.
- Failed check-in rate by reason.
- Duplicate-session prevention count.
- Staff-assisted registration/checkout count.
- Number of incorrect or disputed session closures.

Policy values and the decision log are in `SRS.md` §11.