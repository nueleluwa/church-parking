-- Vehicles module: a vehicle record can now be deactivated, and has an optional type and a registered date.
--
-- active        A deactivated vehicle cannot start a NEW check-in (guest or member). Its history stays, and an
--               open visit is never closed or released by deactivating it: the car can still be released at the exit.
-- vehicle_type  Optional: car, suv, van, bus, motorcycle or other. Empty means "not recorded".
-- created_at    When the record was made. Records that exist today have no date (shown as "Not recorded"), because
--               inventing one would be wrong.
-- The make and model stay together in `make` (see D-38).

alter table vehicles add column active boolean not null default true;
alter table vehicles add column vehicle_type text check (vehicle_type in ('car', 'suv', 'van', 'bus', 'motorcycle', 'other'));
alter table vehicles add column created_at timestamptz;
alter table vehicles alter column created_at set default now();

create or replace function claim_guest_visit(
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
    if exists (select 1 from vehicles where id = v_vehicle and not active) then
      return jsonb_build_object('status', 'blocked', 'reason', 'vehicle_inactive');
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

create or replace function claim_member_visit(
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
  if not found and exists (select 1 from vehicles where id = p_vehicle and not active) then
    return jsonb_build_object('status', 'blocked', 'reason', 'vehicle_inactive');
  end if;
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

