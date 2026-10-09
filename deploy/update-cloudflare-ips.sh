#!/usr/bin/env bash
# Writes the list of Cloudflare's addresses for nginx, so nginx believes the visitor address Cloudflare
# reports (CF-Connecting-IP) only for requests that really come from Cloudflare. Run by provision.sh and weekly.
# If the list cannot be fetched, the old one stays in place.
set -euo pipefail

OUT=/etc/nginx/snippets/cloudflare-realip.conf
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

{
  echo "# Written by update-cloudflare-ips.sh on $(date -u +%F). Do not edit by hand."
  for family in ips-v4 ips-v6; do
    list=$(curl -fsS --max-time 20 "https://www.cloudflare.com/$family")
    while IFS= read -r cidr; do
      [[ -z "$cidr" ]] && continue
      # only accept things that look like an address range
      [[ "$cidr" =~ ^[0-9a-fA-F:.]+/[0-9]+$ ]] || { echo "Unexpected line in $family: $cidr" >&2; exit 1; }
      echo "set_real_ip_from $cidr;"
    done <<<"$list"
  done
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
} >"$TMP"

[[ $(grep -c '^set_real_ip_from' "$TMP") -ge 10 ]] || { echo "The Cloudflare list looks too short; keeping the old one." >&2; exit 1; }

install -m 644 "$TMP" "$OUT"
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx 2>/dev/null || true
fi
echo "Cloudflare addresses updated: $(grep -c '^set_real_ip_from' "$OUT") ranges."
