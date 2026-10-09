-- When a car was saved to a member's account, so a newly saved car can be
-- flagged for the attendant (stops someone saving another person's plate and
-- walking out with a member pass).
alter table member_vehicles add column added_at timestamptz not null default now();

-- Close visits for one vehicle that were left open on an earlier day, the same
-- way the midnight job will. Used when a plate checks in again.
create function close_stale_visits(p_vehicle uuid, p_today date)
returns void
language sql
as $$
  update visits
     set status = 'missed',
         released_at = now(),
         release_method = 'midnight'
   where vehicle_id = p_vehicle and status = 'parked' and service_date < p_today;
$$;

revoke all on function close_stale_visits(uuid, date) from public, anon, authenticated;
