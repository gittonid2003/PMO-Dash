# AOne PMO — hosting steps

For the hosting team. Pick **A** (updating the server that already runs AOne
PMO) or **B** (brand-new server). Both use Docker; **C** is the no-Docker
alternative. Do **D** (HTTPS) once it's up.

If `./deploy.sh` says "Permission denied" (it can lose its executable flag
when copied through Windows), run `bash deploy.sh` instead.

**Needs:** a Linux server with Docker Engine and the Compose v2 plugin
(`docker compose version` should print a version), and port 3000 free
(or set another `PORT` in `.env`). If Docker needs `sudo` on the server,
put `sudo` in front of the commands below.

---

## A. Update the existing installation (keeps all accounts and data)

First, point `OLD` at the folder that holds the **currently running**
`docker-compose.yml` (its `.env` and `data/` folder are in there too):
```bash
OLD=/path/to/current/aone-pmo-cloud
ls "$OLD/docker-compose.yml" "$OLD/.env"     # both must be listed
```

1. Stop the running app (the database files stay on disk):
   ```bash
   cd "$OLD" && docker compose down
   ```
2. Unzip the new version in a fresh place. The zip contains a folder
   called `aone-pmo-cloud`; everything happens **inside** that folder:
   ```bash
   mkdir -p ~/aone-pmo-update && cd ~/aone-pmo-update
   unzip /path/to/AOne-PMO-Cloud.zip
   cd aone-pmo-cloud
   ```
3. Bring over the secrets and the database:
   ```bash
   cp -a "$OLD/.env" .
   sudo cp -a "$OLD/data" .
   ls -A        # must show .env  data  deploy.sh  docker-compose.yml  server  web ...
   ```
   (If the old `.env` sets `POSTGRES_DATA_DIR` to another location, there is
   no `data/` to copy; the database is already outside the folder.)
4. Start the new version:
   ```bash
   ./deploy.sh
   ```
5. Done. On start the app upgrades the database automatically (migration
   `002`); existing users, clients, projects, photos and documents are kept.
   Any hand edits made to the old code (for example in
   `server/routes/auth.js`) are replaced by this version, which is intended.

Keep the old folder until you've checked the new one works. Rollback:
`docker compose down` in the new folder, then `cd "$OLD" && docker compose up -d`.

## B. Fresh installation

```bash
unzip AOne-PMO-Cloud.zip
cd aone-pmo-cloud
./deploy.sh
```
`deploy.sh` creates `.env` with a random database password and session
secret, builds the app, starts it with its PostgreSQL database, and waits
until it reports healthy. Then open `http://SERVER-ADDRESS:3000`. The first
visit shows **Set up AOne PMO** to create the admin account, who then adds
everyone else from Settings → Team & Access.

## C. Without Docker

Node.js 22 and PostgreSQL 14 or newer:
```bash
cd aone-pmo-cloud/server
cp .env.example .env     # set DATABASE_URL, JWT_SECRET, NODE_ENV=production,
                         # DATABASE_SSL=false for a database on the same server
npm ci
npm start                # keep it running with systemd or pm2
```
`npm start` creates or updates the tables itself before starting.

## D. HTTPS and a domain (strongly recommended)

Logins and client data should not travel over plain `http://`.
1. Point a DNS record (e.g. `pmo.atsuyatech.com`) at the server.
2. Put an HTTPS reverse proxy in front of port 3000. Easiest is Caddy,
   which gets and renews the certificate by itself:
   ```bash
   caddy reverse-proxy --from pmo.atsuyatech.com --to localhost:3000
   ```
   With nginx, include `proxy_set_header X-Forwarded-Proto $scheme;`.
3. No app setting needs to change. Leave `COOKIE_SECURE` unset: the login
   cookie automatically becomes HTTPS-only when the site is reached over
   HTTPS, and still works over plain HTTP.
4. Optional: once HTTPS works, firewall port 3000 so it's reachable only
   through the proxy.

## E. Check it's working

```bash
docker compose ps                         # app and db: "healthy"
curl http://localhost:3000/api/health     # {"ok":true}
```
Then log in from a browser on another computer and open a project.

## F. If something goes wrong

| Symptom | Fix |
|---|---|
| "Could not load your data: Not logged in" right after logging in | Make sure this version is the one running (step A4) and `COOKIE_SECURE` is not `true` while using `http://`. Reload and log in again. |
| App keeps restarting; logs say `password authentication failed` | `.env` doesn't match the existing database. Use the `.env` from the previous installation. |
| `deploy.sh` stops with "data/postgres already holds a database" | Same cause: copy the old `.env` in first. |
| Port 3000 already in use | Set `PORT=8080` (or any free port) in `.env`, run `./deploy.sh` again. |
| Anything else | `docker compose logs app --tail 100` shows the reason. |

## Backups

Back up the `data/` folder together with `.env`, or take a database dump:
```bash
docker compose exec db pg_dump -U aone_pmo aone_pmo > aone-pmo-backup.sql
```
Inside the app, Settings → Data & Backup → Export Excel / Export Backup
also work for any user.

See `FIXES.md` for what changed in this version and `DEPLOYMENT.md` for
cloud hosting (Render) instead of your own server.
