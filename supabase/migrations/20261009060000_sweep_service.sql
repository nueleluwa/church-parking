-- The sweep records which service's sweep a "Still here" belongs to, so a car
-- that stays all day is checked again after each service (R-3).
drop function sweep_visit(uuid, uuid, boolean);

-- Returns: ok | not_found | bad_state
create function sweep_visit(p_visit uuid, p_staff uuid, p_gone boolean, p_service smallint)
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
            jsonb_build_object('status', 'parked'),
            jsonb_build_object('status', 'missed', 'sweep_service_id', p_service));
  else
    insert into audit_events (staff_id, visit_id, action, after)
    values (p_staff, p_visit, 'sweep_still_here',
            jsonb_build_object('sweep_service_id', p_service));
  end if;
  return 'ok';
end;
$$;

revoke all on function sweep_visit(uuid, uuid, boolean, smallint) from public, anon, authenticated;
