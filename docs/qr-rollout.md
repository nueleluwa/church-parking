# Phone check-in: rollout, rollback and support

For the parking lead and whoever looks after the server. It covers the QR check-in and exit sign built on the `refactor/qr-checkin-checkout` branch (decision D-43; the requirements are in `docs/church-parking-refactor-docs/`). Nothing here has been done on the live server yet.

## What it is, in one paragraph

At a car park that uses phone check-in, a member scans the check-in sign, types their phone number, and confirms the car registered to it. The server makes the visit and gives that phone a check-out code (a cookie only that phone holds). When they leave they scan the **exit sign** and are checked out with no typing. The attendant's scan and release still work at every car park and can step in whenever a member has a problem. Whichever closes the visit first wins.

It is **off** until the server setting `QR_SESSION_FLOW` says otherwise, so deploying this changes nothing for anyone by itself.

## Before it goes anywhere near the live server

Do these in order. Do not skip the first two.

1. **Check the live data on a copy.** Restore the latest backup into a scratch database (the restore steps are in `deploy/README.md`) and run `psql "<scratch database>" -X -f scripts/qr-refactor-data-checks.sql`. Read every line:
   - **D1 must be 0.** It counts members with more than one open visit; the deploy stops with a message if it is not. If it is not 0, close the extra visits first.
   - **D2** is members with a non-Nigerian number. They cannot use phone check-in and will be sent to staff.
   - **D5** is members with no saved car. They also get "see parking staff" until a car is added.
   - **D8** is every active member. **All of them become able to check in with only a phone number**, and their PIN no longer protects anything. Decide whether to review or switch off members who should not park before you turn it on.
2. **Make sure a backup exists** and the restore has been practised recently (`deploy/README.md`). The deploy takes one before it changes the database.
3. **Know what the deploy changes.** Merging the branch to `main` runs these database changes before the new version starts, each in its own transaction. All are additive; the rollback for each is in the file.

   | File | What it does |
   |---|---|
   | `20261019000000_member_phone_local` | Adds `members.phone_local` (computed from the phone number) |
   | `20261019010000_member_pin_optional` | A member no longer needs a PIN |
   | `20261019020000_visit_credential` | Adds the check-out code columns to visits |
   | `20261019030000_check_in_with_credential` | The phone check-in function |
   | `20261019040000_release_method_self` | Two new ways a visit can end (`self`, `staff_close`) |
   | `20261019050000_checkout_with_credential` | The exit-sign function |
   | `20261020000000_one_open_visit_per_member` | A member has at most one open visit (stops with a message if one already has two) |
   | `20261020010000_staff_close_visit` | Staff close a visit with a reason |

   A push to `main` deploys. The server holds a deploy while a service is on (D-28), so merge at a quiet time anyway, and when nothing is parked.
4. **Test on real phones** (checklist at the end). The automated tests use a desktop browser's phone mode; they cannot tell you how iPhone Safari, Android Chrome, or a QR scanner built into another app treat the cookie.

## Turning it on for one car park (the pilot)

1. Print the **check-in sign** (already in use) and the new **exit sign** for the pilot car park: Settings, QR signs, open the car park's sign, **Exit sign** tab, print. Put the exit sign where drivers leave.
2. Brief the attendants (see "Staff cheat sheet").
3. On the server, outside a service, edit `/srv/church-parking/shared/.env.production.local` and add:

   ```
   QR_SESSION_FLOW=pilot
   QR_SESSION_AREAS=road
   ```

   Use the car park's address (the part after `/c/` on its sign), not its name. Several can be listed, separated by commas.
4. Restart the app so it reads the file: `sudo -iu deploy pm2 restart church-parking --update-env`.
5. Check it: open the pilot car park's check-in sign. It should ask for a phone number, not offer "Continue as guest". Another car park's sign should look exactly as before. Check in with a test member, then scan the exit sign.

## While it runs

- **Numbers.** `psql "$DATABASE_URL" -X -f scripts/qr-pilot-metrics.sql` prints: checkouts by method (`self` is the exit sign, `scan` and `search` are the attendant, `staff_close` is a closure with a reason), phone check-ins and how many had their code replaced, closures by staff, and visits open over 12 hours.
- **Reports.** In Reports, Alerts and exceptions: **Check-out code replaced more than once** lists visits where someone re-checked in repeatedly. It can mean someone is checking in with a member's number. The audit log has an entry for every check-in and every replacement.
- **Flags.** A visit open for 12 hours or more shows a flag on Visits, the visit page and the Sweep. Nothing is closed because of it.
- **What the app does not measure:** how long check-in takes for a member, and how many tries fail and why. Ask the attendants, and look at `sudo -iu deploy pm2 logs church-parking`.
- **Limits that can bite:** a phone number gets 5 tries in 10 minutes and one address 10 lookups a minute (exit: 30 a minute). Many members on one mobile network can reach the address limit. The numbers are rows in the `app_settings` table (`lookup_ip_per_minute`, `lookup_phone_max`, `lookup_phone_minutes`, `reissue_max`, `reissue_minutes`, `credential_hours`, `long_session_hours`); a value outside its allowed range is ignored.

## If something is wrong: switching it off

1. Set `QR_SESSION_FLOW=off` (or delete the two lines) in `/srv/church-parking/shared/.env.production.local`.
2. `sudo -iu deploy pm2 restart church-parking --update-env`.

Every car park goes back to the original check-in at once. Visits already made by phone stay valid: the attendant's pass scan still releases them. **The database does not need to be changed back.** If the new version itself must be removed, use Actions, Run workflow with an older commit's id (`deploy/README.md`). The database changes stay, and the previous version works with them: a member's second car is refused by the original check-in with a general "see an attendant" message, and a visit closed with the exit sign shows as released (its reports label may be blank in the older version).

If a database change itself must be undone, restore the pre-change backup (`deploy/README.md`) and use the rollback note in the migration file.

## Switching it on for every car park

Set `QR_SESSION_FLOW=on` (the area list is then ignored) and restart. Besides what the pilot does, this:

- closes public sign-up: the page and the action say accounts are added by the parking team, and the home page drops the sign-up block;
- has no guest check-in anywhere: a driver who is not a member goes to staff, who add them at **More, Add Member**.

The PIN sign-in, passes and the attendant's tools are not removed.

## Staff cheat sheet

- **Member not found (unknown number, no car saved, switched off):** the member sees "please see parking staff". Look them up at **More, Add Member** (type their number or plate and **Check**). If they are not there, add them. If they are, check their car, number and status (an administrator fixes those).
- **Member cannot check out:** release the car as usual after checking the plate. If the car has already gone, open the pass and use **The member cannot check out? Close their visit**, and write why.
- **Scan card says "The member checked out with the exit sign":** do not release again.
- **Member checked in on another phone or browser:** they can scan the check-in sign again and confirm their car. That moves the check-out code to the phone they are holding and stops the old one. It does not change their check-in time.
- **Member is told "You are already checked in at another car park":** they must check out there, or staff close that visit.
- **Car on hold ("Does not match"):** the exit sign will not release it. The coordinator clears the hold.

## Real-device checklist (to do before the pilot)

On at least one iPhone (Safari) and one Android phone (Chrome), over mobile data, with the real printed signs:

1. Scan the check-in sign with the **camera app**. Check in. Confirm the pass shows.
2. Scan the exit sign with the **camera app** on the same phone. Confirm it checks out.
3. Repeat, but scan with a **QR scanner inside another app** (a chat app's, a bank app's). Expect the check-out to say it cannot find the check-in, because that scanner's browser has no cookie. Note what it shows and that scanning the check-in sign again fixes it.
4. Check in on one phone, then check in again on a second phone with the same number. Confirm the second can check out and the first now cannot.
5. Check in, **close the browser tab and wait ten minutes**, scan the exit sign. Repeat after restarting the phone.
6. Check in in a **private tab**, scan the exit sign in the same private tab, then in a normal tab. Note the behaviour.
7. Switch the phone to airplane mode just before scanning the exit sign. Confirm it says it is **not** checked out and offers Try again. Turn the network on and try again.
8. Scan the exit sign of a different car park. Confirm it refuses and does not lose the code.
9. Check the signs scan from about 1.5 m in daylight.
10. Time check-in and check-out from scan to confirmation. The target is about 2 seconds after the request reaches the server. (Measured from a development machine, the database part alone took about 0.25 s at the median and under 0.4 s at the slowest.)

Write down anything that does not work as described, with the phone and browser, before the pilot starts.

## Things to know

- **Accepted risk.** Check-in needs only a phone number. Anyone who knows a member's number can check in as them, or take over that member's check-out code by checking in again at the same car park. The member can then check in again to take it back, or see staff. The limits, the audit rows and the replacement report are the mitigation (D-43, security T-8).
- **Retention.** The documents suggest keeping visits and the audit log for 12 months. The app does not delete them: member visits and the audit log are kept until someone decides, and guest records are deleted after 24 months as before. Decide before production.
- **Time.** Stored in UTC, shown in Lagos time. The midnight close still closes any visit left open at the end of the day; the exit page says so if a member scans after that.
- **Cookies.** A different browser, a QR scanner inside another app, private mode, or cleared site data will not have the code. Scanning the check-in sign again is the fix.
