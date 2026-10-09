-- Release a visit and write the audit row in ONE transaction (EX-7, security rule 5).
-- The UPDATE only matches a visit that is still 'parked', so when two attendants
-- release at the same moment exactly one gets a row back.
create function release_visit(p_visit uuid, p_staff uuid, p_method release_method)
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
   where id = p_visit and status = 'parked'
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

-- Only the server (service key) may call it.
revoke all on function release_visit(uuid, uuid, release_method) from public, anon, authenticated;
