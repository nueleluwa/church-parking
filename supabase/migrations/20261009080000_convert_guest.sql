-- CI-7: a guest turns the details they gave into a member account by choosing a PIN.
-- Done in one step so a half-finished conversion can never be left behind. The caller
-- (the server) has already checked that the request comes from the phone that holds the pass.
--
-- Returns the new member's id, or one of: not_found | not_guest | not_open | phone_taken | plate_taken
create function convert_guest_to_member(p_token text, p_pin_hash text)
returns text
language plpgsql
as $$
declare
  v visits;
  g guests;
  m uuid;
begin
  select * into v from visits where pass_token = p_token for update;
  if not found then
    return 'not_found';
  end if;
  if v.guest_id is null then
    return 'not_guest';
  end if;
  if v.status <> 'parked' then
    return 'not_open';
  end if;

  select * into g from guests where id = v.guest_id;
  if g.phone = 'deleted' then
    return 'not_guest';
  end if;
  if exists (select 1 from members where phone = g.phone) then
    return 'phone_taken';
  end if;
  -- the car already belongs to a member (it cannot, for a guest visit, but be safe)
  if exists (select 1 from member_vehicles where vehicle_id = v.vehicle_id) then
    return 'plate_taken';
  end if;

  insert into members (full_name, phone, pin_hash)
  values (g.full_name, g.phone, p_pin_hash)
  returning id into m;

  insert into member_vehicles (member_id, vehicle_id) values (m, v.vehicle_id);

  -- the visit becomes the member's own; the guest row is kept and linked
  update visits set member_id = m, guest_id = null where id = v.id;
  update guests set member_id = m where id = g.id;

  return m::text;
end;
$$;

revoke all on function convert_guest_to_member(text, text) from public, anon, authenticated;
