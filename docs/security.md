# Security

The app replaces a physical security check: the paper tally that stops a car leaving without its owner. Treat every rule below as a requirement, not a suggestion.

## Threats

| # | Threat | Defence | Remaining risk |
|---|---|---|---|
| T-1 | A thief registers a parked car's plate on their own phone, gets a valid pass and drives out. | First claim wins (R-4). Member plates are locked (R-5). For guest passes, the attendant checks the driver's name and phone number at release. | If the owner never registered, the thief can claim the car first. The sweep and unregistered-car reports reduce this risk but don't remove it. Encourage regular drivers to become members. |
| T-2 | Someone reuses an old pass screenshot. | Passes are valid only on the day they were issued (R-7). A released visit can't be released again (R-6). | None known. |
| T-3 | Someone guesses a pass URL. | Tokens are 128-bit random values. The public pass view shows only plate and status. | None known. |
| T-4 | Someone guesses a member's PIN. | 5 failures pause sign-in for 15 minutes. 15 failures in a day lock the account until an admin resets it. Limits apply per phone number and per IP address. PINs are hashed with argon2id. | Low: a 4-digit PIN is weak, but the account controls little. Releasing a car always needs staff. |
| T-5 | Someone misuses a staff account. | Each person has their own account. Sessions last 12 hours. Every action is audited. Admins can deactivate accounts. | Volunteers might share logins. Cover this in training. |
| T-6 | Personal data leaks. | Phone numbers are masked (R-9). No personal data in URLs, QR codes or logs. Exports are admin only and logged. | Normal care needed. |
| T-7 | Spam registrations. | Rate limits per IP address and per phone number on check-in. | Low. |

## Rules

1. No code path releases a visit except `releaseVisit()` in `lib/rules`. It requires a staff session and updates the visit only `WHERE status = 'parked'`.
2. The browser never receives the Supabase service key, or any key that can read personal data.
3. The pass page (`/p/[token]`) shows name or phone details only to a signed-in staff session.
4. A claim on a plate that already has an open visit never returns or reveals the existing pass.
5. Every change to a visit made by staff writes an `audit_events` row in the same transaction.
6. Never write names, phone numbers, PINs or pass tokens to logs or analytics.
7. Session cookies are `httpOnly`, `Secure` and `SameSite=Lax`, and signed with a key from environment variables.
8. Validate every server input with `zod` before using it.

## Tests that must exist

- A second claim on a plate the same day is rejected, and the response contains no pass token.
- A guest claim on a member's plate is rejected.
- Two releases of the same visit at the same moment: exactly one succeeds.
- A pass from yesterday is rejected at the scanner.
- The public pass view, opened without a staff session, contains no name or phone number.
- PIN lockout starts after 5 failures and the daily lock after 15.

## Member plates and new cars

- A member can save at most 4 cars. This stops one account collecting other people's plates.
- Saving a plate is not proof that the car is theirs, so a car saved in the last 7 days shows **NEW CAR** on the scanner. For a new car, and for every guest, the attendant asks the driver for their name and phone number and checks the last 4 digits on screen.
- Attendants see the last 4 phone digits for every pass, members included.
- A member who is locked out or has no data can still be registered by an attendant with **Register for the member**. The visit is the member's and the attendant is recorded.

## Deployment requirements

- **Client IP.** Rate limits read `x-vercel-forwarded-for`, then `x-real-ip`, then `x-forwarded-for`. On a self-hosted server the reverse proxy in front must set one of them itself and overwrite any value the client sends. With no address the IP limit is skipped, and the phone limits still apply.
- **Logs.** Pass links (`/p/{token}`) hold a secret token. Turn off request-path logging for `/p/*` on the host, or redact the token, so rule 6 holds. Pass pages already send `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Production database.** Use a paid or kept-alive Supabase project: the free tier pauses after about a week without use.
