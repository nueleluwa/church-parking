#!/usr/bin/env bash
# Applies the database changes in supabase/migrations/ that this database does not have yet, in order,
# each one inside its own transaction together with the note that it has been applied. If one fails,
# nothing of it is kept and the rest are not run. Run by install-db.sh and on every deploy.
#
#   migrate.sh [--with-backup]     --with-backup: take a backup first, if there is anything to apply
#
# Uses DATABASE_URL from /srv/church-parking/shared/.env.production.local (the database's own owner role).
set -euo pipefail
export PATH=/opt/node24/bin:$PATH

APP_DIR=/srv/church-parking
ENV_FILE="$APP_DIR/shared/.env.production.local"
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MIGRATIONS="$HERE/../../supabase/migrations"
cd / # a folder every user can read, so nothing below depends on where this was started
WITH_BACKUP=0; [[ "${1:-}" == "--with-backup" ]] && WITH_BACKUP=1

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[[ -n "$DATABASE_URL" ]] || { echo "DATABASE_URL is not set in $ENV_FILE" >&2; exit 66; }
[[ -d "$MIGRATIONS" ]] || { echo "No migrations folder at $MIGRATIONS" >&2; exit 66; }
sql() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

sql -c "create schema if not exists ops;
        create table if not exists ops.applied_migrations (name text primary key, applied_at timestamptz not null default now());"

PENDING=()
while IFS= read -r file; do
  name=$(basename "$file")
  [[ -z "$(sql -tAc "select 1 from ops.applied_migrations where name = '$name'")" ]] && PENDING+=("$file")
done < <(find "$MIGRATIONS" -maxdepth 1 -name '*.sql' | sort)

if [[ ${#PENDING[@]} -eq 0 ]]; then
  echo "The database is up to date."
  exit 0
fi

# A backup is only worth taking when there is already something to protect
HAVE_DATA=$(sql -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
if [[ $WITH_BACKUP -eq 1 && "$HAVE_DATA" -gt 0 ]]; then
  echo "Backing up before changing the database"
  /usr/local/bin/church-backup pre-migration
fi

for file in "${PENDING[@]}"; do
  name=$(basename "$file")
  echo "Applying $name"
  { echo "begin;"; cat "$file"; printf "\ninsert into ops.applied_migrations (name) values ('%s');\ncommit;\n" "$name"; } | sql -f -
done
# Tell the database interface (PostgREST) to notice the new tables and functions
sql -c "notify pgrst, 'reload schema'"
echo "Applied ${#PENDING[@]} database change(s)."
