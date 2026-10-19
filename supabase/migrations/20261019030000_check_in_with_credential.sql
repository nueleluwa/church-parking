-- QR check-in refactor, step 4: check in by phone number, in one transaction.
--
-- The member is found by the local form of their phone number (members.phone_local) and has confirmed one of their
-- registered vehicles. In ONE transaction this function:
--   * applies the rate limits (counted first, then recorded; a counted-out phone or address is refused),
--   * locks the member's row, so two check-ins for the same member at the same moment run one after the other,
--   * creates the visit with a new credential hash, or
--   * for a member who already has an open visit at the SAME car park, keeps that visit (and its check-in time) and replaces
--     the credential (FR-21), subject to its own rate limit, or
--   * refuses a member whose open visit is at a DIFFERENT car park.
-- Every outcome that changes something writes an audit row. An unknown, inactive or vehicle-less member all answer
-- 'unavailable', so the answer does not say which.
--
-- It does not change claim_guest_visit, claim_member_visit or release_visit, so the existing check-in keeps working.
-- Only the server (service key) may call it.
--
-- Answers: { status: 'ok', reissued: bool, token, reference, plate }
--          { status: 'unavailable', reason } | { status: 'other_area' } | { status: 'rate_limited' }
--          { status: 'blocked', reason: 'plate_conflict' } | { status: 'error' }
--
-- Rollback: drop function check_in_with_credential(text, uuid, smallint, smallint, date, text, timestamptz, jsonb, text,
--           integer, integer, text, integer, integer, text, integer, integer);

create function check_in_with_credential(
  p_local        text,
  p_vehicle      uuid,
  p_service      smallint,
  p_area         smallint,
  p_date         date,
  p_hash         text,
  p_expires      timestamptz,
  p_candidates   jsonb,
  p_phone_key    text default null,
  p_phone_max    integer default 0,
  p_phone_mins   integer default 0,
  p_ip_key       text default null,
  p_ip_max       integer default 0,
  p_ip_mins      integer default 0,
  p_reissue_key  text default null,
  p_reissue_max  integer default 0,
  p_reissue_mins integer default 0
) returns jsonb
language plpgsql
as $$
declare
  m            members;
  ve           vehicles;
  o            visits;
  c            jsonb;
  v_constraint text;
  v_plate      text;
  n            integer;
  v_phone_n    integer := 0;
  v_ip_n       integer := 0;
  v_detail     jsonb := jsonb_build_object('area_id', p_area, 'service_id', p_service);
begin
  -- Rate limits first, so a number that does not exist is counted too
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

  -- The lock makes two check-ins for the same member run one after the other
  select * into m from members where phone_local = p_local for update;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'unknown');
  end if;
  if not m.active then
    return jsonb_build_object('status', 'unavailable', 'reason', 'inactive');
  end if;

  select * into ve from vehicles v
   where v.id = p_vehicle and v.active
     and exists (select 1 from member_vehicles mv where mv.member_id = m.id and mv.vehicle_id = v.id);
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'vehicle');
  end if;

  -- A visit left open from an earlier day is closed the way the midnight job would
  update visits set status = 'missed', released_at = now(), release_method = 'midnight'
   where member_id = m.id and status = 'parked' and service_date < p_date;
  perform close_stale_visits(ve.id, p_date);

  select * into o from visits where member_id = m.id and status = 'parked' order by checked_in_at desc limit 1;
  if found then
    if o.area_id <> p_area then
      return jsonb_build_object('status', 'other_area');
    end if;

    -- Same car park: keep the visit and its time, replace the credential (FR-21)
    if p_reissue_key is not null then
      select count(*) into n from rate_events
       where key = p_reissue_key and created_at >= now() - make_interval(mins => p_reissue_mins);
      insert into rate_events (key) values (p_reissue_key);
      if n >= p_reissue_max then
        return jsonb_build_object('status', 'rate_limited');
      end if;
    end if;

    update visits
       set credential_hash = p_hash,
           credential_issued_at = now(),
           credential_expires_at = p_expires,
           credential_reissues = credential_reissues + 1
     where id = o.id;
    insert into audit_events (visit_id, action, after)
    values (o.id, 'credential_reissue',
            jsonb_build_object('area_id', o.area_id, 'reissues', o.credential_reissues + 1,
                               'had_credential', o.credential_hash is not null));
    select plate into v_plate from vehicles where id = o.vehicle_id;
    return jsonb_build_object('status', 'ok', 'reissued', true, 'token', o.pass_token, 'reference', o.reference, 'plate', v_plate);
  end if;

  -- The car is already checked in by someone else
  if exists (select 1 from visits where vehicle_id = ve.id and status = 'parked') then
    insert into alerts (kind, plate, detail) values ('plate_conflict', ve.plate, v_detail);
    return jsonb_build_object('status', 'blocked', 'reason', 'plate_conflict');
  end if;

  for c in select * from jsonb_array_elements(p_candidates) loop
    begin
      insert into visits (reference, pass_token, vehicle_id, member_id, service_id, area_id, service_date,
                          credential_hash, credential_issued_at, credential_expires_at)
      values (c->>'reference', c->>'token', ve.id, m.id, p_service, p_area, p_date, p_hash, now(), p_expires)
      returning * into o;
      insert into audit_events (visit_id, action, after)
      values (o.id, 'member_check_in', v_detail || jsonb_build_object('via', 'phone'));
      return jsonb_build_object('status', 'ok', 'reissued', false, 'token', o.pass_token, 'reference', o.reference, 'plate', ve.plate);
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'one_open_visit_per_vehicle' then
        insert into alerts (kind, plate, detail) values ('plate_conflict', ve.plate, v_detail);
        return jsonb_build_object('status', 'blocked', 'reason', 'plate_conflict');
      end if;
      -- the reference, token or credential was taken: try the next candidate
    end;
  end loop;

  return jsonb_build_object('status', 'error');
end;
$$;

revoke all on function check_in_with_credential(text, uuid, smallint, smallint, date, text, timestamptz, jsonb, text,
  integer, integer, text, integer, integer, text, integer, integer) from public, anon, authenticated;
