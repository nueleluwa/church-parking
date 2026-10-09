-- Seed data for the hosted DEV project only. Never run against production.
-- The admin staff account is created by `pnpm db:seed-admin` because its
-- password hash comes from environment variables, never from this file.

insert into areas (name, slug, sort) values
  ('Car Park 1', 'cp1', 1),
  ('Car Park 2', 'cp2', 2),
  ('Roadside',   'road', 3);

insert into services (name, weekday, starts_at, ends_at) values
  ('Service 1', 0, '07:30', '09:30'),
  ('Service 2', 0, '09:30', '11:30'),
  ('Service 3', 0, '11:30', '13:30');

-- Obviously fake sample people and cars. pin_hash is a placeholder that no
-- PIN can match.
insert into members (id, full_name, phone, pin_hash) values
  ('00000000-0000-0000-0000-0000000000a1', 'Test Member', '+2340000000001', 'not-a-real-hash');

insert into guests (id, full_name, phone) values
  ('00000000-0000-0000-0000-0000000000b1', 'Test Guest', '+2340000000002');

insert into vehicles (id, plate) values
  ('00000000-0000-0000-0000-0000000000c1', 'TST111AA'),
  ('00000000-0000-0000-0000-0000000000c2', 'TST222BB');

insert into member_vehicles (member_id, vehicle_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1');

insert into visits (reference, pass_token, vehicle_id, member_id, guest_id, service_id, area_id, service_date)
select 'PK-TST1', replace(gen_random_uuid()::text, '-', ''),
       '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', null,
       s.id, a.id, (now() at time zone 'Africa/Lagos')::date
from services s, areas a where s.name = 'Service 1' and a.slug = 'cp1';

insert into visits (reference, pass_token, vehicle_id, member_id, guest_id, service_id, area_id, service_date)
select 'PK-TST2', replace(gen_random_uuid()::text, '-', ''),
       '00000000-0000-0000-0000-0000000000c2', null, '00000000-0000-0000-0000-0000000000b1',
       s.id, a.id, (now() at time zone 'Africa/Lagos')::date
from services s, areas a where s.name = 'Service 1' and a.slug = 'cp2';
