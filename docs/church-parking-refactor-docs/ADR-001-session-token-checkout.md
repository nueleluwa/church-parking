# ADR-001: Browser-held Session Credential for QR Checkout

- **Status:** Accepted for MVP, subject to repository/security review
- **Date:** 2026-10-18
- **Decision owners:** Product owner and implementation team

## Context

Members are pre-registered by an administrator. At arrival, a member scans a fixed check-in QR code for a parking location, enters their registered phone number, and confirms the registered plate number. The system creates a parking session.

At departure, the member should scan a separate fixed checkout QR code using their own phone and should not need to re-enter the phone number during the normal flow. A fixed checkout QR identifies the location/action but cannot identify which member's session should close.

The browser therefore needs to present a session-specific credential created at check-in.

## Decision

1. The server creates a parking session after successful check-in.
2. The server issues a separate, high-entropy, unguessable session credential associated with the active session.
3. The server delivers the credential as a `HttpOnly; Secure; SameSite=Lax` cookie, scoped to the parking paths, valid for 24 hours or until checkout. Client script does not handle it.
4. The checkout QR is fixed per location and contains only an opaque location identifier and checkout action.
5. On scanning the checkout QR, the page reads the retained credential and submits it to the backend.
6. The backend validates the credential, session status, location and policy; atomically closes the session; records the server-side checkout time; audits the event; and revokes/invalidates the credential.
7. If the credential is absent or invalid, nothing is closed. The member can scan the check-in QR again; the server then reissues a new credential for the existing session at the same location (old credential invalidated, audited). Otherwise staff close the session with a reason. The checkout endpoint never accepts a phone number.
8. The checkout operation is idempotent and safe under retries.

## Why this option

- Removes repeat phone entry from the common checkout path.
- Requires no native app and fits the existing mobile-first web MVP.
- Works with a static QR code at each exit.
- Avoids embedding a member/session token in public signage.
- Can be implemented as a focused refactor without introducing a separate identity platform.

## Considered alternatives

### A. Re-enter phone number at every checkout
Rejected as the default because it adds friction and the agreed product goal is automatic checkout after scanning. Not offered at checkout. Recovery is re-check-in (reissue) or staff.

### B. Personal QR code shown to the member at check-in
Not selected for the default flow because it requires the member to retain and present a personal code. It could be added later as a recovery option.

### C. Native mobile app
Rejected for the MVP because it adds installation, distribution and maintenance costs.

### D. Infer session from phone number alone
Rejected because phone number is an identifier, not a strong authorization credential. It risks unauthorized checkout.

## Security considerations

- A normal UUID/database ID is not automatically a secure secret. Use a cryptographically secure random credential with sufficient entropy.
- Store only a hash of the credential server-side when feasible.
- Do not put the credential in the fixed QR code, analytics, URLs, referrer data or logs.
- Use HTTPS and rate limiting.
- Apply expiry/revocation policy; revoke credential on checkout.
- Validate location/action on the server.
- Avoid exposing full phone numbers or plate details before member lookup/authorization.
- Assess browser storage risk. `localStorage` persists across tabs and browser restarts but is accessible to JavaScript on the origin and vulnerable to successful XSS. If the app's architecture supports a safer `HttpOnly`, `Secure`, `SameSite` cookie/session design without undermining the QR flow, evaluate it before implementation. The product requirement is credential persistence on the same browser, not a mandatory storage technology.
- If storage is unavailable, offer controlled recovery. Do not claim success until the server confirms the transaction.

## Consequences

### Positive
- Fast checkout with no repeat phone entry in the normal case.
- Static QR signage can be printed and reused.
- No native app required.

### Negative
- Checkout depends on the same phone/browser retaining the credential.
- Browser storage may be cleared, unavailable in private browsing, or isolated across browsers/devices.
- A bearer credential must be treated as sensitive.
- Fallback and staff procedures remain necessary.

## Operational requirements

- Provide a way for authorized staff to resolve forgotten/missing-token cases with an audit reason.
- Report unusually long active sessions.
- Do not silently auto-close sessions unless a separate approved policy exists.
- Document the selected credential lifetime, storage mechanism, revocation behaviour and recovery verification before release.

## Validation

The decision is validated when automated tests demonstrate:
- Check-in issues a credential only after successful session creation.
- The same browser can retrieve it on checkout.
- Checkout closes the correct active session at the correct location without phone re-entry.
- Missing/invalid credential does not close a session.
- Duplicate checkout is safe.
- Credentials never appear in logs or static QR payloads.

## Amendment 2026-10-18 — decisions on open items

- **No OTP.** Members come for a service; extra steps are rejected. Check-in is phone lookup plus plate confirmation.
- **Accepted risk.** Because check-in needs only a phone number, reissue (decision 7) lets anyone who knows a member's number replace that member's credential. The old browser then cannot check out and the member must re-check-in or see staff. Mitigations: rate limits, audit events for every reissue, and a report of members with repeated reissues.
- **Storage.** Cookie chosen over `localStorage` because it is not readable by script (XSS), is sent automatically, and is generally more durable on iOS Safari than script-written storage. CSRF is handled by `SameSite=Lax` and an `Origin` check on the checkout POST.
- **Limits that remain.** A different browser or an in-app scanner browser will not hold the cookie; reissue covers this. Verify on real iOS and Android devices early.
- **Policy values** are listed in SRS §11.
