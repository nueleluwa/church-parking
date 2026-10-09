-- Admins can rename a car park. The row keeps its id and its slug, so visits,
-- QR signs and every other reference keep working: only the name shown changes.
-- Two car parks can't share a name (ignoring capital letters).
create unique index areas_name_unique on areas (lower(name));

-- Returns: ok | not_found | duplicate | bad_input
create function rename_area(p_area smallint, p_staff uuid, p_name text)
returns text
language plpgsql
as $$
declare
  clean  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  before text;
begin
  if length(clean) < 2 or length(clean) > 40 then
    return 'bad_input';
  end if;

  select name into before from areas where id = p_area for update;
  if not found then
    return 'not_found';
  end if;

  if exists (select 1 from areas where lower(name) = lower(clean) and id <> p_area) then
    return 'duplicate';
  end if;

  update areas set name = clean where id = p_area;

  insert into audit_events (staff_id, action, before, after)
  values (p_staff, 'rename_area',
          jsonb_build_object('area_id', p_area, 'name', before),
          jsonb_build_object('area_id', p_area, 'name', clean));

  return 'ok';
end;
$$;

revoke all on function rename_area(smallint, uuid, text) from public, anon, authenticated;
