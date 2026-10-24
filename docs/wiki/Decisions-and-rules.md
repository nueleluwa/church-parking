# Decisions and rules

Decisions are recorded with reasons in `docs/decisions.md` (D-01 onward). Do not reopen one without asking.

## Rules behind every flow

- A car has only one open visit at a time, and a member only one.
- The first claim on a plate each day wins; a guest cannot use a plate saved to a member.
- Only staff can release a car, and release is atomic.
- Staff see the last four digits of a phone number unless they tap **Show number** (logged). Admins see full numbers in the Members list.
- Names, phone numbers and the check-out code are never put in addresses, QR codes or logs.
- Member visits and the audit log are kept forever; guest records are deleted after 24 months.
- A service, car park or account with history cannot be deleted.
