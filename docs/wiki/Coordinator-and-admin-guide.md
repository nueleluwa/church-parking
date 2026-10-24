# Coordinator and admin guide

The full screen-by-screen guide is `docs/admin-guide.md` in the repository.

## Coordinator

- **Live Board** (`/staff/dashboard`): cars checked in, left and still parked per car park, cars parked right now (longest first), and alerts. It refreshes every few seconds without reloading.
- **Alerts:** a held car, a blocked second check-in, a plate claimed under a member, a missed check-out. **Investigate** opens the visit; **Mark as dealt with** clears it.
- **Sweep** (`/staff/sweep`): about 30 minutes after a service ends, mark each car still recorded as parked **Still here** (it carries over) or **Gone** (closed as missed, never a release).
- **Corrections** need a reason and are logged with who made them.

## Admin

- **Users:** members and staff together. Add, edit, switch off or on, set a PIN or password, delete one or many after a confirmation. An account with history cannot be deleted.
- **Settings:** services, parking areas, QR signs (check-in and exit signs), vehicle rules, notifications.
- **Reports:** choose dates and a service, then download one CSV, one Excel workbook with every report, or a designed PDF with charts. Downloads are logged and contain no names or phone numbers.
- Results appear as toasts, and every change is written to the audit log.
