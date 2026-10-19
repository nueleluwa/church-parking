-- QR check-in refactor, step 6: close a visit with its checkout credential, in one transaction.
--
-- The member's browser sends its credential (as a hash) and the car park of the exit sign it scanned. The function finds the
-- visit by the hash and locks it, so two requests at the same moment, or a member and an attendant, run one after the other.
-- The visit is closed only if it is still open, not on hold, from today, inside the credential's lifetime and at THIS car park.
-- It never takes a phone number. A visit that is already closed answers 'already_closed' and changes nothing (safe to repeat).
-- The hash stays on the closed visit, so a repeat can be told apart from a missing credential.
--
-- Answers: { status: 'ok', plate, reference, checked_in_at, released_at }
--          { status: 'already_closed' } (closed by the member, an attendant or staff) | { status: 'closed_missed' } (closed at midnight or by a sweep)
--          { status: 'no_credential' } (no visit has this hash: never issued, or replaced by a newer one)
--          { status: 'expired' } | { status: 'wrong_area' } | { status: 'held' }
--
-- Only the server (service key) may call it. Rollback: drop function checkout_with_credential(text, smallint, date);

create function checkout_with_credential(p_hash text, p_area smallint, p_today date)
returns jsonb
language plpgsql
as $$
declare
  v       visits;
  v_plate text;
begin
  select * into v from visits where credential_hash = p_hash for update;
  if not found then
    return jsonb_build_object('status', 'no_credential');
  end if;

  if v.status = 'released' then
    return jsonb_build_object('status', 'already_closed');
  end if;
  if v.status = 'missed' then
    return jsonb_build_object('status', 'closed_missed');
  end if;

  -- Still open from here on
  if (v.credential_expires_at is not null and v.credential_expires_at <= now()) or v.service_date <> p_today then
    return jsonb_build_object('status', 'expired');
  end if;
  if v.area_id <> p_area then
    return jsonb_build_object('status', 'wrong_area');
  end if;
  if v.held_at is not null then
    return jsonb_build_object('status', 'held');
  end if;

  update visits
     set status = 'released', released_at = now(), release_method = 'self'
   where id = v.id and status = 'parked' and held_at is null
  returning * into v;
  if not found then
    return jsonb_build_object('status', 'already_closed');
  end if;

  insert into audit_events (visit_id, action, before, after)
  values (v.id, 'self_checkout',
          jsonb_build_object('status', 'parked'),
          jsonb_build_object('status', 'released', 'method', 'self', 'area_id', v.area_id));

  select plate into v_plate from vehicles where id = v.vehicle_id;
  return jsonb_build_object('status', 'ok', 'plate', v_plate, 'reference', v.reference,
                            'checked_in_at', v.checked_in_at, 'released_at', v.released_at);
end;
$$;

revoke all on function checkout_with_credential(text, smallint, date) from public, anon, authenticated;
