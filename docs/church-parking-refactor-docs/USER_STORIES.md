# User Stories — Church Parking MVP Refactor

Stories are grouped by epic. “Must” stories form the initial MVP acceptance baseline.

## Epic 1 — Member and vehicle administration

### US-01: Register a member
**As an administrator,** I want to register a member using their phone number and plate number so that only pre-registered members can use church parking.

**Acceptance criteria**
- Given valid, unused member details, when I save the form, a member and associated vehicle are created.
- Phone and plate values are normalized for matching.
- Required-field and format errors are shown clearly.
- Duplicate phone/plate conflicts are flagged for review rather than silently duplicated.
- Public QR pages do not provide self-registration.

### US-02: Register an unregistered arrival
**As parking staff,** I want to register an unregistered person so that they can use parking after staff-assisted registration.

**Acceptance criteria**
- Staff must be authenticated and authorized.
- Staff can search first to avoid creating a duplicate.
- Staff can create a member and vehicle with required details.
- The action is audited.
- The public check-in page directs unknown numbers to staff.

### US-03: Manage member status
**As an administrator,** I want to activate or deactivate a member so that parking eligibility can be controlled.

**Acceptance criteria**
- Inactive members cannot start a new session.
- Deactivation does not silently delete historical sessions.
- The action is audited.

### US-04: Import members
**As an administrator,** I want to import a CSV file so that I can register many members efficiently.

**Acceptance criteria**
- The system previews rows before committing.
- Invalid and duplicate rows are reported with row numbers and reasons.
- The import can be cancelled before commit.
- Re-running an import does not silently duplicate members.

## Epic 2 — Parking locations and QR codes

### US-05: Manage locations
**As an administrator,** I want to manage parking locations so that each QR code is associated with the correct site.

**Acceptance criteria**
- Authorized administrators can create, edit, activate and deactivate a location.
- Inactive locations cannot start or close sessions through public QR pages.
- Existing history remains available after a location is deactivated.

### US-06: Generate action-specific QR codes
**As an administrator,** I want separate check-in and checkout QR codes for each location so that members can identify the intended action.

**Acceptance criteria**
- Each location has a fixed check-in URL and fixed checkout URL.
- The URLs identify action and location using opaque identifiers.
- No member data or session credential is embedded in the printed QR code.
- Administrators can view/download/print the codes.

## Epic 3 — Check-in

### US-07: Find a pre-registered member
**As a member,** I want to enter my registered phone number after scanning the check-in QR so that the system can identify my membership.

**Acceptance criteria**
- Phone number is normalized to local format (e.g. 08012345678) before lookup; `+234` input is converted.
- Unknown numbers are directed to parking staff.
- Inactive members cannot proceed.
- Responses do not unnecessarily reveal sensitive member information.

### US-08: Confirm my vehicle
**As a member,** I want to see my registered plate number before checking in so that the correct vehicle is associated with my session.

**Acceptance criteria**
- The plate is displayed after a successful eligible lookup.
- The member must explicitly confirm before session creation.
- A wrong plate or changed vehicle is handled through staff-assisted correction.

### US-09: Start a parking session
**As a member,** I want a successful check-in to start a parking session so that my arrival is recorded.

**Acceptance criteria**
- Session stores member, vehicle, location and server-side check-in time.
- Session status becomes `ACTIVE`.
- Duplicate or concurrent requests do not create multiple active sessions contrary to policy.
- Success is displayed only after the server confirms the transaction.

### US-10: Retain checkout credential
**As a member,** I want my browser to remember the active session credential so that I do not need to enter my phone number again at checkout.

**Acceptance criteria**
- Credential is issued only after successful check-in.
- Credential is delivered as a `HttpOnly; Secure; SameSite=Lax` cookie with a 24-hour or until-checkout lifetime.
- Credential is not exposed in analytics or logs.
- If persistence fails or the credential is missing, a clear fallback is available.

## Epic 4 — Checkout

### US-11: Check out by scanning a QR code
**As a member,** I want to scan the checkout QR code on the same phone/browser so that my active session can close without repeating phone entry.

**Acceptance criteria**
- Opening the checkout page sends a POST (never a GET) with the location context; the browser attaches the credential cookie.
- Backend validates credential, session state, location and policy.
- Session is closed atomically and checkout time is recorded.
- UI reports success only after server confirmation.
- Credential is cleared/revoked after successful checkout.

### US-12: Recover when the credential is missing
**As a member,** I want an alternative when browser storage is unavailable so that I can still leave without being stuck.

**Acceptance criteria**
- Missing/invalid credential produces an actionable message.
- The message tells the member to scan the check-in QR again to restore the session, or ask staff.
- The checkout endpoint never accepts a phone number.
- Staff can close the session with a reason (US-15).
- No session is closed on a failed verification.

### US-13: Handle repeated checkout scans
**As a member,** I want repeated scans to produce a clear result so that I know whether checkout completed.

**Acceptance criteria**
- A completed session is not closed twice.
- Repeated requests return a safe “already checked out” or equivalent result.
- Concurrent checkout requests do not corrupt timestamps or audit history.

### US-14: Enforce location policy
**As the parking operator,** I want checkout validated against the QR location so that sessions cannot be closed at an unauthorized site.

**Acceptance criteria**
- The backend verifies the checkout location against the session and configured policy.
- A location mismatch does not close the session.
- Any permitted cross-location checkout is an explicit configuration, not an implicit assumption.

## Epic 5 — Staff operations and audit

### US-15: Manually close a session
**As authorized parking staff,** I want to close a session when a member cannot use the QR flow so that operations can continue.

**Acceptance criteria**
- Staff authentication and permission are required.
- A reason is mandatory.
- The actor, timestamp, session and reason are audited.
- The system prevents closing a session that is already completed without an explicit correction workflow.

### US-16: Review active sessions
**As an administrator,** I want to see active sessions so that I can identify vehicles that may have forgotten to check out.

**Acceptance criteria**
- Active sessions can be filtered by location and duration.
- Sessions open longer than 12 hours (configurable) are flagged.
- No session is automatically closed unless a defined policy enables it.
- Any manual closure is auditable.

### US-17: Search and export history
**As an administrator,** I want to search and export session history so that I can reconcile parking activity.

**Acceptance criteria**
- Filters include date range, location, status, phone/member and plate, subject to permissions.
- Export respects filters and role permissions.
- Export does not include session credentials.

## Epic 6 — Quality, security and migration

### US-18: Preserve existing MVP functionality
**As the product owner,** I want the refactor to preserve unrelated working features so that the change does not cause regressions.

**Acceptance criteria**
- Existing functionality is inventoried before changes.
- Regression tests cover supported existing flows.
- Database changes include migration and rollback notes.
- Unrelated rewrites are avoided.

### US-19: Audit sensitive actions
**As an administrator,** I want sensitive operations recorded so that I can investigate errors and misuse.

**Acceptance criteria**
- Registration, status changes, QR/location changes, check-in, checkout and staff overrides are audited.
- Raw credentials and secrets are never written to audit logs.
- Audit access is restricted.

### US-20: Handle network failures safely
**As a member,** I want clear feedback when the network fails so that I do not assume an unrecorded check-in or checkout succeeded.

**Acceptance criteria**
- Failure is clearly distinguished from success.
- Retrying is safe and does not duplicate transitions.
- The UI preserves an actionable recovery path.

### US-21: Restore my session on a new browser
**As a member,** I want to scan the check-in QR again if my browser lost my session so that I can still check out without staff.

**Acceptance criteria**
- With an active session at the same location, repeat check-in (phone and plate confirmation) creates no new session.
- The original check-in time and session are kept; the previous credential stops working; a new credential is set in this browser.
- The old browser's checkout attempt is refused with a message to re-check-in or see staff.
- With an active session at a different location, check-in is blocked with a clear message.
- Each reissue is audited and rate limited.

## Definition of done
A story is done when implementation follows existing repository conventions, automated tests cover acceptance criteria, authorization and validation are enforced server-side, relevant docs are updated, migrations are reversible where practical, and regression checks pass.
