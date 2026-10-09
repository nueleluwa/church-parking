#!/usr/bin/env bash
# READ-ONLY. Shows what is already on a server, so nothing is overwritten and free ports can be chosen.
# It changes nothing. Run it over SSH:   ssh user@server 'bash -s' < deploy/inspect-server.sh
set -uo pipefail

section() { printf '\n===== %s =====\n' "$*"; }

section "System"
. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}"
uname -r
echo "Memory:  $(free -h | awk '/Mem:/ {print $2 " total, " $7 " available"}')   Swap: $(free -h | awk '/Swap:/ {print $2}')"
echo "Disk /:  $(df -h / | awk 'NR==2 {print $2 " total, " $4 " free (" $5 " used)"}')"
echo "CPUs:    $(nproc)"
echo "Uptime:  $(uptime -p)"

section "Everything listening for connections (port, who)"
ss -ltnpH 2>/dev/null | awk '{print $4 "   " $6}' | sort -t: -k2 -n | head -60 || true

section "Web server: nginx"
if command -v nginx >/dev/null; then
  nginx -v 2>&1
  echo "-- sites (server_name, listen) in /etc/nginx"
  grep -rhE '^\s*(server_name|listen)\s' /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | sed 's/^\s*//' | sort | uniq -c | sort -rn | head -30
  echo "-- default_server already taken?"
  grep -rn 'default_server' /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | head
  echo "-- real_ip / Cloudflare settings already there?"
  grep -rln 'set_real_ip_from\|real_ip_header' /etc/nginx 2>/dev/null | head
  echo "-- files"
  ls -1 /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null
else
  echo "nginx is not installed."
fi
command -v apache2 >/dev/null && echo "Apache is installed." || true
command -v caddy >/dev/null && echo "Caddy is installed." || true

section "Node and PM2 (all users)"
command -v node >/dev/null && echo "system node: $(node -v)" || echo "no system node"
command -v pm2 >/dev/null && echo "pm2: $(pm2 -v 2>/dev/null)" || echo "no pm2 on this user's PATH"
for home in /root /home/*; do
  [[ -d "$home/.pm2" ]] || continue
  echo "-- PM2 data found for $home"
  ls "$home/.pm2" 2>/dev/null | head -5
done
ps -eo user,pid,args 2>/dev/null | grep -E 'PM2|pm2' | grep -v grep | head
ls /etc/systemd/system 2>/dev/null | grep -i pm2

section "Databases"
command -v psql >/dev/null && psql --version || echo "psql client: none"
systemctl list-units --type=service --all 2>/dev/null | grep -iE 'postgres|mysql|maria|mongo|redis' | head
pg_lsclusters 2>/dev/null || true
ls /usr/lib/postgresql 2>/dev/null

section "Docker"
command -v docker >/dev/null && { docker --version; docker ps --format '{{.Names}}  {{.Ports}}' 2>/dev/null | head -20; } || echo "no docker"

section "Firewall"
command -v ufw >/dev/null && ufw status verbose 2>/dev/null | head -20 || echo "no ufw"
command -v fail2ban-client >/dev/null && echo "fail2ban installed" || true

section "People and scheduled jobs"
echo "Users with a login shell: $(awk -F: '$7 ~ /(bash|sh|zsh)$/ {printf "%s ", $1}' /etc/passwd)"
id deploy 2>/dev/null && echo "A user named deploy ALREADY EXISTS" || echo "no user named deploy"
ls /etc/cron.d 2>/dev/null | head
ls -d /srv/* /opt/* 2>/dev/null | head -20

section "Domain and certificate files already here"
ls -d /etc/ssl/churchparking /etc/letsencrypt/live/* 2>/dev/null | head

section "Free ports (first free in each range we might use)"
used=$(ss -ltnH 2>/dev/null | awk '{n=split($4,a,":"); print a[n]}' | sort -un)
firstfree() { local p=$1; while grep -qx "$p" <<<"$used"; do p=$((p+1)); done; echo "$p"; }
echo "app: $(firstfree 3100)   rest: $(firstfree 3200)   rest-proxy: $(firstfree 3300)   postgres: $(firstfree 5433)"
