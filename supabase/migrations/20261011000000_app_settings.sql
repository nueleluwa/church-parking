-- Settings an admin can change from the Settings screen (church details and a few preferences).
-- One row for each setting. The app reads them with its server key only; nothing here is public.
-- Values are checked by the app before they are saved; a missing or unreadable value means "use the default".
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references staff(id)
);

alter table app_settings enable row level security;
