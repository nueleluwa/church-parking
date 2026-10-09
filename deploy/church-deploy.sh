#!/usr/bin/env bash
# Deploys one commit of the app on this server. Installed by provision.sh as /usr/local/bin/church-deploy
# (owned by root, so the deploy user cannot change it) and run as the `deploy` user.
#
# It is the ONLY thing GitHub's deploy key is allowed to run (the key is locked to this command in
# ~deploy/.ssh/authorized_keys). So it checks everything itself:
#   - the commit is a full 40-character id,
#   - the commit is on the main branch (nothing else can be deployed, so an unmerged pull request can't go live),
#   - only one deploy runs at a time,
#   - the new version answers before it is left running, otherwise the previous version is put back.
#
# No deploy while people are parking: it is held (exit 79) while any active service is on, from 30 minutes
# before it starts until 30 minutes after it ends (Lagos time, read from the Services in the database). A
# scheduled GitHub job tries again until the window closes. "force" overrides the hold.
#
# Use from GitHub:  ssh deploy@server <40-character commit id> [force | if-newer]
# By hand:          sudo -iu deploy church-deploy <40-character commit id> [force | if-newer]
#   if-newer: do nothing at all when that commit is already live (used by the scheduled catch-up job)
#
# Exit codes: 0 done (or already live), 64 bad commit id, 65 commit not on main, 66 server not set up,
#             75 another deploy is running, 79 held because a service is on, 1 the new version did not start.
set -euo pipefail

# Our own Node (installed by provision.sh), whatever other versions the server has for other sites
export PATH=/opt/node24/bin:$PATH

APP_DIR=/srv/church-parking
REPO_URL=git@github.com:nueleluwa/church-parking.git
BRANCH=main
KEEP_RELEASES=4
PORT=$(node -p "require('$APP_DIR/shared/ports.json').app")

ARGS="${1:-${SSH_ORIGINAL_COMMAND:-}}"
[[ -n "${2:-}" ]] && ARGS="$ARGS $2"
read -r SHA MODE _ <<<"$ARGS"
MODE="${MODE:-}"
if [[ -n "$MODE" && "$MODE" != "force" && "$MODE" != "if-newer" ]]; then
  echo "Unknown option: $MODE (use force or if-newer)." >&2
  exit 64
fi
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Give the full 40-character commit id to deploy." >&2
  exit 64
fi

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# One deploy at a time
exec 9>"$APP_DIR/shared/deploy.lock"
if ! flock -n 9; then
  echo "Another deploy is running. Try again in a few minutes." >&2
  exit 75
fi

[[ -f "$APP_DIR/shared/.env.production.local" ]] || { echo "Missing $APP_DIR/shared/.env.production.local" >&2; exit 66; }

if [[ "$MODE" == "if-newer" && -f "$APP_DIR/shared/deployed-sha" && "$(cat "$APP_DIR/shared/deployed-sha")" == "$SHA" ]]; then
  echo "Version ${SHA:0:7} is already live. Nothing to do."
  exit 0
fi

# Hold the deploy while a service is on, so nobody loses their place mid check-in or at the exit
service_window_open() {
  local url n
  url=$(grep -E '^DATABASE_URL=' "$APP_DIR/shared/.env.production.local" | head -1 | cut -d= -f2-)
  [[ -n "$url" ]] || return 1
  n=$(psql "$url" -Atqc "select count(*) from services
        where active
          and name not like 'Test service%'  -- an all-day test service must not block deploys
          and weekday = extract(dow from (now() at time zone 'Africa/Lagos'))::int
          and (now() at time zone 'Africa/Lagos')::time between (starts_at - interval '30 minutes') and (ends_at + interval '30 minutes')" 2>/dev/null) || {
    echo "Could not read the service times; carrying on." >&2
    return 1
  }
  [[ "${n:-0}" -gt 0 ]]
}
if [[ "$MODE" != "force" ]] && service_window_open; then
  echo "A service is on (or about to start, or has just ended). Not deploying now: this version will go live by itself when the window closes."
  exit 79
fi

# Keep a local copy of the repository and bring it up to date
if [[ ! -d "$APP_DIR/repo" ]]; then
  log "Cloning the repository (first time)"
  git clone --quiet --mirror "$REPO_URL" "$APP_DIR/repo"
fi
log "Fetching the latest code"
git -C "$APP_DIR/repo" fetch --quiet --prune origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"

if ! git -C "$APP_DIR/repo" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  echo "That commit is not in the repository." >&2
  exit 65
fi
if ! git -C "$APP_DIR/repo" merge-base --is-ancestor "$SHA" "refs/heads/$BRANCH"; then
  echo "That commit is not on $BRANCH, so it will not be deployed." >&2
  exit 65
fi

STAMP=$(date -u +%Y%m%d%H%M%S)
REL="$APP_DIR/releases/$STAMP-${SHA:0:7}"
PREVIOUS=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)

log "Unpacking ${SHA:0:7} into $REL"
mkdir -p "$REL"
git -C "$APP_DIR/repo" archive "$SHA" | tar -x -C "$REL"
echo "$SHA" >"$REL/.deployed-sha"
ln -s "$APP_DIR/shared/.env.production.local" "$REL/.env.production.local"

cd "$REL"
log "Installing packages"
pnpm install --frozen-lockfile --reporter=append-only
log "Building"
pnpm build

# Changes to the database go in BEFORE the new version starts. If one fails, nothing has been switched yet,
# so the version that is running carries on. A backup is taken first whenever there is something to apply.
if [[ -x "$REL/deploy/db/migrate.sh" || -f "$REL/deploy/db/migrate.sh" ]]; then
  log "Checking for database changes"
  bash "$REL/deploy/db/migrate.sh" --with-backup
fi

# Keep the script and style files of every recent version, not just this one. A phone that opened the app before
# this deploy still asks for the OLD files, and if they are gone the app reloads the page on the person (which
# loses what they were doing). nginx serves these from here first. Files older than 30 days are removed.
if [[ -d "$REL/.next/static" ]]; then
  mkdir -p "$APP_DIR/static/_next/static"
  cp -a "$REL/.next/static/." "$APP_DIR/static/_next/static/"
  find "$APP_DIR/static/_next/static" -type f -mtime +30 -delete 2>/dev/null || true
  find "$APP_DIR/static/_next/static" -type d -empty -delete 2>/dev/null || true
fi

log "Switching to the new version"
ln -sfn "$REL" "$APP_DIR/current"
pm2 startOrReload "$REL/deploy/ecosystem.config.cjs" --update-env >/dev/null
pm2 save >/dev/null

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/staff/signin"; then return 0; fi
    sleep 2
  done
  return 1
}

if healthy; then
  log "The new version is answering."
else
  echo "The new version did not start. Putting the previous one back." >&2
  pm2 logs church-parking --lines 30 --nostream >&2 || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$APP_DIR/current"
    pm2 startOrReload "$PREVIOUS/deploy/ecosystem.config.cjs" --update-env >/dev/null
    pm2 save >/dev/null
    healthy && echo "The previous version is running again." >&2
  fi
  rm -rf "$REL"
  exit 1
fi

echo "$SHA" >"$APP_DIR/shared/deployed-sha"
printf '%s %s\n' "$(date -u +%FT%TZ)" "$SHA" >>"$APP_DIR/shared/deploy.log"

# Keep the last few versions for a quick rollback, remove the rest
mapfile -t OLD < <(ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)))
for dir in "${OLD[@]:-}"; do
  [[ -n "$dir" && "$dir" != "$PREVIOUS/" ]] && rm -rf "$dir"
done

log "Done. Version ${SHA:0:7} is live."
