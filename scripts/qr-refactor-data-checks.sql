-- Read-only data checks for the QR check-in refactor (docs/GAP_ANALYSIS.md section 6, D1 to D8).
--
-- Run against a RESTORED COPY of the production backup before applying the refactor migrations there, never against the
-- live database:
--     psql "$COPY_DATABASE_URL" -X -f scripts/qr-refactor-data-checks.sql
--
-- Every statement is a select. It prints counts only, no names, phone numbers or plates. A row marked BLOCKS must be
-- zero before migration 'one_open_visit_per_member' is applied; the others are things to know and to plan for.

select 'D1 BLOCKS: members with more than one open visit' as check, count(*) as n
  from (select member_id from visits where status = 'parked' and member_id is not null group by 1 having count(*) > 1) x

union all
select 'D2: members with no local phone form (not a +234 number)', count(*)
  from members where phone !~ '^\+234[0-9]{10}$'

union all
select 'D3: phones used by more than one guest record', count(*)
  from (select phone from guests group by 1 having count(*) > 1) x

union all
select 'D3: members sharing a phone with a staff account', count(*)
  from members m join staff s on s.phone = m.phone

union all
select 'D4: plate pairs that differ only by 0/O or 1/I', count(*)
  from vehicles a join vehicles b
    on a.id < b.id and translate(a.plate, 'OI', '01') = translate(b.plate, 'OI', '01')

union all
select 'D5: members with no saved vehicle (cannot check in by phone)', count(*)
  from members m where not exists (select 1 from member_vehicles v where v.member_id = m.id)

union all
select 'D6: members with more than one vehicle', count(*)
  from (select member_id from member_vehicles group by 1 having count(*) > 1) x

union all
select 'D7: open visits that have a release time', count(*)
  from visits where status = 'parked' and released_at is not null

union all
select 'D7: closed visits with no release time or method', count(*)
  from visits where status <> 'parked' and (released_at is null or release_method is null)

union all
select 'D7: scan/search releases with no staff member', count(*)
  from visits where release_method in ('scan', 'search') and released_by is null

union all
select 'D7: visits whose service date is not the Lagos date of check-in', count(*)
  from visits where service_date <> (checked_in_at at time zone 'Africa/Lagos')::date

union all
select 'D8: active members (all become eligible for phone-only check-in at cut-over)', count(*)
  from members where active

union all
select 'info: members with a PIN', count(*) from members where pin_hash is not null

union all
select 'info: members without a PIN (added for the QR check-in)', count(*) from members where pin_hash is null

order by 1;
