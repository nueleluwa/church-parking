#!/usr/bin/env bash
# Takes a backup of the app's database. Installed as /usr/local/bin/church-backup and run every night by cron.
#
#   church-backup nightly           kept for 14 days
#   church-backup pre-migration     taken before a database change, the last 10 are kept
#
# A backup that stays on the same server is not enough if the server's disk is lost. If the file
# /srv/church-parking/shared/offsite.sh exists, it is run after each backup with the backup's path, so a
# copy can be sent somewhere else (see deploy/README.md).
set -euo pipefail
export PATH=/opt/node24/bin:$PATH

KIND="${1:-nightly}"
APP_DIR=/srv/church-parking
DEST=/var/backups/church-parking
ENV_FILE="$APP_DIR/shared/.env.production.local"
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[[ -n "$DATABASE_URL" ]] || { echo "DATABASE_URL is not set in $ENV_FILE" >&2; exit 66; }

mkdir -p "$DEST"
FILE="$DEST/church-$KIND-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --file "$FILE.partial"
# A backup that cannot be read back is worth nothing, so check it before keeping it
pg_restore --list "$FILE.partial" >/dev/null
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"
echo "$(date -u +%FT%TZ) $KIND backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the recent ones
case "$KIND" in
  nightly)       ls -1t "$DEST"/church-nightly-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f ;;
  pre-migration) ls -1t "$DEST"/church-pre-migration-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f ;;
esac

if [[ -x "$APP_DIR/shared/offsite.sh" ]]; then
  "$APP_DIR/shared/offsite.sh" "$FILE" || echo "The off-server copy failed." >&2
fi
