-- Check-in rate limits (threat T-7). Keys are hashes, never raw phone numbers or IPs.
create table rate_events (
  id          bigserial primary key,
  key         text not null,
  created_at  timestamptz not null default now()
);

create index rate_events_key_time on rate_events (key, created_at desc);

alter table rate_events enable row level security;
