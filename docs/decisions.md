# Decisions

Each entry records what was decided and why. To change a decision, add a new entry that replaces the old one.

## D-01 Attendants verify every exit
**Decision:** drivers can't check themselves out. An attendant scans the pass, matches the plate and releases the car.
**Why:** the paper tally is the church's protection against car theft. A self-checkout would remove it.

## D-02 Member accounts with phone and PIN, plus guest check-in
**Decision:** regular drivers create an account once. Visitors check in as guests.
**Why:** the church chose member accounts so regular drivers don't retype their details each week. Locking member plates is also the strongest defence against plate hijacking (threat T-1).
**Alternative rejected for v1:** SMS codes, because they cost money per message and can arrive late on busy Sunday mornings.

## D-03 Custom sessions instead of Supabase Auth
**Decision:** sign-in is handled on the server with argon2id hashes and signed httpOnly cookies. All database access runs on the server with the service key.
**Why:** Supabase Auth needs passwords of at least 6 characters and sends codes by SMS for phone sign-in. Neither fits a 4-digit PIN without SMS. Keeping all data access on the server also keeps the security rules in one place.
**Revisit if:** SMS sign-in is added later.

## D-04 First claim on a plate wins
**Decision:** a second claim on a plate that already has an open visit is blocked and sent to the coordinator. It never shows the existing pass.
**Why:** this stops a thief from getting the owner's pass, or a pass of their own, for a car that's already registered.

## D-05 Car counts, not spaces left
**Decision:** the dashboard shows how many cars are in each area. It doesn't show spaces left.
**Why:** the church doesn't have fixed capacity counts.

## D-06 No offline mode
**Decision:** v1 needs an internet connection. If the app is down, staff use paper tallies.
**Why:** internet at the church is reliable, and offline sync would add a lot of work and many ways to fail.

## D-07 Service selected by time, with 30 minutes' lead
**Decision:** check-in picks the next service if it starts within 30 minutes, otherwise the service in progress.
**Why:** services run back to back. With a 60-minute window, a driver arriving at 08:45 for Service 1 would be put in Service 2.

## D-08 Guest records kept for 24 months
**Decision:** chosen by the church.
**Note:** state this period in the privacy notice on the check-in page.

## D-09 No Docker: hosted Supabase for development, PM2 optional for hosting
**Decision:** development uses a free hosted Supabase project, linked through the Supabase CLI. Migrations and seed data go up with `supabase db push` and `supabase db reset --linked`. If the church hosts the app on its own server instead of Vercel, the server runs it with PM2 (`pnpm build`, then `pm2 start "pnpm start" --name church-parking`).
**Why:** the user prefers not to use Docker. Local Supabase needs Docker, and PM2 can't replace it: PM2 keeps Node apps running, it doesn't run a database. Two separate jobs, two tools.
**Rule:** keep production and development in separate Supabase projects. Never run `db reset --linked` against production.

## D-10 Church red and near-black palette, replacing the sage green direction
**Decision:** the colour scheme follows the church's brand: church red (`#B3121B`) as the accent, near-black (`#141414`) for the header, staff tab bar and main buttons, a warm off-white page, white cards, and a pale red tint for the selected state. This replaces the sage-green and soft-yellow direction taken from the style reference (the layout, rounded cards and "P" mark stay).
**Why:** the church asked for red as the accent colour, and the logo's white lettering reads best on a dark background.
**Rules:** main buttons are black, never red, so **Release car** can't be mistaken for a warning. Red is for accents, links, focus and warnings, including **Does not match**. The selected state always has a dark border and a tick, since the tint alone is too faint in sunlight. VALID passes use a solid black banner with white text. `tests/unit/contrast.test.ts` checks every text and background pair against WCAG AA (4.5:1).

## D-11 Status colours: green valid, red invalid, amber pending, grey finished
**Decision:** statuses use one set of colours on every screen, through the `StatusBadge` component. Green means valid or good, red means invalid, expired or an error, amber means pending or processing, and grey means finished with nothing left to do. Every status also has an icon (a tick, a warning triangle or a clock) and words, so it never depends on colour alone. This replaces the line in D-10 that made VALID passes a black banner.
**Why:** the church asked for a green VALID badge and red for anything wrong, which volunteers recognise at a glance.
**Rules:** main buttons stay black and warning actions stay red (D-10). The pale red tint is only for a selected item, never for a status. `tests/unit/contrast.test.ts` checks every status colour pair against WCAG AA.

## D-12 Car park names are editable, and the QR address never changes
**Decision:** an admin can rename a car park at `/admin/areas`. A rename changes only the name shown. The car park keeps its id and its slug, so every visit, record and printed QR sign keeps working. Two car parks cannot share a name (capital letters are ignored). Each rename is written to the audit log with the old and new name.
**Why:** the church's real car parks are not called "Car Park 1", "Car Park 2" and "Roadside", and signs already printed must keep working after a rename.

## D-13 A dev-only test service, switched off outside tests
**Decision:** weekdays have no real service, so development and the automated tests use one row called "Automated test service", open all day on today's weekday. It is switched on by `pnpm dev:test-service on` or by a test run, and off again by `pnpm dev:test-service off` or when the tests finish. It is not part of the seed data and is never created on a real deployment.
**Why:** it was first created by hand with the name "TEST ALL DAY", which then appeared next to car park names on staff screens. A plain name that is hidden when not in use keeps test data out of the live interface.

## D-14 Member check-in is two taps, and cars carry a picture, make and colour
**Decision:** a returning member chooses a car, then taps **Check in**. The service is picked for them by rule R-1 and the car park comes from the QR sign, so neither is a step. A member with one saved car goes straight to the confirmation. The confirmation shows the car's picture, plate, make and colour, the service and the car park. The change-service control only appears when more than one service is open.
**Picture:** every screen that shows a car uses the one supplied illustration (`references/images (2).jpg`), through `VehicleImage` and `VehicleRow`. `scripts/prepare-vehicle-image.mjs` trims its white margin into `public/vehicle-illustration.png`, and the car is never stretched or cropped. It is a visual aid only: the plate and the vehicle record identify a car.
**Make and colour:** members can add an optional "Make and model" and "Colour" to a saved car, stored in the existing `vehicles.make` and `vehicles.colour` columns (there is no separate model column). Guests are never asked for them, so a guest's pass shows the plate only.
**Why:** the member-screen reference showed a three-step flow, but the spec asks for two taps (CI-4) and automatic service choice (CI-2).

## D-15 Guests can save their details as a member account (CI-7, brought forward)
**Decision:** on a guest's own pass, an optional "Save your details" card lets them choose a PIN and become a member. The name, phone number and car they already gave are kept. It works only from the phone that holds the pass, in one database step (`convert_guest_to_member`), and the visit becomes the member's own.
**Why:** the member-screen brief asks guests to be offered this, and the spec lists it as v1.1. It is built, not just shown, so nothing on screen promises something that does not work.

## D-16 Member screens follow the member journey: red main buttons, title headers, tab bar
**Decision:** member-facing screens use the layout of `references/Church Parking Check-In Journey.png`: a title header with a back arrow for Check In, Confirm Check In, Continue as guest and My Account (the logo header stays on the welcome, the pass and the home page), a two-step stepper, selectable car rows with a red radio, a pale-red panel for service and area, a green "checked in" pass card, underline tabs for My Account, and a member tab bar (Home, My Vehicles, History, More). Main buttons on these screens are church red.
**Not changed:** attendant and admin screens keep black main buttons, so **Release car** is never beside a red button that looks the same. Status colours stay as in D-11, so the pass is green when valid.
**Why:** the church preferred the journey's look for members. Red is safe on member screens because nothing there is a risky action.

## D-17 Attendant screens follow the attendant workflow mockup, without entry scanning
**Decision:** attendant screens use `references/Christ Church Parking Workflow Mockup (1).png`: the logo header with the person's initials on the home screen, title headers elsewhere (Scan Pass, Manual Lookup, Recent Scans, Service Information, More), a tab bar (Scan, History, More; coordinators add Live and Sweep, admins add Admin), a scan result card showing the vehicle, driver, service, car park, check-in time, duration and pass status, and **Release car** (black) beside **Does not match** (red, holds the car and alerts the coordinator). Recent Scans and Service Information show real data only.
**Not built:** the mockup's attendant "Scan Entry / Record Entry" is left out, because D-01 has drivers check themselves in and attendants only release exits. A guest's card shows the first name and last four phone digits only, never the full name or number. The torch button and "Contact an attendant" are not built.
**Why:** follows the mockup's look while keeping the spec's rules and privacy limits.

## D-18 Does not match puts the visit on hold
**Decision:** tapping **Does not match** now holds the visit (`visits.held_at`), as well as alerting the coordinator. A held visit cannot be released by anyone: the release function refuses it. A coordinator or admin clears the hold on the scan card with a reason, and the clearing is audited and resolves the alert. Attendants see **On hold** and are told to stay with the car.
**Why:** the audit found that "Car held" was only a message, so a second attendant could release the car. EX-3 only asked for an alert; this goes further to make the check real. The release function also now checks the service date itself (R-7), so the rule no longer relies on application code alone.

## D-19 Admin screens follow the dashboard suite; coordinators and admins get a side menu on wide screens
**Decision:** following `references/Christ Church Parking Dashboard Suite.png`, coordinators and admins get a dark side menu on screens 1024 px and wider (Dashboard, Live Parking, Sweep, Reports, Services, QR Signs, Staff Accounts, Members, Car Parks, Attendant tools). Phones keep the tab bar. The admin overview shows today's four numbers, the car parks and recent activity from real data. Services, QR signs, staff, members and reports are built as MVP requirements AD-1 to AD-4.
**Not built:** Analytics charts and peak times (AD-5, v1.1), a Vehicles browser, Settings, the vehicle visit-details screen and the PDF download of a sign (browser Print, then Save as PDF, does the same).
**Why:** these were either not in the spec or are later releases. Showing them would have meant invented data.

## D-20 Guest data is deleted after 24 months by a daily job
**Decision:** `delete_expired_guest_data` runs daily at 23:45 UTC. It deletes released or closed guest visits older than 24 months, then guests and plates nothing refers to. Open visits are never deleted. Audit rows stay but lose their link to the deleted visit.

## D-21 A check-in is one database call
**Decision:** a guest or member check-in runs in one database function (`claim_guest_visit`, `claim_member_visit`) that does the rate limit, finds or creates the vehicle, closes an old open visit, refuses a plate that is already checked in or belongs to a member, and creates the visit, all in one transaction. The app hands it a few ready-made reference and pass-token pairs in case one is taken. The rules R-2, R-4 and R-5 are unchanged; they are now applied by the database itself.
**Why:** the old way took about ten separate trips to the database. In a like-for-like run (30 check-ins, 5 phones at a time) the time from tapping **Get my pass** to the pass showing fell from a median of 2.9 s to 1.4 s. A refused check-in leaves no stray guest or vehicle behind.

## D-22 Analytics, Vehicles, Visit details and Settings are built from the dashboard design
**Decision:** following the dashboard suite design, the admin has Analytics (check-ins by time of day, car park usage, visit outcomes, peak times, which car park fills first), Vehicles (search by plate, member or guest, visits, latest visit), Visit details (facts, masked driver, a timeline of everything that happened) and Settings (the rules in force, and an activity log). Everything is counted from the visit and audit records. This is AD-5 (trends), brought forward.
**Which car park "fills first":** there are no fixed space counts (D-05), so it is the car park by which half of its day's cars had arrived. An earlier time means it fills first.
**Settings is read-only:** the rules are set in code and recorded here, so the screen shows them and says to ask the developer to change one.
**Vehicles and Visit details never list names or phone numbers.** Visit details shows the first name and last four digits; the full number needs **Show number**, which is logged (R-9).

## D-23 Production runs its own database on the church's server, not on hosted Supabase
**Decision:** on the production server, the database is PostgreSQL 16 in its own cluster, with PostgREST (run by PM2) providing the same web interface the app already uses, and a small local-only nginx door so the app's usual `/rest/v1/` address reaches it. The app code is unchanged. The database listens on 127.0.0.1 only and nothing is exposed to the internet. Database changes are applied by `deploy/db/migrate.sh` from the same `supabase/migrations` files, before each new version starts, with a backup first. Development and the automated tests still use the hosted development Supabase project. This replaces the production part of D-09 ("keep production and development in separate Supabase projects"): production is still kept separate from development, but is no longer hosted by Supabase.
**PM2 and the database:** PM2 runs the app and PostgREST. PostgreSQL itself is a system service, because PM2 keeps Node programs running and cannot manage a database (D-09's reasoning still holds).
**What the church now looks after:** backups (nightly on the server, 14 days kept; a copy off the server still has to be set up), security updates for PostgreSQL, and disk space. There is no hosted dashboard, point-in-time recovery or automatic upgrade.
**Not moved:** the development database's test data. Production starts empty apart from the three car parks and three Sunday services in `deploy/db/seed-production.sql`.

## D-24 The front door: Check in first, the camera second, one car park list for everyone
**Decision:** the home page leads with **Check in**, which opens `/c`, "Where are you parking?", the list of open car parks. Each one opens `/c/<car park>`, the same page its own QR sign opens, so there is one check-in however a driver arrives. **Scan a car park sign** is second, and it is a **separate page** (`/scan`), not part of the list: the list page has no scanner, and the scanner page has no list. The camera only follows our own signs, looked up among the open car parks (nothing hardcoded); another website's code, a sign for a car park that is not in use, and a parking pass each get a plain message and the camera keeps looking, so a car park is never chosen by guess. If the camera will not start the page says why (blocked, none found, in use, not https) with Try again. A recognised sign shows the car park's name, then opens that car park's normal check-in, where the driver reviews name, phone and plate. The member actions on the home page are two equal buttons, Sign in and Create an account. (Amended after mobile testing.) Each car park keeps its own QR sign (car park already chosen, the quickest way in), and a general sign (`/admin/signs/general`) opens the list. The parking team's sign-in is no longer linked from the public home page; the team has its own address, `/staff`, and its own installable app, "Church Parking Team". Team, admin, member and pass pages are marked as not for search engines.
**Naming:** the product is called Church Parking. The live car parks are Domino's (`cp1`), AA (`cp2`) and Roadside (`road`). The addresses stay as they were so printed signs keep working.
**Why:** from the workflow review. Hiding the sign-in link is tidiness, not security: team pages are protected by the server-side role checks and the sign-in limits.

## D-25 A pass belongs to the phone that made it, or to the member who owns it
**Decision:** a phone remembers up to six passes it made (a signed list in one cookie, for one day), so a second car no longer hides the first car's QR. A signed-in member sees the full pass, with its QR, on any phone, because their own account is the proof. A guest who loses the page or the cookie recovers the pass through an **attendant lookup only** (plate, phone or reference); there is no self-service recovery, because anything a thief could also do would weaken the exit check. The pass says so: "Lost this page? The attendant at the exit can find your car by its plate number."

## D-26 A check-in can be repeated safely
**Decision:** each check-in attempt carries a one-time random key, kept in the browser tab for 30 minutes and stored on the visit. If the request reached the server but the answer was lost, trying again with the same key returns the same pass: no second visit, no "already checked in" error, and no false alert to the coordinator. A different key for the same car is a different attempt and is refused exactly as before (R-2, R-4, R-5). The key is a random value only that phone knows, so it cannot be used to read someone else's pass, and after 30 minutes it is forgotten so it can never block a genuine new visit.

## D-27 One exit per car park: attendants say where they stand; a car from elsewhere gets a warning, not a block
**Decision:** each car park has its own exit, so an attendant chooses the car park they are at (kept on that phone for the shift). If the car they scan checked in at a different car park, a clear warning names both and offers the fix. It never stops a release, because a driver who scanned the wrong sign is an honest mistake. **Drivers cannot change their car park after checking in. Any attendant or team lead can**, with one tap ("Move to this car park"), only while the car is still here, and every change is recorded with who made it and why. The coordinator's other corrections are unchanged.

## D-28 No deploys while people are parking
**Decision:** the server refuses to deploy from 30 minutes before any active service starts until 30 minutes after it ends (Lagos time, read from the Services screen). A push in that window is held, not lost; a job that runs every 30 minutes puts the latest version that passed its checks live as soon as the window closes. An emergency deploy can be forced by hand.

## D-29 The admin area is built for desktop as well as phones
**Decision:** coordinators and admins often work at a desk, so the admin screens use the width they have. On a wide screen lists are real tables (Vehicles, Visits, Reports, a member's visits), forms sit beside the list they change (Staff Accounts), and the dashboard puts the car parks beside recent activity. On a phone the same rows are cards, so nobody scrolls sideways. New: **Visits** (every visit by day, car park and status, reached by tapping the dashboard numbers or a car park card), **Vehicles** filters by last visit, **Members** opens a page with the member's cars and visits, **Staff Accounts** shows when each person last did something, and **Reports** and **Analytics** can be limited to one car park (the CSV follows the choice) and Reports can be printed. Drivers' names and phone numbers stay hidden in the lists, as before. The side menu says "Church Parking".

## D-30 The admin screens follow the design reference (second pass)
**Decision:** following `references/Christ Church Parking Dashboard Suite.png` more closely: the dashboard lets you pick the service and shows up or down against the same service last time; **Reports** has four views (Service report, Car park report, Exceptions, Visitor list) under one summary; a **visit** has Details, Timeline and Member / guest tabs and, for a parked car, **Release car** and **Mark as mismatch** (each asks once, and is recorded with who did it); **Services** shows Active, Upcoming or Completed; **Staff Accounts** reads as a table on a wide screen; **QR signs** can be downloaded and printed on A4 or A5; **Members** can be found by name, phone or car plate. Coordinators can open **Visits** (a team lead's "every car here" view, linked from the live board); everything else in the admin area stays admin-only.
**Not done, and why:** drivers' full phone numbers still show on the Members list (an admin needs them to check who someone is before resetting a PIN), where the reference masks them. Names and numbers stay hidden everywhere else in lists.

## D-31 Visits, Staff Accounts, Vehicles and Analytics upgraded
**Decision:** **Visits** has a summary (visits, parked now, released, missed, average stay), search by plate (look-alike characters match), car park, service and status filters, day buttons, sorting, each car's stay, an "On hold" flag and an admin-only CSV export for the day. **Staff Accounts** has a summary by role, search by name or phone, a role filter, editing of a person's name and phone (a number already in use is refused and every change is recorded), and each person's recent activity. **Vehicles** has a summary, filters for type (members or guests), car park and last visit, sorting by last seen, most visits or plate, and paging. **Analytics** adds average stay, missed rate, members' share, check-ins by day, how long cars stay, a service filter and an export link. Names and phone numbers stay out of every list.

## D-32 Live Parking is a calm, text-only board with numbers that add up
**Decision:** following `Live Parking Dashboard Overview.png`: a header with the live status, the service chooser and a Refresh button; four summary numbers; text-only car park cards (checked in, left, still parked); and alert rows with the car, an **Investigate** link and **Mark as dealt with**. Car park cards have no pictures. The mockup's "percent on-site" bar is **not** built, because the church has not set capacities and a share of check-ins could be mistaken for how full a car park is (D-05). **Still parked** now counts every car on site, including any left from an earlier service, so the summary equals the sum of the car park cards (before, the summary left carried-over cars out). Investigate opens the alert's visit, or today's visits for the plate when the alert has none. Alerts are never merged or deleted by the redesign.
**Added to the board's data:** each alert's visit address, the car's make and colour, and each car park's address name (so a card can open its visits). Nothing in the database changed.
