# Data model

The tables are designed for Postgres on Supabase. This is a draft: the first migration in M1 should create this schema. The design keeps a person's identity (member or guest) separate from each parking visit, so history builds up across Sundays.

```sql
create type staff_role   as enum ('attendant', 'coordinator', 'admin');
create type visit_status as enum ('parked', 'released', 'missed');
create type release_method as enum ('scan', 'search', 'sweep', 'midnight');

create table areas (
  id        smallserial primary key,
  name      text not null,                 -- 'Car Park 1'
  slug      text not null unique,          -- 'cp1', used in the QR URL /c/cp1
  active    boolean not null default true,
  sort      smallint not null default 0
);

create table services (
  id         smallserial primary key,
  name       text not null,                -- 'Service 1'
  weekday    smallint not null default 0,  -- 0 = Sunday
  starts_at  time not null,                -- Africa/Lagos local time
  ends_at    time not null,
  active     boolean not null default true
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null unique,      -- E.164, e.g. +2348031234567
  pin_hash      text not null,             -- argon2id
  failed_pins   smallint not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

create table guests (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text not null,
  member_id   uuid references members(id), -- set when the guest becomes a member
  created_at  timestamptz not null default now()
);

create table vehicles (
  id      uuid primary key default gen_random_uuid(),
  plate   text not null unique,            -- normalised: 'PHC234AB'
  colour  text,
  make    text
);

-- A plate saved here is locked to members (rule R-5)
create table member_vehicles (
  member_id   uuid not null references members(id) on delete cascade,
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  primary key (member_id, vehicle_id)
);

create table staff (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  phone          text not null unique,
  password_hash  text not null,
  role           staff_role not null default 'attendant',
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table visits (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null,           -- 'PK-7Q4M'
  pass_token      text not null unique,    -- 128-bit random, base64url
  vehicle_id      uuid not null references vehicles(id),
  member_id       uuid references members(id),
  guest_id        uuid references guests(id),
  service_id      smallint not null references services(id),
  area_id         smallint not null references areas(id),
  service_date    date not null,           -- Africa/Lagos date
  status          visit_status not null default 'parked',
  checked_in_at   timestamptz not null default now(),
  checked_in_by   uuid references staff(id),  -- null when the driver checked in
  released_at     timestamptz,
  released_by     uuid references staff(id),
  release_method  release_method,
  check (num_nonnulls(member_id, guest_id) = 1),
  unique (service_date, reference)
);

-- R-2 and R-4: one open visit per vehicle. Enforced here, not only in code.
create unique index one_open_visit_per_vehicle
  on visits (vehicle_id) where status = 'parked';

create index visits_dashboard on visits (service_date, service_id, area_id, status);

create table alerts (
  id          bigserial primary key,
  kind        text not null,               -- 'plate_conflict' | 'member_plate_claim' | 'no_match'
  visit_id    uuid references visits(id),
  plate       text,
  detail      jsonb,
  created_at  timestamptz not null default now(),
  resolved_by uuid references staff(id),
  resolved_at timestamptz
);

create table audit_events (
  id          bigserial primary key,
  staff_id    uuid references staff(id),
  visit_id    uuid references visits(id),
  action      text not null,               -- 'release' | 'reopen' | 'change_area' | 'reveal_phone' | ...
  reason      text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
```

## Seed data

- **Areas:** Car Park 1 (`cp1`), Car Park 2 (`cp2`), Roadside (`road`)
- **Services:** Service 1 07:30–09:30, Service 2 09:30–11:30, Service 3 11:30–13:30. All on Sunday.
- **Staff:** one admin (the parking lead), with credentials from environment variables. Never commit credentials.
- **Sample data:** test members, guests and visits for local development only. Use obviously fake numbers such as `+2340000000001`.

## Notes

- **Reference format:** `PK-` followed by 4 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, which leaves out the look-alikes 0, O, 1 and I. References are unique per service date.
- **Releasing a car:** `update visits set status='released', ... where id=$1 and status='parked' returning *`. If no row comes back, someone else already released it (EX-7).
- **Retention job (R-11):** runs daily. Deletes guest visits older than 24 months, then guests with no visits left.
- **Midnight job (R-8):** marks every visit still `parked` from earlier dates as `missed`, with release method `midnight`.

## Added after the first draft

- `visits.held_at`, `visits.held_by`: a visit put on hold by **Does not match**. A held visit cannot be released until a coordinator clears it with a reason (D-18).
- `visits.check_in_key` (unique where set): the one-time key of a check-in attempt, so a repeat of the same attempt returns the same pass (D-26). Only counts as a repeat for 30 minutes.
- Check-in is done by the database functions `claim_guest_visit` and `claim_member_visit` (D-21), not by several separate queries.
- `ops.applied_migrations`: on the church's own server, the list of database changes already applied (D-23).
- `audit_events` also records staff and admin actions that are not about one visit (a role change, a report export, a name or phone change). The Settings screen and each person's recent activity read it.
- Guest data older than 24 months is deleted daily by `delete_expired_guest_data`, run by pg_cron (D-20).
- `release_visit(visit, staff, method, today)` is the single release function. It refuses a held visit, a visit from another day and a visit already released. `hold_visit`, `clear_hold` and `correct_visit` (change car park, undo a release and so on) keep the audit row in the same transaction.
- Production data starts with only the car parks and the three Sunday services (`deploy/db/seed-production.sql` in the private repository). There is no sample data in production.
- `app_settings` (key, value, updated_at, updated_by): the settings an admin can change (church name, campus, system name, default search tab, staff session length). Read with the server key only, with row-level security on and no public access (D-36).
