-- A check-in can now be repeated safely (workflow review, "uncertain outcome").
--
-- The form sends a one-time random key with each check-in attempt. If a request reached the server and made the
-- visit, but the answer never reached the phone (a dropped signal), the phone tries again with the SAME key and
-- gets the SAME pass back: no second visit, no "this car is already checked in" error, and no false alert to
-- the coordinator. A different key for the same car is still refused, exactly as before (R-2, R-4, R-5).
--
-- The key is a random value that only the phone that made it knows, so it cannot be used to read someone
-- else's pass. A key only counts as a retry for 30 minutes; after that it is forgotten, so it can never block a
-- genuine new visit.

alter table visits add column check_in_key uuid;
create unique index visits_check_in_key on visits (check_in_key) where check_in_key is not null;

drop function claim_guest_visit(text, text, text, smallint, smallint, date, uuid, jsonb, text, integer, integer, text, integer, integer);
drop function claim_member_visit(uuid, uuid, text, smallint, smallint, date, uuid, jsonb);

create function claim_guest_visit(
  p_plate       text,
  p_name        text,
  p_phone       text,
  p_service     smallint,
  p_area        smallint,
  p_date        date,
  p_staff       uuid,
  p_candidates  jsonb,
  p_phone_key   text,
  p_phone_max   integer,
  p_phone_mins  integer,
  p_ip_key      text,
  p_ip_max      integer,
  p_ip_mins     integer,
  p_key         uuid default null
) returns jsonb
language plpgsql
as $$
declare
  v_vehicle    uuid;
  v_guest      uuid;
  c            jsonb;
  v_constraint text;
  v_token      text;
  v_reference  text;
  v_phone_n    integer := 0;
  v_ip_n       integer := 0;
  v_detail     jsonb := jsonb_build_object('area_id', p_area, 'service_id', p_service);
begin
  -- The same attempt again (the first answer was lost): give back the pass that attempt made. Nothing is
  -- counted against the rate limits and nothing is reported.
  if p_key is not null then
    select pass_token, reference into v_token, v_reference from visits
     where check_in_key = p_key and checked_in_at > now() - interval '30 minutes';
    if found then
      return jsonb_build_object('status', 'ok', 'token', v_token, 'reference', v_reference, 'existing', true);
    end if;
    -- A key from long ago is not a retry. Forget it so it cannot get in the way of a new visit.
    if exists (select 1 from visits where check_in_key = p_key) then
      p_key := null;
    end if;
  end if;

  -- Rate limits (T-7). Attempts are counted first, then recorded, and a counted-out phone or
  -- address is refused. Attendants registering by hand pass no keys and skip this.
  if p_phone_key is not null then
    select count(*) into v_phone_n from rate_events
     where key = p_phone_key and created_at >= now() - make_interval(mins => p_phone_mins);
    insert into rate_events (key) values (p_phone_key);
  end if;
  if p_ip_key is not null then
    select count(*) into v_ip_n from rate_events
     where key = p_ip_key and created_at >= now() - make_interval(mins => p_ip_mins);
    insert into rate_events (key) values (p_ip_key);
  end if;
  if (p_phone_key is not null and v_phone_n >= p_phone_max)
     or (p_ip_key is not null and v_ip_n >= p_ip_max) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select id into v_vehicle from vehicles where plate = p_plate;
  if v_vehicle is not null then
    perform close_stale_visits(v_vehicle, p_date);
    if exists (select 1 from visits where vehicle_id = v_vehicle and status = 'parked') then
      insert into alerts (kind, plate, detail) values ('plate_conflict', p_plate, v_detail);
      return jsonb_build_object('status', 'blocked', 'reason', 'plate_conflict');
    end if;
    if exists (select 1 from member_vehicles where vehicle_id = v_vehicle) then
      insert into alerts (kind, plate, detail) values ('member_plate_claim', p_plate, v_detail);
      return jsonb_build_object('status', 'blocked', 'reason', 'member_plate');
    end if;
  else
    insert into vehicles (plate) values (p_plate)
      on conflict (plate) do nothing returning id into v_vehicle;
    if v_vehicle is null then
      select id into v_vehicle from vehicles where plate = p_plate;
    end if;
  end if;

  for c in select * from jsonb_array_elements(p_candidates) loop
    begin
      insert into guests (full_name, phone) values (p_name, p_phone) returning id into v_guest;
      insert into visits (reference, pass_token, vehicle_id, guest_id, service_id, area_id,
                          service_date, checked_in_by, check_in_key)
      values (c->>'reference', c->>'token', v_vehicle, v_guest, p_service, p_area, p_date, p_staff, p_key);
      return jsonb_build_object('status', 'ok', 'token', c->>'token', 'reference', c->>'reference');
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'visits_check_in_key' then
        -- The same attempt arrived twice at the same moment, and the other one won: give back its pass
        select pass_token, reference into v_token, v_reference from visits where check_in_key = p_key;
        return jsonb_build_object('status', 'ok', 'token', v_token, 'reference', v_reference, 'existing', true);
      end if;
      if v_constraint = 'one_open_visit_per_vehicle' then
        -- Someone else claimed this plate a moment ago: the database decides, first claim wins (R-4)
        insert into alerts (kind, plate, detail) values ('plate_conflict', p_plate, v_detail);
        return jsonb_build_object('status', 'blocked', 'reason', 'plate_conflict');
      end if;
      -- the reference or token was taken: try the next pair
    end;
  end loop;

  return jsonb_build_object('status', 'error');
end;
$$;

create function claim_member_visit(
  p_member      uuid,
  p_vehicle     uuid,
  p_plate       text,
  p_service     smallint,
  p_area        smallint,
  p_date        date,
  p_staff       uuid,
  p_candidates  jsonb,
  p_key         uuid default null
) returns jsonb
language plpgsql
as $$
declare
  c            jsonb;
  o            visits;
  v_constraint text;
  v_token      text;
  v_reference  text;
  v_detail     jsonb := jsonb_build_object('area_id', p_area, 'service_id', p_service);
begin
  if p_key is not null then
    select pass_token, reference into v_token, v_reference from visits
     where check_in_key = p_key and checked_in_at > now() - interval '30 minutes' and member_id = p_member;
    if found then
      return jsonb_build_object('status', 'ok', 'token', v_token, 'reference', v_reference, 'existing', true);
    end if;
    if exists (select 1 from visits where check_in_key = p_key) then
      p_key := null;
    end if;
  end if;

  if not exists (select 1 from member_vehicles where member_id = p_member and vehicle_id = p_vehicle) then
    return jsonb_build_object('status', 'blocked', 'reason', 'not_your_vehicle');
  end if;

  perform close_stale_visits(p_vehicle, p_date);

  select * into o from visits where vehicle_id = p_vehicle and status = 'parked';
  if found then
    -- The member's own pass from earlier today (staying for another service) is given back (R-3).
    if o.member_id = p_member and o.service_date = p_date then
      return jsonb_build_object('status', 'ok', 'token', o.pass_token, 'reference', o.reference, 'existing', true);
    end if;
    insert into alerts (kind, plate, detail) values ('plate_conflict', p_plate, v_detail);
    return jsonb_build_object('status', 'blocked', 'reason', 'plate_conflict');
  end if;

  for c in select * from jsonb_array_elements(p_candidates) loop
    begin
      insert into visits (reference, pass_token, vehicle_id, member_id, service_id, area_id,
                          service_date, checked_in_by, check_in_key)
      values (c->>'reference', c->>'token', p_vehicle, p_member, p_service, p_area, p_date, p_staff, p_key);
      return jsonb_build_object('status', 'ok', 'token', c->>'token', 'reference', c->>'reference', 'existing', false);
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'visits_check_in_key' then
        select pass_token, reference into v_token, v_reference from visits where check_in_key = p_key and member_id = p_member;
        if found then
          return jsonb_build_object('status', 'ok', 'token', v_token, 'reference', v_reference, 'existing', true);
        end if;
      end if;
      if v_constraint = 'one_open_visit_per_vehicle' then
        insert into alerts (kind, plate, detail) values ('plate_conflict', p_plate, v_detail);
        return jsonb_build_object('status', 'blocked', 'reason', 'plate_conflict');
      end if;
    end;
  end loop;

  return jsonb_build_object('status', 'error');
end;
$$;

revoke all on function claim_guest_visit(text, text, text, smallint, smallint, date, uuid, jsonb, text, integer, integer, text, integer, integer, uuid) from public, anon, authenticated;
revoke all on function claim_member_visit(uuid, uuid, text, smallint, smallint, date, uuid, jsonb, uuid) from public, anon, authenticated;
