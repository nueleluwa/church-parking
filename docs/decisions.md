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
