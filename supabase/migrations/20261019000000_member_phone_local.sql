-- QR check-in refactor, step 1: the local form of a member's phone number.
--
-- Members are stored as E.164 (+2348031234567). The QR check-in asks for the local form (08031234567). Rather than
-- rewrite stored numbers, the database keeps the local form beside them, always computed from `phone`, so the two can
-- never disagree. It is NULL for a number that is not an 11-digit Nigerian one (an international number has no local
-- form). The unique index means a local number can match at most one member.
--
-- Must give the same answer as `toLocalPhone` in lib/rules/phone.ts.
--
-- Rollback:
--   drop index members_phone_local_key;
--   alter table members drop column phone_local;
-- Nothing else reads the column yet.

alter table members
  add column phone_local text generated always as (
    case when phone ~ '^\+234[0-9]{10}$' then '0' || substr(phone, 5) end
  ) stored;

create unique index members_phone_local_key on members (phone_local) where phone_local is not null;
