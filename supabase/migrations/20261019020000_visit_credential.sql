-- QR check-in refactor, step 3: a checkout credential on a visit.
--
-- A visit made by the QR check-in carries a credential that lets the member's own browser close it (the exit sign). Only a
-- SHA-256 hash of the credential is stored, never the credential itself. The hash stays on the row after the visit is closed,
-- so a repeated checkout can be told apart from a missing credential.
--
--   credential_hash         hash of the current credential; null for a visit with none (every visit made before this)
--   credential_issued_at    when the current credential was issued
--   credential_expires_at   after this the credential no longer closes the visit
--   credential_reissues     how many times a repeat check-in replaced the credential
--
-- Existing rows are untouched (all null / 0). This is separate from visits.pass_token, which is the attendant's pass.
--
-- Rollback:
--   drop index visits_credential_hash;
--   alter table visits drop column credential_hash, drop column credential_issued_at,
--                      drop column credential_expires_at, drop column credential_reissues;

alter table visits
  add column credential_hash text,
  add column credential_issued_at timestamptz,
  add column credential_expires_at timestamptz,
  add column credential_reissues smallint not null default 0;

create unique index visits_credential_hash on visits (credential_hash) where credential_hash is not null;
