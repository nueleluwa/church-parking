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
