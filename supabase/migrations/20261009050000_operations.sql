-- M5: corrections, sweep and the midnight close. Every change to a visit writes
-- its audit row in the same transaction (security rule 5). Only the server
-- (service key) can call these.

-- OP-3: a coordinator corrects a visit. Every action needs a reason.
--   change_area, change_service, reopen (undo a release or a close), close
-- Returns: ok | not_found | bad_state | conflict | bad_input
create function correct_visit(
  p_visit    uuid,
  p_staff    uuid,
  p_action   text,
  p_reason   text,
  p_area     smallint default null,
  p_service  smallint default null
) returns text
language plpgsql
as $$
declare
  v      visits;
  before jsonb;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    return 'bad_input';
  end if;

  select * into v from visits where id = p_visit for update;
  if not found then
    return 'not_found';
  end if;

  before := jsonb_build_object(
    'status', v.status, 'area_id', v.area_id, 'service_id', v.service_id);

  if p_action = 'change_area' then
    if p_area is null or not exists (select 1 from areas where id = p_area) then
      return 'bad_input';
    end if;
    update visits set area_id = p_area where id = p_visit;

  elsif p_action = 'change_service' then
    if p_service is null or not exists (select 1 from services where id = p_service) then
      return 'bad_input';
    end if;
    update visits set service_id = p_service where id = p_visit;

  elsif p_action = 'close' then
    if v.status <> 'parked' then
      return 'bad_state';
    end if;
    update visits
       set status = 'missed', released_at = now(), released_by = p_staff, release_method = 'sweep'
     where id = p_visit;

  elsif p_action = 'reopen' then
    if v.status = 'parked' then
      return 'bad_state';
    end if;
    begin
      update visits
         set status = 'parked', released_at = null, released_by = null, release_method = null
       where id = p_visit;
    exception when unique_violation then
      -- the car already has another open visit (R-2)
      return 'conflict';
    end;

  else
    return 'bad_input';
  end if;

  insert into audit_events (staff_id, visit_id, action, reason, before, after)
  select p_staff, p_visit, p_action, btrim(p_reason), before,
         jsonb_build_object('status', status, 'area_id', area_id, 'service_id', service_id)
    from visits where id = p_visit;

  return 'ok';
end;
$$;

-- OP-2: the end-of-service sweep. "Gone" closes the visit as missed. "Still
-- here" leaves it open (it carries over) and records that it was checked.
-- Returns: ok | not_found | bad_state
create function sweep_visit(p_visit uuid, p_staff uuid, p_gone boolean)
returns text
language plpgsql
as $$
declare
  v visits;
begin
  select * into v from visits where id = p_visit for update;
  if not found then
    return 'not_found';
  end if;
  if v.status <> 'parked' then
    return 'bad_state';
  end if;

  if p_gone then
    update visits
       set status = 'missed', released_at = now(), released_by = p_staff, release_method = 'sweep'
     where id = p_visit;
    insert into audit_events (staff_id, visit_id, action, before, after)
    values (p_staff, p_visit, 'sweep_gone',
            jsonb_build_object('status', 'parked'), jsonb_build_object('status', 'missed'));
  else
    insert into audit_events (staff_id, visit_id, action, after)
    values (p_staff, p_visit, 'sweep_still_here',
            jsonb_build_object('service_id', v.service_id));
  end if;
  return 'ok';
end;
$$;

-- R-8: close every visit still parked from an earlier day. Returns how many.
create function close_open_visits(p_today date)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with closed as (
    update visits
       set status = 'missed', released_at = now(), release_method = 'midnight'
     where status = 'parked' and service_date < p_today
    returning id
  ), logged as (
    insert into audit_events (visit_id, action, after)
    select id, 'midnight_close', jsonb_build_object('status', 'missed') from closed
    returning 1
  )
  select count(*) into n from closed;
  return n;
end;
$$;

revoke all on function correct_visit(uuid, uuid, text, text, smallint, smallint) from public, anon, authenticated;
revoke all on function sweep_visit(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function close_open_visits(date) from public, anon, authenticated;

-- Run the midnight close at 00:00 Lagos time (23:00 UTC, Lagos is UTC+1 all year),
-- and clear check-in rate-limit records older than a day.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'midnight-close',
  '0 23 * * *',
  $$ select close_open_visits((now() at time zone 'Africa/Lagos')::date) $$
);

select cron.schedule(
  'clear-rate-events',
  '30 23 * * *',
  $$ delete from rate_events where created_at < now() - interval '1 day' $$
);
