# Deploying AOne PMO to the Cloud

This gets the app running on the internet, reachable from any device, at a
URL you control (e.g. `pmo.atsuyatech.com`). It's one Node.js service plus
one PostgreSQL database — nothing exotic, and no separate frontend hosting
to manage.

Costs and free-tier terms below were checked directly against the hosting
provider in August 2026. These do change over time — worth a quick glance
at Render's own pricing page if it's been a while since you read this.

---

## 1. What you'll need

- A [Render.com](https://render.com) account (recommended — see "Why
  Render" below). No credit card required to start.
- This code pushed to a GitHub (or GitLab/Bitbucket) repository. Render
  deploys straight from a repo and redeploys automatically on every push.
- Five minutes to generate one secret value (step 3).

### Why Render
It's the simplest path for a small team: connect a repo, it detects
Node.js automatically, and gives you a live HTTPS URL with no server to
patch or firewall to configure. Railway and Fly.io are reasonable
alternatives if you already use them, but neither currently has a
meaningful free tier to start on the way Render does.

---

## Quickest path: one-click Blueprint (recommended)

The repo includes `render.yaml`, which tells Render exactly what to create.

1. Push this code to a GitHub repo (`render.yaml`, `server/` and `web/`
   must sit at the top level of the repo, not inside another folder).
2. In Render: **New → Blueprint**, connect GitHub if asked, pick the repo
   (and branch), then **Apply**.
3. Render creates the database and the web app in Singapore, links them,
   and generates `JWT_SECRET` itself. The first deploy takes a few minutes;
   tables and the default pipeline are created automatically on start.
4. Open the URL Render shows (like `https://aone-pmo.onrender.com`) and
   continue at step 5 below to create the first admin account.

Both start on the free tier; see the notes in steps 2–3 and section 7
before the team relies on it. Steps 2–4 below are the manual alternative.

---

## 2. Create the database

1. In the Render dashboard: **New → PostgreSQL**.
2. Name it anything (e.g. `aone-pmo-db`). Leave the region as whatever's
   closest to your team.
3. **Free tier note:** the free Postgres plan is genuinely free, but it is
   *deleted 30 days after creation* (with a 14-day grace period to upgrade
   first). That's fine for testing this weekend, but before your team
   starts entering real client data, upgrade this database to a paid plan
   (Starter, currently ~$7/month) so it isn't at risk of disappearing.
4. Once created, copy the **Internal Database URL** shown on the database's
   page — you'll paste this into the web service in the next step.

---

## 3. Create the web service

1. **New → Web Service**, connect your repository.
2. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Under **Environment**, add these variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Internal Database URL from step 2 (database and web service must be in the same region) |
   | `JWT_SECRET` | a random 48+ character string — generate one locally with:<br>`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `NODE_ENV` | `production` |
   | `DATABASE_SSL` | `false` — the Internal URL runs on Render's private network, where TLS isn't required |

4. **Free tier note:** the free web service instance spins down after 15
   minutes of no traffic and takes about a minute to wake back up on the
   next request. Fine for testing; for daily team use, upgrade to Starter
   (~$7/month) so it's always instantly responsive.
5. Click **Create Web Service**. First deploy takes a few minutes.

---

## 4. Set up the database schema

Nothing to do: `npm start` creates/updates the tables and seeds the default
9-stage pipeline every time the service starts. Only if you ever need to
run it by hand from your own machine (Node installed, no `psql` needed):

```bash
cd server
npm install
DATABASE_URL="<the External Database URL from Render's database page>" DATABASE_SSL=true npm run migrate
```

(Use the *External* URL for this one-off step — the Internal URL from
step 2 only works from inside Render's own network, which is correct for
the running app but not for connecting from your laptop.)

Then seed the default 9-stage pipeline template the same way:

```bash
DATABASE_URL="<same External URL>" DATABASE_SSL=true npm run seed
```

---

## 5. Create the first account

Visit your new Render URL (something like `aone-pmo.onrender.com`). Since
no accounts exist yet, you'll land on a one-time "Set up AOne PMO" screen
— fill it in and you're the first admin. From Settings → Team & Access,
add the rest of your team from there; there's no public sign-up page by
design, since this holds real client data.

---

## 6. Point your domain at it

1. In Render: your web service → **Settings → Custom Domains → Add**.
2. Enter `pmo.atsuyatech.com` (or whatever subdomain you'd like).
3. Render shows you a CNAME record to add. In wherever Atsuya's domain is
   managed (GoDaddy, Cloudflare, Namecheap, etc.), add that CNAME record.
4. HTTPS is issued automatically once the DNS record is live — no
   certificate to manage yourself.

---

## 7. Realistic ongoing cost

For genuine daily use by your team (not just testing), budget for the
**paid** tiers on both pieces:

| Component | Plan | Cost |
|---|---|---|
| Web service | Starter (always-on, no cold start) | ~$7/month |
| PostgreSQL | Starter (doesn't expire) | ~$7/month |
| **Total** | | **~$14/month** |

The free tier costs nothing but isn't appropriate for real use: the
database is deleted after 30 days, and the web service takes a slow
minute to wake up after any idle period. Use it to verify the deployment
works, then upgrade both before anyone relies on this daily.

---

## 8. Embedding on the Atsuya website

The cleanest approach is the subdomain above (`pmo.atsuyatech.com`) linked
to from your main site's navigation — a full page reload into a real app,
not an iframe. If there's a strong reason to embed it inside an existing
page instead, that's possible but needs a small code change (the
`X-Frame-Options` and `Content-Security-Policy` headers in
`server/index.js` currently block iframe embedding on purpose, as a
security default) — ask if that's actually what's needed and it can be
adjusted for the specific embedding page.

---

## Self-hosting on your own server (Docker or a VPS)

The same app runs on any Linux server with Docker (see "Run with Docker"
in `README.md`) or with Node 22 + PostgreSQL directly (`npm start` from
`server/`). Two things to get right:

1. **HTTPS.** Put the app behind a reverse proxy that terminates HTTPS
   (Caddy, nginx, Traefik, or Cloudflare) and forwards to port 3000 with
   `X-Forwarded-Proto` set (nginx: `proxy_set_header X-Forwarded-Proto $scheme;`).
   Logins and client data travel over this connection, so plain `http://`
   should only ever be used for a quick internal test.
2. **The login cookie.** With the default `COOKIE_SECURE=auto`, the cookie
   is marked Secure only when the browser reached the app over HTTPS, so
   login works over both. Do **not** set `COOKIE_SECURE=true` unless every
   user opens the site via `https://` — otherwise browsers silently drop
   the cookie and login ends with *"Could not load your data: Not logged
   in"*. (Earlier versions forced Secure whenever `NODE_ENV=production`,
   which is exactly what caused that error on plain-HTTP deployments.)

## Updating the app later

Push to your repository's main branch — Render redeploys automatically.
On a self-hosted server, pull the new code and rebuild/restart
(`docker compose up -d --build`, or `npm install && npm start`).
Database migrations run automatically on every start (`npm start` runs
`db/migrate.js` first), so a schema change such as
`002_on_hold_status_and_photo_version` is applied without a manual step.
Existing data is kept.

## Backing up your data

Settings → Data & Backup → Export Excel or Export Backup work exactly as
before, from any account. Beyond that, Render's paid Postgres plans
include automatic daily backups — worth confirming that's turned on once
you're on a paid database plan.
