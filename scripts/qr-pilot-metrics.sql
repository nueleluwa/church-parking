-- Read-only numbers to watch during the phone check-in pilot (docs/qr-rollout.md, "While it runs").
-- Counts only: no names, phone numbers or plates.
--     psql "$DATABASE_URL" -X -f scripts/qr-pilot-metrics.sql
-- Not measured by the app, so not here: how long check-in takes for a member, and how many check-ins fail and why. Failed
-- lookups are rate-limit counters (hashed), not records. Watch the pm2 logs and ask the attendants for those.

select 'checkouts by method (last 7 days)' as what, coalesce(v.release_method::text, '(none)') as k, count(*) as n
  from visits v
 where v.service_date >= (now() at time zone 'Africa/Lagos')::date - 7 and v.status = 'released'
 group by v.release_method
union all
select 'phone check-ins (last 7 days)', 'visits with a credential', count(*)
  from visits where credential_hash is not null and service_date >= (now() at time zone 'Africa/Lagos')::date - 7
union all
select 'phone check-ins (last 7 days)', 'with at least one replacement', count(*)
  from visits where credential_reissues > 0 and service_date >= (now() at time zone 'Africa/Lagos')::date - 7
union all
select 'staff closures (last 7 days)', 'closed with a reason', count(*)
  from audit_events where action = 'staff_close' and created_at >= now() - interval '7 days'
union all
select 'open now longer than 12 hours', 'visits', count(*)
  from visits where status = 'parked' and checked_in_at < now() - interval '12 hours'
order by 1, 2;
