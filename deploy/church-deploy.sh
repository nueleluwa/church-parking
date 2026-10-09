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
# Use from GitHub:  ssh deploy@server <40-character commit id>
# By hand:          sudo -iu deploy church-deploy <40-character commit id>
set -euo pipefail

# Our own Node (installed by provision.sh), whatever other versions the server has for other sites
export PATH=/opt/node24/bin:$PATH

APP_DIR=/srv/church-parking
REPO_URL=git@github.com:nueleluwa/church-parking.git
BRANCH=main
KEEP_RELEASES=4
PORT=$(node -p "require('$APP_DIR/shared/ports.json').app")

SHA="${1:-${SSH_ORIGINAL_COMMAND:-}}"
SHA="${SHA%% *}"
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
