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
