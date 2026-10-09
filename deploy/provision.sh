#!/usr/bin/env bash
# Prepares an Ubuntu 24.04 server to run the church parking app behind Cloudflare, with PM2 (decision D-09),
# and its own database (decision D-23, see deploy/db/install-db.sh). Safe to run again.
#
# It is written to share a server with other sites. By default it:
#   - does NOT reset or enable the firewall, update the system, or change the system's Node or nginx defaults;
#   - installs its own Node 24 in /opt/node24, used only by the `deploy` user;
#   - picks free ports for itself (shown at the end) instead of fixed ones;
#   - touches nginx only for churchparking.online and www.churchparking.online.
# Run `deploy/inspect-server.sh` first to see what is already there.
#
# Run as root from a full checkout of this repository:
#   sudo bash deploy/provision.sh --ci-public-key "ssh-ed25519 AAAA... github-actions"
#
# Options:
#   --fresh-server                   the server is for this app alone: also update the system, reset and enable
#                                    the firewall, add fail2ban and automatic updates, and add a catch-all nginx block
#   --lock-firewall-to-cloudflare    open ports 80/443 to Cloudflare only (needs the firewall; use with --fresh-server)
#   --authenticated-origin-pulls     accept only connections that really come from Cloudflare
#   --app-port N --rest-port N --proxy-port N --pg-port N     choose ports by hand
#   --skip-db                        do not set up the database
set -euo pipefail

DOMAIN=churchparking.online
APP_USER=deploy
APP_DIR=/srv/church-parking
NODE_DIR=/opt/node24
NODE_MAJOR=24
PNPM_VERSION=12.10.1
CERT_DIR=/etc/ssl/churchparking
CI_PUBKEY=""
FRESH=0
LOCK_CF=0
AOP=0
SKIP_DB=0
APP_PORT=""; REST_PORT=""; PROXY_PORT=""; PG_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci-public-key) CI_PUBKEY="$2"; shift 2 ;;
    --fresh-server) FRESH=1; shift ;;
    --lock-firewall-to-cloudflare) LOCK_CF=1; shift ;;
    --authenticated-origin-pulls) AOP=1; shift ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --rest-port) REST_PORT="$2"; shift 2 ;;
    --proxy-port) PROXY_PORT="$2"; shift 2 ;;
    --pg-port) PG_PORT="$2"; shift 2 ;;
    --skip-db) SKIP_DB=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
done

[[ $(id -u) -eq 0 ]] || { echo "Run this as root (sudo)." >&2; exit 1; }
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  echo "Warning: written for Ubuntu 24.04, this is ${PRETTY_NAME:-unknown}. Continuing in 10 seconds (Ctrl-C to stop)." >&2
  sleep 10
fi
step() { printf '\n== %s\n' "$*"; }
export DEBIAN_FRONTEND=noninteractive

step "Packages we need (nothing is upgraded unless --fresh-server)"
apt-get update -qq
if [[ $FRESH -eq 1 ]]; then apt-get upgrade -y -qq; fi
apt-get install -y -qq curl git openssl rsync ca-certificates xz-utils nginx

step "Swap (small servers run out of memory while building)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ $MEM_MB -lt 3000 && -z "$(swapon --show --noheadings)" ]]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "Added 2 GB of swap (memory is ${MEM_MB} MB)."
else
  echo "Not needed (memory ${MEM_MB} MB, swap already present or plenty of memory)."
fi

step "Our own Node.js $NODE_MAJOR in $NODE_DIR (the system's Node is left alone), pnpm $PNPM_VERSION and PM2"
if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  ARCH=$(uname -m); case "$ARCH" in x86_64) NARCH=x64 ;; aarch64) NARCH=arm64 ;; *) echo "Unsupported CPU: $ARCH" >&2; exit 1 ;; esac
  BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  FILE=$(curl -fsS "$BASE/" | grep -o "node-v${NODE_MAJOR}\.[0-9.]*-linux-${NARCH}\.tar\.xz" | head -1)
  [[ -n "$FILE" ]] || { echo "Could not find the Node $NODE_MAJOR download." >&2; exit 1; }
  curl -fsS "$BASE/$FILE" -o /tmp/node.tar.xz
  curl -fsS "$BASE/SHASUMS256.txt" | grep " $FILE\$" | sed "s# $FILE# /tmp/node.tar.xz#" | sha256sum -c - >/dev/null
  mkdir -p "$NODE_DIR" && tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1 && rm -f /tmp/node.tar.xz
fi
export PATH="$NODE_DIR/bin:$PATH"
npm install -g --silent "pnpm@${PNPM_VERSION}" pm2
echo "node $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v)"

step "The $APP_USER user and folders"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "Church Parking app" "$APP_USER"
grep -q "$NODE_DIR/bin" "/home/$APP_USER/.profile" 2>/dev/null || echo "export PATH=$NODE_DIR/bin:\$PATH" >>"/home/$APP_USER/.profile"
grep -q "$NODE_DIR/bin" "/home/$APP_USER/.bashrc" 2>/dev/null || sed -i "1i export PATH=$NODE_DIR/bin:\$PATH" "/home/$APP_USER/.bashrc"
chown "$APP_USER:$APP_USER" "/home/$APP_USER/.profile" "/home/$APP_USER/.bashrc"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR" "$APP_DIR/releases"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$APP_DIR/shared"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "/home/$APP_USER/.ssh"
if [[ ! -f "/home/$APP_USER/.ssh/id_ed25519" ]]; then
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N "" -C "church-parking-server-read-only" -f "/home/$APP_USER/.ssh/id_ed25519"
fi
sudo -u "$APP_USER" bash -c 'ssh-keyscan -t ed25519,rsa github.com 2>/dev/null >> ~/.ssh/known_hosts; sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts'

step "Ports (free ones on this server, kept the same on every run)"
PORTS="$APP_DIR/shared/ports.json"
used() { ss -ltnH 2>/dev/null | awk '{n=split($4,a,":"); print a[n]}' | sort -un; }
first_free() { local p=$1 taken; taken=$(used); while grep -qx "$p" <<<"$taken" || grep -qx "$p" <<<"${CLAIMED:-}"; do p=$((p+1)); done; CLAIMED="${CLAIMED:-}"$'\n'"$p"; echo "$p"; }
if [[ -f "$PORTS" ]]; then
  read -r EXIST_APP EXIST_REST EXIST_PROXY EXIST_PG < <(node -p "const p=require('$PORTS');[p.app,p.rest,p.restProxy,p.pg].join(' ')")
  APP_PORT=${APP_PORT:-$EXIST_APP}; REST_PORT=${REST_PORT:-$EXIST_REST}; PROXY_PORT=${PROXY_PORT:-$EXIST_PROXY}; PG_PORT=${PG_PORT:-$EXIST_PG}
else
  APP_PORT=${APP_PORT:-$(first_free 3100)}; REST_PORT=${REST_PORT:-$(first_free 3200)}
  PROXY_PORT=${PROXY_PORT:-$(first_free 3300)}; PG_PORT=${PG_PORT:-$(first_free 5433)}
fi
printf '{"app":%s,"rest":%s,"restProxy":%s,"pg":%s}\n' "$APP_PORT" "$REST_PORT" "$PROXY_PORT" "$PG_PORT" >"$PORTS"
chown "$APP_USER:$APP_USER" "$PORTS"
echo "app $APP_PORT, database interface $REST_PORT (behind the local door on $PROXY_PORT), database $PG_PORT. All on 127.0.0.1 only."

step "The deploy launcher, and the GitHub key locked to it"
install -o root -g root -m 755 "$HERE/church-deploy.sh" /usr/local/bin/church-deploy
if [[ -n "$CI_PUBKEY" ]]; then
  AUTH="/home/$APP_USER/.ssh/authorized_keys"
  LINE="command=\"/usr/local/bin/church-deploy\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $CI_PUBKEY"
  touch "$AUTH"
  grep -qF "$CI_PUBKEY" "$AUTH" || echo "$LINE" >>"$AUTH"
  chown "$APP_USER:$APP_USER" "$AUTH"; chmod 600 "$AUTH"
  echo "GitHub can now run church-deploy as $APP_USER, and nothing else."
else
  echo "No --ci-public-key given: GitHub cannot deploy yet."
fi

step "PM2 (our own, run by $APP_USER) starts by itself after a reboot, and its logs are trimmed"
env PATH="$NODE_DIR/bin:/usr/bin:/bin" "$NODE_DIR/bin/pm2" startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null
sudo -iu "$APP_USER" bash -c 'pm2 install pm2-logrotate >/dev/null 2>&1; pm2 set pm2-logrotate:max_size 10M >/dev/null; pm2 set pm2-logrotate:retain 14 >/dev/null; pm2 save >/dev/null'

step "nginx (only our own domain)"
install -d /etc/nginx/snippets /var/www/letsencrypt "$CERT_DIR"
install -m 755 "$HERE/update-cloudflare-ips.sh" /usr/local/sbin/church-update-cloudflare-ips
ln -sf /usr/local/sbin/church-update-cloudflare-ips /etc/cron.weekly/church-update-cloudflare-ips
[[ -f /etc/nginx/snippets/cloudflare-realip.conf ]] || echo "# placeholder" >/etc/nginx/snippets/cloudflare-realip.conf
/usr/local/sbin/church-update-cloudflare-ips || echo "Could not fetch Cloudflare's addresses now; run church-update-cloudflare-ips later."

if [[ $AOP -eq 1 ]]; then
  curl -fsS https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem -o "$CERT_DIR/cloudflare-origin-pull-ca.pem"
  printf 'ssl_client_certificate %s/cloudflare-origin-pull-ca.pem;\nssl_verify_client on;\n' "$CERT_DIR" >/etc/nginx/snippets/church-aop.conf
  echo "Only connections from Cloudflare will be accepted (Authenticated Origin Pulls). Turn it on in Cloudflare too."
else
  [[ -f /etc/nginx/snippets/church-aop.conf ]] || echo "# Authenticated Origin Pulls are off" >/etc/nginx/snippets/church-aop.conf
fi

HTTPS=0
if [[ -f "$CERT_DIR/origin.pem" && -f "$CERT_DIR/origin.key" ]]; then
  chmod 644 "$CERT_DIR/origin.pem"; chmod 600 "$CERT_DIR/origin.key"; chown root:root "$CERT_DIR/origin.pem" "$CERT_DIR/origin.key"
  PROBLEM=""
  openssl x509 -in "$CERT_DIR/origin.pem" -noout -checkend 2592000 >/dev/null || PROBLEM="the certificate expires within 30 days or is not valid"
  openssl x509 -in "$CERT_DIR/origin.pem" -noout -ext extendedKeyUsage 2>/dev/null | grep -q "TLS Web Server Authentication" || PROBLEM="this is not a server certificate (it cannot be used to serve a website)"
  openssl x509 -in "$CERT_DIR/origin.pem" -noout -checkhost "$DOMAIN" 2>/dev/null | grep -q "does match" || PROBLEM="the certificate does not cover $DOMAIN"
  [[ "$(openssl x509 -in "$CERT_DIR/origin.pem" -noout -modulus | openssl md5)" == "$(openssl rsa -in "$CERT_DIR/origin.key" -noout -modulus 2>/dev/null | openssl md5)" ]] || PROBLEM="the key does not belong to the certificate"
  if [[ -z "$PROBLEM" ]]; then HTTPS=1; else echo "Not using the certificate in $CERT_DIR: $PROBLEM." >&2; fi
fi
SRC="$HERE/nginx/churchparking-http.conf"; [[ $HTTPS -eq 1 ]] && SRC="$HERE/nginx/churchparking.conf"
sed "s/__APP_PORT__/$APP_PORT/g" "$SRC" >/etc/nginx/conf.d/churchparking.conf
[[ $HTTPS -eq 1 ]] && echo "https is on for $DOMAIN." || echo "No usable server certificate yet: serving plain http only. Put origin.pem and origin.key in $CERT_DIR and run this script again."
if [[ $FRESH -eq 1 ]]; then
  rm -f /etc/nginx/sites-enabled/default
  [[ $HTTPS -eq 1 ]] && install -m 644 "$HERE/nginx/catch-all.conf" /etc/nginx/conf.d/00-catch-all.conf
fi
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx

step "Firewall"
if [[ $FRESH -eq 1 ]]; then
  apt-get install -y -qq ufw fail2ban unattended-upgrades
  SSH_PORT=$(ss -ltnpH 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]; exit}'); SSH_PORT=${SSH_PORT:-22}
  ufw --force reset >/dev/null; ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
  ufw allow "${SSH_PORT}/tcp" >/dev/null
  if [[ $LOCK_CF -eq 1 ]]; then
    for family in ips-v4 ips-v6; do
      while IFS= read -r cidr; do
        [[ "$cidr" =~ ^[0-9a-fA-F:.]+/[0-9]+$ ]] && ufw allow from "$cidr" to any port 80,443 proto tcp >/dev/null
      done < <(curl -fsS "https://www.cloudflare.com/$family")
    done
    echo "Ports 80 and 443 are open to Cloudflare only."
  else
    ufw allow 80,443/tcp >/dev/null
  fi
  ufw --force enable >/dev/null
  systemctl enable --now fail2ban >/dev/null
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' >/etc/apt/apt.conf.d/20auto-upgrades
  echo "Firewall on (SSH on port $SSH_PORT, web ports open)."
else
  echo "Left exactly as it is (shared server). Our app, database and database interface listen on 127.0.0.1 only,"
  echo "so no new port is open to the internet. 80 and 443 are already served by nginx."
  command -v ufw >/dev/null && ufw status 2>/dev/null | head -3 || true
fi

if [[ $SKIP_DB -eq 0 ]]; then
  step "The database (deploy/db/install-db.sh)"
  bash "$HERE/db/install-db.sh"
fi

step "Finished"
echo "1) Add this READ-ONLY deploy key to the GitHub repository (Settings, Deploy keys), if it is not there yet:"
cat "/home/$APP_USER/.ssh/id_ed25519.pub"
echo "2) Check $APP_DIR/shared/.env.production.local (ADMIN_PHONE and ADMIN_PASSWORD are only for the first admin)."
echo "3) First deploy: sudo -iu $APP_USER church-deploy <40-character commit id>   (or push to main once GitHub is set up)."
