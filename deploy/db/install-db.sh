#!/usr/bin/env bash
# Puts the app's database on THIS server (decision D-23), in place of the hosted Supabase service.
# Run by provision.sh (or by hand as root). Safe to run again: it keeps what already exists.
#
# What is installed, and who runs it:
#   - PostgreSQL 16 in its OWN cluster named "church" on its own port, listening on 127.0.0.1 only. It is a
#     system service (systemd), not PM2: PM2 keeps Node programs running, it cannot run a database.
#     Any other PostgreSQL on this server is not touched.
#   - PostgREST, a small program that turns the database into the web interface the app already speaks
#     (the same one the hosted Supabase gave us). It is run by PM2, as the `deploy` user.
#   - a small nginx door on 127.0.0.1 so the app's usual /rest/v1/ address reaches PostgREST.
#   - the same tables and functions as before, applied from supabase/migrations/ by migrate.sh.
#   - a nightly backup (backup.sh).
# Nothing here is reachable from the internet: every port is on 127.0.0.1.
set -euo pipefail

APP_USER=deploy
APP_DIR=/srv/church-parking
NODE_DIR=/opt/node24
PG_VERSION=16
PG_CLUSTER=church
DB_NAME=churchparking
POSTGREST_VERSION=v16.4
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$HERE/../.." && pwd)
PORTS="$APP_DIR/shared/ports.json"
ENV_FILE="$APP_DIR/shared/.env.production.local"
export PATH="$NODE_DIR/bin:$PATH"
export DEBIAN_FRONTEND=noninteractive

[[ $(id -u) -eq 0 ]] || { echo "Run this as root (sudo)." >&2; exit 1; }
[[ -f "$PORTS" ]] || { echo "Run provision.sh first (it chooses the ports)." >&2; exit 1; }
PG_PORT=$(node -p "require('$PORTS').pg")
REST_PORT=$(node -p "require('$PORTS').rest")
PROXY_PORT=$(node -p "require('$PORTS').restProxy")
step() { printf '\n-- %s\n' "$*"; }
rand() { openssl rand -hex "$1"; }
psql_super() { sudo -u postgres psql -p "$PG_PORT" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Settings file helper: set KEY=value, replacing any earlier line; never prints values
touch "$ENV_FILE"; chown "$APP_USER:$APP_USER" "$ENV_FILE"; chmod 600 "$ENV_FILE"
get_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
set_env() {
  local k=$1 v=$2
  if grep -qE "^$k=" "$ENV_FILE"; then
    local tmp; tmp=$(mktemp); awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$ENV_FILE" >"$tmp"; cat "$tmp" >"$ENV_FILE"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$k" "$v" >>"$ENV_FILE"
  fi
}

step "PostgreSQL $PG_VERSION and the pg_cron add-on (a separate cluster, other databases untouched)"
# Stop the installer from creating a default cluster on the usual port if none exists yet
if [[ ! -f /etc/postgresql-common/createcluster.conf ]] || ! grep -q '^create_main_cluster' /etc/postgresql-common/createcluster.conf; then
  mkdir -p /etc/postgresql-common
  echo "create_main_cluster = false" >>/etc/postgresql-common/createcluster.conf
fi
apt-get install -y -qq --no-upgrade "postgresql-$PG_VERSION" "postgresql-$PG_VERSION-cron" "postgresql-client-$PG_VERSION"

if ! pg_lsclusters -h | awk '{print $1" "$2}' | grep -qx "$PG_VERSION $PG_CLUSTER"; then
  pg_createcluster "$PG_VERSION" "$PG_CLUSTER" --port "$PG_PORT" --start-conf=auto -- --auth-host=scram-sha-256 --auth-local=peer --encoding=UTF8
fi
CONF_DIR="/etc/postgresql/$PG_VERSION/$PG_CLUSTER/conf.d"
mkdir -p "$CONF_DIR"
SHARED_MB=$(awk '/MemTotal/ {m=int($2/1024/8); if (m<64) m=64; if (m>512) m=512; print m}' /proc/meminfo)
cat >"$CONF_DIR/church.conf" <<EOF
# Written by deploy/db/install-db.sh
listen_addresses = '127.0.0.1'
port = $PG_PORT
password_encryption = scram-sha-256
max_connections = 40
shared_buffers = ${SHARED_MB}MB
timezone = 'UTC'
shared_preload_libraries = 'pg_cron'
cron.database_name = '$DB_NAME'
cron.use_background_workers = on
max_worker_processes = 16
EOF
systemctl enable "postgresql@$PG_VERSION-$PG_CLUSTER" >/dev/null 2>&1 || true
pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" restart
for _ in $(seq 1 20); do pg_isready -q -p "$PG_PORT" -h 127.0.0.1 && break; sleep 1; done
pg_isready -p "$PG_PORT" -h 127.0.0.1

step "Roles and the database"
AUTH_PW=$(get_env POSTGREST_AUTHENTICATOR_PASSWORD); [[ -n "$AUTH_PW" ]] || { AUTH_PW=$(rand 24); set_env POSTGREST_AUTHENTICATOR_PASSWORD "$AUTH_PW"; }
OWNER_PW=$(get_env DB_OWNER_PASSWORD);              [[ -n "$OWNER_PW" ]] || { OWNER_PW=$(rand 24); set_env DB_OWNER_PASSWORD "$OWNER_PW"; }
# The roles the hosted service provided, which the existing migrations refer to.
psql_super <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'church_owner')  then create role church_owner login; end if;
end
\$\$;
alter role authenticator password '$AUTH_PW';
alter role church_owner  password '$OWNER_PW';
grant anon, authenticated, service_role to authenticator;
SQL
if ! psql_super -tAc "select 1 from pg_database where datname = '$DB_NAME'" | grep -q 1; then
  psql_super -c "create database $DB_NAME owner church_owner encoding 'UTF8'"
fi
psql_super -d "$DB_NAME" <<SQL
create extension if not exists pg_cron;
grant usage on schema cron to church_owner;
revoke all on schema public from public;
grant usage, create on schema public to church_owner;
grant usage on schema public to anon, authenticated, service_role;
-- Everything church_owner creates (by the migrations) is usable by the app's role, and by nobody else.
alter default privileges for role church_owner in schema public grant all on tables    to service_role;
alter default privileges for role church_owner in schema public grant all on sequences to service_role;
alter default privileges for role church_owner in schema public grant all on functions to service_role;
SQL

step "Service key and settings for the app"
JWT_SECRET=$(get_env POSTGREST_JWT_SECRET); [[ -n "$JWT_SECRET" ]] || { JWT_SECRET=$(rand 32); set_env POSTGREST_JWT_SECRET "$JWT_SECRET"; }
if [[ -z "$(get_env SUPABASE_SERVICE_ROLE_KEY)" ]]; then
  KEY=$(JWT_SECRET="$JWT_SECRET" node -e '
    const c = require("crypto"), b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = b({ alg: "HS256", typ: "JWT" }) + "." + b({ role: "service_role", iss: "church-parking", iat: now, exp: now + 10 * 365 * 86400 });
    process.stdout.write(body + "." + c.createHmac("sha256", process.env.JWT_SECRET).update(body).digest("base64url"));')
  set_env SUPABASE_SERVICE_ROLE_KEY "$KEY"
fi
set_env SUPABASE_URL "http://127.0.0.1:$PROXY_PORT"
set_env DATABASE_URL "postgres://church_owner:$OWNER_PW@127.0.0.1:$PG_PORT/$DB_NAME"
[[ -n "$(get_env SESSION_SECRET)" ]] || set_env SESSION_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
[[ -n "$(get_env APP_URL)" ]] || set_env APP_URL "https://churchparking.online"
echo "Settings written to $ENV_FILE (secrets generated on this server, never shown)."

step "PostgREST $POSTGREST_VERSION, run by PM2"
ARCH=$(uname -m); case "$ARCH" in x86_64) PARCH=x86-64 ;; aarch64) PARCH=aarch64 ;; *) echo "Unsupported CPU: $ARCH" >&2; exit 1 ;; esac
if [[ ! -x /opt/postgrest/postgrest ]] || ! /opt/postgrest/postgrest --version | grep -q "${POSTGREST_VERSION#v}"; then
  mkdir -p /opt/postgrest
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-$PARCH.tar.xz" -o /tmp/postgrest.tar.xz
  tar -xJf /tmp/postgrest.tar.xz -C /opt/postgrest && rm -f /tmp/postgrest.tar.xz
  chmod 755 /opt/postgrest/postgrest
fi
/opt/postgrest/postgrest --version
cat >"$APP_DIR/shared/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:$AUTH_PW@127.0.0.1:$PG_PORT/$DB_NAME"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
db-pool = 10
log-level = "warn"
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/shared/postgrest.conf"; chmod 600 "$APP_DIR/shared/postgrest.conf"
cat >"$APP_DIR/shared/ecosystem.postgrest.cjs" <<EOF
// How PM2 runs PostgREST. Written by deploy/db/install-db.sh. Not touched by deploys of the app.
module.exports = {
  apps: [
    {
      name: "church-postgrest",
      script: "/opt/postgrest/postgrest",
      args: "$APP_DIR/shared/postgrest.conf",
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 2000,
      time: true,
      out_file: "/home/$APP_USER/.pm2/logs/church-postgrest-out.log",
      error_file: "/home/$APP_USER/.pm2/logs/church-postgrest-error.log",
      merge_logs: true,
    },
  ],
};
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/shared/ecosystem.postgrest.cjs"
sudo -iu "$APP_USER" bash -c "pm2 startOrReload $APP_DIR/shared/ecosystem.postgrest.cjs >/dev/null && pm2 save >/dev/null"

step "The local door on 127.0.0.1:$PROXY_PORT"
sed -e "s/__REST_PROXY_PORT__/$PROXY_PORT/g" -e "s/__REST_PORT__/$REST_PORT/g" "$REPO_ROOT/deploy/nginx/church-rest-proxy.conf" >/etc/nginx/conf.d/church-rest-proxy.conf
if nginx -t; then
  systemctl reload nginx
else
  echo "nginx does not accept the local door settings. Removing them so the other sites are not affected." >&2
  rm -f /etc/nginx/conf.d/church-rest-proxy.conf
  exit 1
fi

step "Database tables and functions (the migrations)"
install -m 755 "$HERE/backup.sh" /usr/local/bin/church-backup
install -d -o "$APP_USER" -g "$APP_USER" -m 700 /var/backups/church-parking
sudo -u "$APP_USER" env PATH="$PATH" bash "$HERE/migrate.sh"

step "Nightly backup at 02:15"
printf '15 2 * * * %s /usr/local/bin/church-backup nightly >>/var/backups/church-parking/backup.log 2>&1\n' "$APP_USER" >/etc/cron.d/church-parking-backup
chmod 644 /etc/cron.d/church-parking-backup

step "Check: ask the database interface for the car parks, the way the app does"
SERVICE_KEY=$(get_env SUPABASE_SERVICE_ROLE_KEY)
curl -fsS --max-time 10 -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  "http://127.0.0.1:$PROXY_PORT/rest/v1/areas?select=slug,name&order=sort" && echo
# And the public (anonymous) role must see nothing at all
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$PROXY_PORT/rest/v1/areas?select=slug")
echo "Without the key the request is refused (expected 401): $CODE"
echo "Database ready."
