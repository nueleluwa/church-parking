-- Users module: a member account can be switched off.
--
-- active  A member who is switched off cannot sign in, and cannot start a check-in (by themselves or when an attendant
--         registers their car). Their saved cars, visits and history stay exactly as they were.
-- The members table has no department or email, so the Users screen does not offer them.

alter table members add column active boolean not null default true;

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

  -- A member whose account is switched off cannot start a check-in (their history stays)
  if exists (select 1 from members where id = p_member and not active) then
    return jsonb_build_object('status', 'blocked', 'reason', 'member_inactive');
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

