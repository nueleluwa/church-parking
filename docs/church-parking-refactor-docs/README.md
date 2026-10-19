# Church Parking MVP Refactor Pack

This pack documents the agreed refactor of an existing church-parking MVP. It is intentionally implementation-aware but framework-neutral because the current repository and technology stack have not been inspected.

**Context:** this is a church parking system. "Members" are registered church members who park at church locations (campuses/lots).

## Documents
1. `SRS.md` — software requirements specification.
2. `BLUEPRINT.md` — product, workflow, component and data blueprint.
3. `USER_STORIES.md` — user stories and acceptance criteria.
4. `AGENT.md` — instructions for coding agents working in this repository.
5. `ADR-001-session-token-checkout.md` — decision record for QR and session-token checkout.
6. `IMPLEMENTATION_PLAN.md` — phased refactor plan, epics, dependencies and testing.
7. `ARCHITECTURE.md` — required architecture documentation and target architecture guidance.

## Non-negotiable product decisions
- This is a **refactor of an existing MVP**, not a greenfield rebuild.
- Members are pre-registered by an administrator with a phone number and vehicle plate number.
- An unregistered person must be directed to parking staff for registration; there is no public self-registration.
- Check-in and check-out use separate, fixed QR codes associated with a parking location.
- At check-in, the member enters their registered phone number and confirms the registered vehicle.
- No OTP or extra verification at check-in. Phone numbers use local format (08012345678).
- The server creates a parking session and a secure session credential, set as a `HttpOnly; Secure; SameSite=Lax` cookie.
- At checkout, the member scans the fixed checkout QR code on the same phone/browser. The page uses the retained credential to close the active session without asking for the phone number again.
- If the credential is missing or unusable, nothing closes. The member re-scans the check-in QR to restore the session (credential reissue), or staff close it. Do not silently fail or claim checkout succeeded.
- Policy values (lifetimes, limits, one active session per member) are in `SRS.md` §11.
- Check-in and check-out state changes are server-authoritative, validated, auditable and idempotent.

## How to use this pack
Place these files in the repository (normally at the repository root), review the current implementation, then adapt names, routes, database terminology, commands and stack-specific details to match the actual codebase before coding. Do not replace working functionality merely to match this document; reconcile the requirements with the existing implementation and record material deviations.
