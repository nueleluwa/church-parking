# Putting the app on the server

The app runs on an Ubuntu 24.04 server at **churchparking.online**, behind Cloudflare. PM2 keeps the app and its database interface running (decisions D-09 and D-23).

```
phone → Cloudflare → nginx (https) → the app (127.0.0.1, PM2) → PostgREST (127.0.0.1, PM2) → PostgreSQL 16 (127.0.0.1, system service)
```

Every push to `main` that passes the checks is put live automatically by GitHub Actions. Nothing but nginx is reachable from the internet.

## Sharing the server with other sites

The scripts are written to leave other things alone. Unless you say `--fresh-server` they:

- do not reset or enable the firewall, update the system, or change the system's Node or nginx defaults;
- install their own Node 24 in `/opt/node24`, used only by the `deploy` user;
- choose **free ports** (starting from 3100, 3200, 3300 and 5433) and keep them in `/srv/church-parking/shared/ports.json`;
- touch nginx only for `churchparking.online` and `www.churchparking.online`;
- give the database its **own** PostgreSQL cluster (named `church`) so any existing database is not touched.

Look first, change nothing: `ssh user@server 'bash -s' < deploy/inspect-server.sh`.

## What is where on the server

| Path | What |
|---|---|
| `/srv/church-parking/current` | the running version (a link to a folder in `releases/`) |
| `/srv/church-parking/releases/` | the last 4 versions, for a quick rollback |
| `/srv/church-parking/shared/.env.production.local` | the secrets, all made on the server. Never committed |
| `/srv/church-parking/shared/ports.json` | the ports chosen for this server |
| `/srv/church-parking/shared/deployed-sha`, `deploy.log` | which commit is live, and when each deploy happened |
| `/etc/ssl/churchparking/origin.pem`, `origin.key` | the Cloudflare Origin certificate and its key |
| `/etc/nginx/conf.d/churchparking.conf`, `church-rest-proxy.conf` | the nginx site, and the local-only door to the database interface |
| `/usr/local/bin/church-deploy`, `church-backup` | the deploy launcher (the only thing GitHub's key can run) and the backup tool, owned by root |
| `/var/backups/church-parking/` | database backups |
| `/home/deploy/.pm2/logs/` | the app's logs (trimmed to 14 days) |

## One-time set-up

1. **Cloudflare.** DNS: `A` records for `churchparking.online` and `www` pointing at the server, proxied (orange cloud). SSL/TLS mode **Full (strict)**. Turn on Always Use HTTPS. Turn **off** Rocket Loader and Auto Minify.
2. **Certificate.** A Cloudflare **Origin CA server certificate** for `churchparking.online` and `*.churchparking.online`. Put it in `/etc/ssl/churchparking/origin.pem` and the key in `origin.key`. `provision.sh` checks that it is a server certificate (not a client one), covers the name, has not expired and matches its key, and refuses it otherwise.
3. **Copy the repository to the server** (readable by every user, for example `/opt/church-setup`; not `/root`):
   ```
   git archive --format=tar.gz -o church.tgz HEAD
   scp church.tgz user@server:/tmp/ && ssh user@server 'sudo mkdir -p /opt/church-setup && sudo tar -xzf /tmp/church.tgz -C /opt/church-setup'
   ```
4. **Provision** (as root): `sudo bash /opt/church-setup/deploy/provision.sh --ci-public-key "<GitHub deploy public key>"`. This also installs the database (`deploy/db/install-db.sh`): PostgreSQL, PostgREST under PM2, the local door, the tables and functions, and the nightly backup. It prints the ports it chose and a final check.
5. **Read-only key for the server.** `provision.sh` prints a public key at the end. Add it in GitHub, repository Settings, Deploy keys, **without** write access.
6. **GitHub secrets** (repository Settings, Environments, `production`): `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_PORT` (if not 22), `VPS_SSH_KEY` (the private half of the deploy key), `VPS_KNOWN_HOSTS` (the server's host key line). Optional variable `PUBLIC_URL` = `https://churchparking.online` makes a deploy check the live site afterwards. Add **Required reviewers** to the `production` environment if you want someone to approve each deploy.
7. **First deploy, then the first admin.** Push to `main` (or run `sudo -iu deploy church-deploy <40-character commit id>`). Then add `ADMIN_PHONE` and `ADMIN_PASSWORD` to the settings file, run
   `sudo -iu deploy bash -c 'cd /srv/church-parking/current && node --env-file=/srv/church-parking/shared/.env.production.local scripts/seed-admin.ts'`
   and remove the two lines again.

## Day to day

- **Deploy:** push to `main`. The checks run, then the server fetches that exact commit, builds it, applies any database changes (after a backup), switches over, and checks that the app answers. If a database change fails, nothing is switched. If the new version does not start, the previous one is put back and the deploy shows red.
- **Roll back:** Actions, Run workflow, with an older commit's id. Database changes are not undone by a rollback, so keep each change safe for the version before it; if one must be undone, restore the pre-change backup (below).
- **Look at it:** `sudo -iu deploy pm2 status` (two programs: `church-parking`, `church-postgrest`), `sudo -iu deploy pm2 logs church-parking`, `cat /srv/church-parking/shared/deployed-sha`.
- **Backups:** nightly at 02:15, 14 kept, plus one before each database change. They are on this server's disk, so **also copy them elsewhere**: put a script at `/srv/church-parking/shared/offsite.sh` that takes the backup's path and sends it somewhere (for example `rclone copy "$1" remote:church-parking`); it is run after every backup.
- **Restore** (stops the app first): `sudo -iu deploy pm2 stop church-parking`, then `pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL>" /var/backups/church-parking/<file>.dump`, then start the app again. Practise this once on a copy before you need it.
- **Renew the certificate:** replace the two files in `/etc/ssl/churchparking/` and run `provision.sh` again.
- **Security updates:** PostgreSQL and the system are the church's to keep up to date: `sudo apt update && sudo apt upgrade` regularly.

## Things this setup does on purpose

- The app, PostgREST and PostgreSQL all listen on `127.0.0.1` only.
- nginx believes the visitor address Cloudflare reports only for requests that really come from Cloudflare, then hands it to the app as `X-Real-IP`, which the app's rate limits read (docs/security.md). Any such header sent by a visitor is thrown away.
- Pass links (`/p/...`) hold a secret token, so nginx never writes them to the access log.
- GitHub's key can run exactly one command (`church-deploy`), and that command deploys only commits that are on `main`.
- The database's own owner role runs migrations; the app uses a separate key that PostgREST turns into the `service_role` role. The public (`anon`) role can see nothing.
