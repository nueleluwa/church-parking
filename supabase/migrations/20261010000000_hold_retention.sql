-- Audit fixes: a visit can be put on hold (Does not match), release checks the
-- service date inside the database, and guest data is deleted after 24 months.

alter table visits
  add column held_at timestamptz,
  add column held_by uuid references staff(id);

-- "Does not match": put the car on hold. A held visit cannot be released until a
-- coordinator clears the hold with a reason. Returns: ok | not_found | bad_state
create function hold_visit(p_visit uuid, p_staff uuid)
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
  if v.held_at is null then
    update visits set held_at = now(), held_by = p_staff where id = p_visit;
    insert into audit_events (staff_id, visit_id, action, before, after)
    values (p_staff, p_visit, 'hold',
            jsonb_build_object('held', false), jsonb_build_object('held', true));
  end if;
  return 'ok';
end;
$$;

-- A coordinator clears a hold. A reason is required. Returns: ok | not_found | bad_state | bad_input
create function clear_hold(p_visit uuid, p_staff uuid, p_reason text)
returns text
language plpgsql
as $$
declare
  v visits;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    return 'bad_input';
  end if;
  select * into v from visits where id = p_visit for update;
  if not found then
    return 'not_found';
  end if;
  if v.held_at is null then
    return 'bad_state';
  end if;
  update visits set held_at = null, held_by = null where id = p_visit;
  update alerts set resolved_by = p_staff, resolved_at = now()
   where visit_id = p_visit and kind = 'no_match' and resolved_at is null;
  insert into audit_events (staff_id, visit_id, action, reason, before, after)
  values (p_staff, p_visit, 'clear_hold', btrim(p_reason),
          jsonb_build_object('held', true), jsonb_build_object('held', false));
  return 'ok';
end;
$$;

-- Release again, now refusing a held visit and a visit from another service date
-- (R-7) inside the same single statement. Returns the visit id, or null.
drop function release_visit(uuid, uuid, release_method);
create function release_visit(p_visit uuid, p_staff uuid, p_method release_method, p_today date)
returns uuid
language plpgsql
as $$
declare
  v visits;
begin
  update visits
     set status = 'released',
         released_at = now(),
         released_by = p_staff,
         release_method = p_method
   where id = p_visit and status = 'parked' and held_at is null and service_date = p_today
  returning * into v;

  if not found then
    return null;
  end if;

  insert into audit_events (staff_id, visit_id, action, before, after)
  values (p_staff, v.id, 'release',
          jsonb_build_object('status', 'parked'),
          jsonb_build_object('status', 'released', 'method', p_method));

  return v.id;
end;
$$;

-- R-11: delete guest visits older than 24 months, then guests and plates nobody
-- refers to any more. Open visits are never deleted. Audit rows stay but lose the
-- link to the deleted visit (they hold no names or phone numbers). Returns visits deleted.
create function delete_expired_guest_data(p_before timestamptz)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  create temp table expired_visits on commit drop as
    select id from visits
     where guest_id is not null and status <> 'parked' and checked_in_at < p_before;

  delete from alerts where visit_id in (select id from expired_visits);
  update audit_events set visit_id = null where visit_id in (select id from expired_visits);
  delete from visits where id in (select id from expired_visits);
  get diagnostics n = row_count;

  delete from guests g
   where g.member_id is null
     and not exists (select 1 from visits v where v.guest_id = g.id);

  delete from vehicles ve
   where not exists (select 1 from visits v where v.vehicle_id = ve.id)
     and not exists (select 1 from member_vehicles mv where mv.vehicle_id = ve.id);

  return n;
end;
$$;

revoke all on function hold_visit(uuid, uuid) from public, anon, authenticated;
revoke all on function clear_hold(uuid, uuid, text) from public, anon, authenticated;
revoke all on function release_visit(uuid, uuid, release_method, date) from public, anon, authenticated;
revoke all on function delete_expired_guest_data(timestamptz) from public, anon, authenticated;

-- Daily at 23:45 UTC (00:45 Lagos).
select cron.schedule(
  'guest-retention',
  '45 23 * * *',
  $$ select delete_expired_guest_data(now() - interval '24 months') $$
);
