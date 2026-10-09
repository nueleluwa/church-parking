-- A member deletes their account (R-11). Visit history is kept for the
-- church's records but no longer points at them: each visit is re-pointed to
-- an anonymous guest row, then the member and their saved plates are removed.
create function delete_member(p_member uuid)
returns void
language plpgsql
as $$
declare
  anon uuid;
begin
  insert into guests (full_name, phone) values ('Deleted member', 'deleted')
  returning id into anon;

  update visits set guest_id = anon, member_id = null where member_id = p_member;
  update guests set member_id = null where member_id = p_member;
  delete from members where id = p_member;  -- member_vehicles go with it
end;
$$;

revoke all on function delete_member(uuid) from public, anon, authenticated;
