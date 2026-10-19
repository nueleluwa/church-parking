# Software Requirements Specification (SRS)
## Church Parking MVP Refactor

**Status:** Draft baseline for implementation  
**Scope:** Refactor existing MVP  
**Version:** 1.0

## 1. Purpose

Specify the required behaviour for a church parking system that supports administrator-led member registration and fast QR-based parking check-in/check-out. This document is the product and acceptance baseline for the refactor.

## 2. Product overview

The system is a mobile-first web application with:
- An administrator interface for member, vehicle, location, staff and reporting management.
- A restricted staff interface for registering unregistered arrivals and resolving exceptions.
- Public mobile web pages reached through location-specific check-in and check-out QR codes.
- A server-side record of each parking session.

Members do not need to install a mobile app. Normal checkout should not require re-entering their phone number when the same browser retains the session credential.

## 3. Actors and roles

### 3.1 Administrator
May manage members, vehicles, locations and QR codes; manage staff access; inspect sessions and audit logs; and export permitted reports.

### 3.2 Parking staff
May look up members, register an unregistered arrival, update permitted member/vehicle details, and assist with failed check-in/check-out. Staff permissions must not automatically include full administrator access.

### 3.3 Member
May check in using their registered phone number and confirm their vehicle. May check out by scanning the checkout QR code using the same phone/browser where the session credential is available.

### 3.4 System
Validates all state transitions, creates session credentials, records timestamps, prevents duplicate active sessions, and produces audit events.

## 4. Assumptions and constraints

- The current MVP and its stack are retained unless repository inspection shows a compelling reason to change them.
- One primary vehicle per member is the initial product assumption. The data model should not make future multiple-vehicle support unnecessarily difficult.
- Phone numbers use Nigerian local format (11 digits starting with 0, e.g. `08012345678`, no country code). Input with `+234`/`234`, spaces or dashes is converted to this format before matching.
- No OTP or other extra verification is required at check-in (product decision, see §11). Pre-registration plus phone lookup and plate confirmation is the intended experience.
- Plate numbers are normalized for matching while preserving a display form.
- QR codes identify a parking location and action; they do not contain member personal information.
- The server is authoritative for session state and timestamps.
- The system requires network access to complete check-in/check-out. A network failure must not be represented as success.
- Time is stored in UTC or another consistent server-side standard and displayed in the configured local timezone.

## 5. Functional requirements

### FR-01 — Administrator-led member registration
The system shall allow authorized administrators to create a member using a phone number and vehicle plate number. Required fields must be validated before saving.

### FR-02 — Staff-assisted registration
The system shall allow authorized parking staff to register an unregistered arrival through a restricted workflow. Public visitors shall not be able to self-register directly from the QR flow.

### FR-03 — Member and vehicle search
Authorized users shall be able to search members by normalized phone number and vehicles by normalized plate number, subject to role permissions.

### FR-04 — Member status
The system shall support active and inactive member states. Only active and otherwise eligible members may check in.

### FR-05 — Location management
Administrators shall be able to create, update, activate and deactivate parking locations.

### FR-06 — Action-specific QR codes
Each active parking location shall have a fixed check-in QR URL and a separate fixed check-out QR URL. Each URL shall identify the intended action and location. QR tokens shall not expose personal data or internal sequential database IDs.

### FR-07 — Check-in lookup
The check-in page shall accept a phone number in local format, normalize it, and look up an eligible pre-registered member. An unknown number shall be directed to parking staff; no public account shall be created.

### FR-08 — Vehicle confirmation
After successful member lookup, the system shall display the registered vehicle plate number and require the member to confirm it before check-in.

### FR-09 — Session creation
After successful validation and confirmation, the server shall create a parking session with member, vehicle, location, check-in timestamp and active status. The operation shall be transactional and protected against duplicate active sessions.

### FR-10 — Session credential issuance
After successful check-in, the server shall issue a cryptographically secure, unguessable session credential for browser-based checkout. The credential shall be distinct from a database primary key. Where feasible, only a hash of the credential shall be stored server-side.

### FR-11 — Browser persistence
The server shall deliver the session credential as a `HttpOnly; Secure; SameSite=Lax` cookie scoped to the parking paths, with a lifetime of 24 hours or until checkout, whichever is first. Client script shall not read or store the credential. The implementation shall document limitations (a different browser, an in-app scanner browser, cleared cookies or private mode will not have the cookie). Credentials shall not be placed in analytics, logs, or unrelated URLs.

### FR-12 — Automatic checkout
Opening the checkout QR page shall submit a checkout request as an HTTP POST from the page (never a state-changing GET, so link previews and prefetching cannot trigger it); the browser sends the credential cookie automatically, and the server shall check the `Origin` header. The server shall verify the credential, active session, location and eligibility rules, then atomically close the session and record a checkout timestamp. The normal path shall not ask the member to re-enter their phone number.

### FR-13 — Checkout fallback
If the credential is absent, invalid, expired or replaced, the checkout page shall close nothing and shall tell the member to either scan the location's check-in QR again to restore their session (FR-21) or ask parking staff. The checkout endpoint shall never accept a phone number. Staff closure (FR-17) is the final recovery path. No OTP is used.

### FR-14 — Location and action enforcement
A check-in credential/action shall not be usable to check out, and a checkout request shall not create a session. A session shall only be closed at an authorized location under the configured parking policy.

### FR-15 — Idempotency and concurrency
Repeated requests or repeated QR scans shall not create duplicate sessions or corrupt state. Repeating checkout for an already closed session shall return a safe, understandable response without applying a second state transition. Concurrent requests shall be handled safely.

### FR-16 — Session history
The system shall preserve completed sessions and expose permitted search/filter functions for member, plate, location, status and time range.

### FR-17 — Staff exception handling
Authorized staff shall be able to resolve failed check-ins and close sessions when operationally necessary. Staff-initiated overrides shall record actor, time, reason and affected session.

### FR-18 — Reporting/export
Authorized users shall be able to view daily check-ins, active sessions and historical records and export relevant records to CSV. Exported data shall be limited to the user's permissions.

### FR-19 — Audit log
The system shall record security- and operations-relevant events including member creation/update/deactivation, staff overrides, QR/location changes, check-in, checkout and failed privileged operations. Do not log raw session credentials or unnecessary personal data.

### FR-20 — Error handling
The UI shall display clear outcomes for invalid input, inactive membership, unknown number, missing credential, inactive location, existing active session, already completed session, and network/server failure.

### FR-21 — Credential reissue on repeat check-in
If a member who already has an `ACTIVE` session at the same location completes check-in again (phone lookup and plate confirmation), the server shall not create a second session. It shall keep the existing session and its original check-in time, invalidate the previous credential, issue a new credential to the current browser, and record an audit event. If the active session is at a different location, check-in shall be blocked with a message to check out first or see staff. Reissue attempts are rate limited.

## 6. Non-functional requirements

### NFR-01 — Mobile usability
QR landing pages shall be responsive and usable on current mainstream mobile browsers, with clear labels, large touch targets and minimal steps.

### NFR-02 — Performance
Under expected pilot load, a successful check-in or checkout should normally complete within 2 seconds after the server receives a valid request, excluding poor network conditions. Validate this target against actual hosting and baseline performance.

### NFR-03 — Security
No OTP is used at check-in (accepted risk, §11). Use HTTPS in production; apply server-side authorization; validate all input; use secure, high-entropy credentials; rate-limit phone lookup and token endpoints; protect against CSRF where applicable; and avoid leaking whether arbitrary phone numbers are registered beyond what is operationally necessary.

### NFR-04 — Privacy
Collect only information needed for parking operations. Restrict access to phone numbers and plate numbers. Define retention and deletion rules consistent with applicable law and business policy.

### NFR-05 — Reliability
Session state changes shall be transactional. The UI shall only show success after confirmed server success. Failed requests must be safe to retry.

### NFR-06 — Maintainability
Follow existing repository conventions and architecture. Keep business rules in a server-side service/domain layer rather than duplicating them across controllers and UI components.

### NFR-07 — Observability
Log correlation/request IDs and safe error context. Never log raw session tokens, passwords, OTPs or unnecessary full personal data.

### NFR-08 — Accessibility
Forms and status messages shall support keyboard use, screen readers, readable contrast and accessible validation feedback.

## 7. Core business rules

1. Only an administrator or authorized staff member can register a member.
2. Unknown phone numbers are directed to parking staff.
3. A member must be active and eligible for the location to check in.
4. A vehicle must be associated with the member and confirmed before session creation.
5. A session has exactly one check-in timestamp and at most one checkout timestamp.
6. An active session has no checkout timestamp; a completed session has one.
7. The server is authoritative for all timestamps and status changes.
8. The normal checkout path uses the browser-held credential, not repeated phone entry.
9. A session credential is a bearer secret and must be protected as such.
10. A fixed checkout QR identifies the location/action, not the individual session.
11. A session token alone must not permit checkout at an unauthorized location.
12. A member may have at most one active session across all locations.
13. Manual overrides require an authorized actor and reason.
14. Do not silently expire sessions unless an explicit policy is approved and implemented.
15. Repeat check-in at the same location reissues the credential for the existing session; it never creates a second session (FR-21).
16. Checkout never accepts a phone number as authorization.

## 8. Data requirements

Minimum logical entities:
- Member: ID, normalized phone, display phone, status, created/updated timestamps.
- Vehicle: ID, member ID, normalized plate, display plate, status.
- Location: ID, name, status, opaque QR identifier/token, configured timezone/policy.
- ParkingSession: ID, member ID, vehicle ID, location ID, status, check-in timestamp, checkout timestamp, credential hash/reference, created/updated timestamps.
- StaffUser: ID, identity/login, role, status.
- AuditEvent: actor, action, entity type/ID, reason/context, timestamp, request/correlation ID.

Adapt this to existing tables and naming after repository inspection; avoid duplicate parallel models without a migration plan.

## 9. Acceptance criteria

The release is acceptable when:
- Admins can register and edit members and vehicles.
- Staff can register unknown arrivals, but public visitors cannot self-register.
- QR codes route to the correct action and location.
- A valid member can check in after phone lookup and plate confirmation.
- The system creates a server-side session and secure browser checkout credential.
- Scanning the checkout QR on the same phone/browser closes the active session without re-entering the phone number.
- Missing-token fallback is clear and does not bypass authorization.
- Duplicate/concurrent requests do not corrupt session state.
- Admin/staff permissions and audit records work.
- Session history and CSV export work under permissions.
- Automated tests cover the main flow, exceptions, authorization and concurrency/idempotency.
- Existing unrelated MVP functionality remains intact.

## 10. Out of scope unless already required by the product

Native mobile apps, payments, reservations, parking-space allocation, number-plate recognition, loyalty programs, marketing automation, and complex subscription tiers.

## 11. Decision log and policy values

Decisions made 2026-10-18. All numeric values are configuration, not code constants.

| Topic | Decision |
|---|---|
| Check-in verification | None beyond phone lookup and plate confirmation. Accepted risk: someone who knows a member's number can check in as them, and can take over that member's session credential via FR-21. Impact is low (parking benefit), but monitor audit events for reissues. |
| Recovery | Re-check-in at the same location (FR-21), otherwise staff closure with a reason. No OTP, no phone-only checkout. |
| Credential storage | Server-set `HttpOnly; Secure; SameSite=Lax` cookie, path-scoped. No `localStorage`. |
| Credential lifetime | 24 hours or until checkout. |
| Long-session flag | Sessions open over 12 hours are flagged in admin and staff views. Nothing is auto-closed. |
| Active sessions | One per member across all locations. |
| Location eligibility | Every active member is eligible at every location for the MVP; per-location assignment is a later change. |
| Wrong-location checkout | Rejected; member is told to see staff. |
| Phone format | Local, 11 digits starting with 0. |
| Rate limits (starting values) | 10 phone lookups per minute per IP, plus a lower per-phone limit; reissue attempts limited per phone. |
| Time | Stored in UTC, displayed in Africa/Lagos. |
| Retention | Proposed 12 months for sessions and audit events; confirm before production. |
