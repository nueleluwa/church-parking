-- QR check-in refactor, step 2: a member no longer needs a PIN.
--
-- Members added for the QR check-in are found by phone number and plate confirmation; they have no PIN. A null
-- pin_hash means "cannot sign in with a PIN". The sign-in rule ignores a PIN match for such a member
-- (lib/rules/member-auth.ts), so it is safe. Existing members keep their PIN and nothing about them changes.
--
-- Rollback (only possible while no member has a null pin_hash):
--   select count(*) from members where pin_hash is null;       -- write this number down
--   update members set pin_hash = '!' where pin_hash is null;    -- '!' is not a valid hash, so it never matches
--   alter table members alter column pin_hash set not null;

alter table members alter column pin_hash drop not null;
