-- QR check-in refactor, step 7: one open visit per member, across all cars and car parks (SRS section 11).
--
-- Until now the database allowed one open visit per VEHICLE, so a member with two cars could have both checked in. From here a
-- member has at most one. Guest visits have no member and are not affected.
--
-- 1. A guard: if any member already has more than one open visit, this migration stops with a message saying so, instead of a
--    bare index error. Close those visits (or run scripts/qr-refactor-data-checks.sql, check D1) and deploy again. Apply it
--    outside a service, when nothing is parked (deploys are already held during a service, D-28).
-- 2. The unique index that enforces it.
-- 3. claim_member_visit (the original member check-in, same signature) now answers 'blocked' / 'member_has_open_visit' for a
--    member whose OTHER car is already checked in, instead of failing on the new index. Everything else in it is unchanged: the
--    member's own pass for the same car today is still given back (R-3), a car parked by someone else is still a plate conflict.
--    It also closes a member's visit left open from an earlier day first, as the midnight job would.
--
-- Rollback:
--   drop index one_open_visit_per_member;
--   then re-run the body of claim_member_visit from 20261012000000_member_status.sql (the previous version).

do $$
begin
  if exists (
    select 1 from visits where status = 'parked' and member_id is not null group by member_id having count(*) > 1
  ) then
    raise exception 'one_open_visit_per_member blocked: some members have more than one open visit. Close the extra visits first (check D1 in scripts/qr-refactor-data-checks.sql).';
  end if;
end
$$;

create unique index one_open_visit_per_member on visits (member_id) where status = 'parked' and member_id is not null;

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

  -- Visits left open from an earlier day are closed the way the midnight job would
  update visits set status = 'missed', released_at = now(), release_method = 'midnight'
   where member_id = p_member and status = 'parked' and service_date < p_date;
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

  -- One open visit per member: another of their cars is already checked in
  if exists (select 1 from visits where member_id = p_member and status = 'parked') then
    return jsonb_build_object('status', 'blocked', 'reason', 'member_has_open_visit');
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
      if v_constraint = 'one_open_visit_per_member' then
        return jsonb_build_object('status', 'blocked', 'reason', 'member_has_open_visit');
      end if;
    end;
  end loop;

  return jsonb_build_object('status', 'error');
end;
$$;

revoke all on function claim_member_visit(uuid, uuid, text, smallint, smallint, date, uuid, jsonb, uuid) from public, anon, authenticated;
