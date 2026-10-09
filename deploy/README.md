# Putting the app on the server

The app runs on one Ubuntu 24.04 server at **churchparking.online**, behind Cloudflare, with PM2 keeping it running (decision D-09).

```
phone → Cloudflare → nginx (https, port 443) → the app (127.0.0.1:3000, run by PM2) → Supabase (production project)
```

Every push to `main` that passes the checks is put live automatically by GitHub Actions.

## What is where on the server

| Path | What |
|---|---|
| `/srv/church-parking/current` | the version that is running (a link to a folder in `releases/`) |
| `/srv/church-parking/releases/` | the last 4 versions, for a quick rollback |
| `/srv/church-parking/shared/.env.production.local` | the secrets (database key, session secret). Never committed |
| `/srv/church-parking/shared/deployed-sha`, `deploy.log` | which commit is live, and when each deploy happened |
| `/etc/ssl/churchparking/origin.pem` and `origin.key` | the Cloudflare Origin certificate and its key |
| `/etc/nginx/conf.d/churchparking.conf` | the nginx site |
| `/usr/local/bin/church-deploy` | the deploy launcher (owned by root). GitHub's key can run only this |
| `/home/deploy/.pm2/logs/` | the app's logs (trimmed to 14 days) |

## One-time set-up

1. **Cloudflare**
   - DNS: an `A` record for `churchparking.online` (and `www`) pointing at the server's address, orange cloud ON (proxied).
   - SSL/TLS: set the mode to **Full (strict)**. Turn on **Always Use HTTPS**.
   - Speed: turn **off** Rocket Loader and Auto Minify (they can break the page's scripts).
   - Optional hardening: turn on **Authenticated Origin Pulls**, then run `provision.sh --authenticated-origin-pulls`.
2. **Certificate.** Use a Cloudflare **Origin CA server certificate** for `churchparking.online` and `*.churchparking.online` (Cloudflare dashboard, SSL/TLS, Origin Server, Create Certificate). Put the certificate in `/etc/ssl/churchparking/origin.pem` and the private key in `origin.key`. `provision.sh` checks that it is a server certificate, covers the name, has not expired and matches its key, and refuses to use it otherwise. (A client certificate for Authenticated Origin Pulls is a different thing and cannot be used here.)
3. **Production database.** Create a **separate** Supabase project for production (never use the development one). Then, from your computer:
   ```
   pnpm exec supabase link --project-ref <PRODUCTION-REF>
   pnpm exec supabase db push
   ```
   Never run `db reset` against production. Check the `pg_cron` extension is on (Database, Extensions). Make sure the paid plan or backups are on, and that the project does not pause.
4. **Provision the server** (as root, from a copy of this repository's `deploy/` folder):
   ```
   sudo bash provision.sh --ci-public-key "<the GitHub deploy public key>" --lock-firewall-to-cloudflare
   ```
   Leave `--lock-firewall-to-cloudflare` off until the site works through Cloudflare, then run the script again with it on.
5. **Read-only key for the server.** `provision.sh` prints a public key at the end. Add it in GitHub, repository Settings, Deploy keys, **without** write access.
6. **Secrets.** Fill in `/srv/church-parking/shared/.env.production.local` (see `env.production.example`). Then create the first admin once: `pnpm db:seed-admin` with the production values, and take the password out of the file.
7. **GitHub secrets** (repository Settings, Environments, `production`): `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_PORT` (if not 22), `VPS_SSH_KEY` (the private half of the deploy key), `VPS_KNOWN_HOSTS` (the server's host key line). Optional variable `PUBLIC_URL` = `https://churchparking.online` makes the deploy check the live site afterwards. To make deploys wait for someone's approval, add **Required reviewers** to the `production` environment.

## Day to day

- **Deploy:** push to `main`. The checks run, then the server fetches that exact commit, builds it, switches over, and checks that it answers. If the new version does not start, the previous one is put back and the deploy shows red.
- **Roll back:** on the Actions page, Run workflow, and give the older commit's id. Or on the server: `sudo -iu deploy church-deploy <40-character commit id>`.
- **Look at it:** `sudo -iu deploy pm2 status`, `sudo -iu deploy pm2 logs church-parking`, `cat /srv/church-parking/shared/deployed-sha`.
- **Database changes** are not applied by a deploy. Run `supabase db push` against the production project yourself, **before** pushing code that needs them, and keep each change safe for the version that is still running.
- **Renew the certificate:** a Cloudflare Origin certificate lasts years. Replace the two files in `/etc/ssl/churchparking/` and run `sudo bash provision.sh` again.

## Things this setup does on purpose

- The app listens on `127.0.0.1` only. Nothing reaches it except through nginx.
- nginx believes the visitor address Cloudflare reports only for requests that really come from Cloudflare, then hands it to the app as `X-Real-IP`, which the app's rate limits read (docs/security.md). Any such header sent by a visitor is thrown away.
- Pass links (`/p/...`) hold a secret token, so nginx never writes them to the access log.
- Anyone who reaches the server by its bare address, or by another name, gets nothing.
- GitHub's key can run exactly one command (`church-deploy`), and that command deploys only commits that are on `main`.
- The server has no shell login for GitHub, no way to open other ports, and only a read-only key to fetch the code.
