-- Church Parking: initial schema (docs/data-model.md)

create type staff_role     as enum ('attendant', 'coordinator', 'admin');
create type visit_status   as enum ('parked', 'released', 'missed');
create type release_method as enum ('scan', 'search', 'sweep', 'midnight');

create table areas (
  id        smallserial primary key,
  name      text not null,
  slug      text not null unique,
  active    boolean not null default true,
  sort      smallint not null default 0
);

create table services (
  id         smallserial primary key,
  name       text not null,
  weekday    smallint not null default 0 check (weekday between 0 and 6),
  starts_at  time not null,
  ends_at    time not null,
  active     boolean not null default true,
  check (ends_at > starts_at)
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null unique,
  pin_hash      text not null,
  failed_pins   smallint not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

create table guests (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text not null,
  member_id   uuid references members(id),
  created_at  timestamptz not null default now()
);

create table vehicles (
  id      uuid primary key default gen_random_uuid(),
  plate   text not null unique check (plate ~ '^[A-Z0-9]+$'),
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
  reference       text not null,
  pass_token      text not null unique,
  vehicle_id      uuid not null references vehicles(id),
  member_id       uuid references members(id),
  guest_id        uuid references guests(id),
  service_id      smallint not null references services(id),
  area_id         smallint not null references areas(id),
  service_date    date not null,
  status          visit_status not null default 'parked',
  checked_in_at   timestamptz not null default now(),
  checked_in_by   uuid references staff(id),
  released_at     timestamptz,
  released_by     uuid references staff(id),
  release_method  release_method,
  check (num_nonnulls(member_id, guest_id) = 1),
  unique (service_date, reference)
);

-- R-2 and R-4: one open visit per vehicle, enforced by the database
create unique index one_open_visit_per_vehicle
  on visits (vehicle_id) where status = 'parked';

create index visits_dashboard on visits (service_date, service_id, area_id, status);

create table alerts (
  id          bigserial primary key,
  kind        text not null,
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
  action      text not null,
  reason      text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- Second layer of protection: RLS on, with no policies. The anon and
-- authenticated roles can read nothing. The server uses the service key,
-- which bypasses RLS.
alter table areas           enable row level security;
alter table services        enable row level security;
alter table members         enable row level security;
alter table guests          enable row level security;
alter table vehicles        enable row level security;
alter table member_vehicles enable row level security;
alter table staff           enable row level security;
alter table visits          enable row level security;
alter table alerts          enable row level security;
alter table audit_events    enable row level security;
