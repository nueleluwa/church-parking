-- QR check-in refactor, step 8: staff close a visit for a member, with a reason.
--
-- For a member who cannot check out (no signal, a different browser, a lost credential, a visit left open from an earlier day).
-- The visit is closed as released with release_method 'staff_close', by the staff member named, and the reason is written to the
-- audit row in the same transaction. The reason is required. A visit on hold is refused (a coordinator clears a hold first), and
-- one that is already closed is left alone. Unlike release_visit it does not insist the visit is from today, so it can close a
-- visit left open from an earlier day; the reason says why.
--
-- Answers: ok | not_found | bad_state (already closed) | held | bad_input (reason missing or too short)
-- Only the server (service key) may call it. Rollback: drop function staff_close_visit(uuid, uuid, text);

create function staff_close_visit(p_visit uuid, p_staff uuid, p_reason text)
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
  if v.status <> 'parked' then
    return 'bad_state';
  end if;
  if v.held_at is not null then
    return 'held';
  end if;

  update visits
     set status = 'released', released_at = now(), released_by = p_staff, release_method = 'staff_close'
   where id = p_visit and status = 'parked' and held_at is null;

  insert into audit_events (staff_id, visit_id, action, reason, before, after)
  values (p_staff, p_visit, 'staff_close', btrim(p_reason),
          jsonb_build_object('status', 'parked'),
          jsonb_build_object('status', 'released', 'method', 'staff_close', 'area_id', v.area_id));
  return 'ok';
end;
$$;

revoke all on function staff_close_visit(uuid, uuid, text) from public, anon, authenticated;
