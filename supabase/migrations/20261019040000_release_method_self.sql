-- QR check-in refactor, step 5: how a visit was closed.
--
--   self         the member closed it with the exit sign (checkout credential)
--   staff_close  staff closed it for a member who could not (reason recorded in the audit row)
--
-- Own file: a new enum value cannot be used in the same transaction that adds it. Existing rows and functions are unchanged.
--
-- Rollback: Postgres cannot drop an enum value. Leave these two unused; nothing else depends on them. Rolling the application
-- back is enough (the old code never writes them).

alter type release_method add value if not exists 'self';
alter type release_method add value if not exists 'staff_close';
