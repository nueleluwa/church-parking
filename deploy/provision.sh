#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 server to run the church parking app behind Cloudflare, with PM2 (decision D-09).
# Safe to run again: each step checks what is already done. Run as root, from a checkout of this repository:
#
#   sudo bash deploy/provision.sh [--ci-public-key "ssh-ed25519 AAAA... github-actions"] [--ssh-port 22]
#                                 [--lock-firewall-to-cloudflare] [--authenticated-origin-pulls]
#
# What it does: updates the system, installs nginx / Node 24 / pnpm / PM2, makes a `deploy` user that
# runs the app, installs the deploy launcher and locks the GitHub key to it, sets up nginx (https if a
# server certificate is in place), the firewall, fail2ban and automatic security updates.
# It does NOT change how you log in over SSH, so it cannot lock you out.
set -euo pipefail

DOMAIN=churchparking.online
APP_USER=deploy
APP_DIR=/srv/church-parking
NODE_MAJOR=24
PNPM_VERSION=12.10.1
CERT_DIR=/etc/ssl/churchparking
SSH_PORT=22
CI_PUBKEY=""
LOCK_CF=0
AOP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci-public-key) CI_PUBKEY="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --lock-firewall-to-cloudflare) LOCK_CF=1; shift ;;
    --authenticated-origin-pulls) AOP=1; shift ;;
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

step "System packages"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq nginx curl git ufw fail2ban unattended-upgrades ca-certificates gnupg rsync openssl logrotate

step "Swap (small servers run out of memory while building)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ $MEM_MB -lt 3000 && -z "$(swapon --show --noheadings)" ]]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "Added 2 GB of swap (memory is ${MEM_MB} MB)."
else
  echo "Not needed."
fi

step "Node.js $NODE_MAJOR, pnpm $PNPM_VERSION and PM2"
if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') != "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
npm install -g --silent "pnpm@${PNPM_VERSION}" pm2
node -v; pnpm -v; pm2 -v

step "The $APP_USER user and folders"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "Church Parking app" "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR" "$APP_DIR/releases"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$APP_DIR/shared"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "/home/$APP_USER/.ssh"
if [[ ! -f "/home/$APP_USER/.ssh/id_ed25519" ]]; then
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N "" -C "church-parking-server-read-only" -f "/home/$APP_USER/.ssh/id_ed25519"
fi
sudo -u "$APP_USER" bash -c 'ssh-keyscan -t ed25519,rsa github.com 2>/dev/null >> ~/.ssh/known_hosts; sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts'
if [[ ! -f "$APP_DIR/shared/.env.production.local" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 600 "$HERE/env.production.example" "$APP_DIR/shared/.env.production.local"
  echo "Created $APP_DIR/shared/.env.production.local from the example: it must be filled in."
fi

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

step "PM2 starts by itself after a reboot, and its logs are trimmed"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null
sudo -iu "$APP_USER" bash -c 'pm2 install pm2-logrotate >/dev/null 2>&1; pm2 set pm2-logrotate:max_size 10M >/dev/null; pm2 set pm2-logrotate:retain 14 >/dev/null; pm2 save >/dev/null'

step "nginx"
install -d /etc/nginx/snippets /var/www/letsencrypt "$CERT_DIR"
install -m 755 "$HERE/update-cloudflare-ips.sh" /usr/local/sbin/church-update-cloudflare-ips
ln -sf /usr/local/sbin/church-update-cloudflare-ips /etc/cron.weekly/church-update-cloudflare-ips
rm -f /etc/nginx/sites-enabled/default
# nginx reads the snippet only when it exists, so create a harmless one first, then fill it in
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
if [[ $HTTPS -eq 1 ]]; then
  install -m 644 "$HERE/nginx/churchparking.conf" /etc/nginx/conf.d/churchparking.conf
  echo "https is on for $DOMAIN."
else
  install -m 644 "$HERE/nginx/churchparking-http.conf" /etc/nginx/conf.d/churchparking.conf
  echo "No usable server certificate yet: serving plain http only. Put origin.pem and origin.key in $CERT_DIR and run this script again."
fi
nginx -t
systemctl enable --now nginx
systemctl reload nginx

step "Firewall, fail2ban and automatic security updates"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
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
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' >/etc/apt/apt.conf.d/20auto-upgrades

step "Finished"
echo "1) Add this READ-ONLY deploy key to the GitHub repository (Settings, Deploy keys), if it is not there yet:"
cat "/home/$APP_USER/.ssh/id_ed25519.pub"
echo "2) Fill in $APP_DIR/shared/.env.production.local (production Supabase project)."
echo "3) First deploy: sudo -iu $APP_USER church-deploy <40-character commit id>   (or push to main once GitHub is set up)."
