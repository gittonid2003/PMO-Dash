# Fixes — October 2026

Tested end to end on PostgreSQL 16 + Node 22 in production mode, opened over
plain `http://` on a server address (the setup that was failing):
74/74 API checks and 48/48 browser checks pass.

## What was wrong, and what changed

| # | Problem | Fix |
|---|---|---|
| 1 | **Login worked, then "Could not load your data: Not logged in".** With `NODE_ENV=production` the session cookie was always marked `Secure`; browsers throw such cookies away on plain `http://`, so the next request had no session. | Cookie is `Secure` only when the request actually came over HTTPS (honours `X-Forwarded-Proto`). Override with `COOKIE_SECURE=true/false`. `routes/auth.js` |
| 2 | **One bad request crashed the whole server** for everyone (e.g. a malformed id in a URL). Express 4 doesn't catch errors in async handlers; Node exits on unhandled rejections. | `server/lib/catch-async-errors.js` + a central error handler that answers 400/404/409/413 instead. |
| 3 | **Saved changes could silently vanish.** A rejected "new project" request left a database transaction open on a pooled connection; later writes on that connection were never committed. | Validate before opening the transaction; always roll back. `routes/projects.js` |
| 4 | **Editing a project or stage wiped its dates.** Dates came back as timestamps (shifted a day on an IST server), which date inputs can't display, so they showed blank and saving cleared them. | Dates are returned as plain `YYYY-MM-DD`; the UI parses them as local dates. `db/pool.js`, `web/store.js` |
| 5 | **"On Hold" stage status failed to save** — the dropdown offered it, the database didn't allow it. | Migration `002` adds it. |
| 6 | **Export Excel always failed** ("Excel library failed to load") — the library was never included. | SheetJS bundled in `web/vendor/`, loaded on first export. |
| 7 | **Client photo disappeared after editing a client**; a replaced photo stayed stale for up to an hour. | API returns full client data; photo URLs are versioned (migration `002`). |
| 8 | **Documents with non-English names** (e.g. an en-dash "–", Tamil text) were stored garbled and **couldn't be downloaded** (server error). | Names decoded as UTF-8; downloads use proper `filename*` encoding. |
| 9 | **10 logins per 15 min per IP** — an office sharing one IP would lock itself out. | Only failed attempts count. |
| 10 | Migration runner: ignored `DATABASE_SSL` (DEPLOYMENT.md step 4 failed on SSL-only DBs); could fake-skip real migrations when baselining; required access to the `postgres` maintenance DB. | Fixed in `db/migrate.js`. |
| 11 | Modal auto-focus could move the cursor out of a field the user had already clicked into. | Only auto-focus when nothing in the modal is focused. `web/js/render-common.js` |
| 12 | On servers using Docker's older build engine, rebuilding failed once the database existed ("can't stat data/postgres"): the build tried to read the database folder inside the project. | `data` excluded in `.dockerignore`; new one-command `deploy.sh` and `HOSTING-STEPS.md`. |
| 13 | Security: CORS reflected any origin with credentials; dependencies had 1 critical + 3 moderate advisories (proxy-addr, qs) and an outdated multer. | CORS off unless `CORS_ORIGIN` is set; `npm audit` now reports 0. |

## Deploying this update (hosting team)

1. Follow `HOSTING-STEPS.md` section A: copy the old `.env` and `data/` into
   the new folder, then run `./deploy.sh`.
2. Migration `002` runs automatically on start. Existing users, clients and
   projects are kept (tested against a database created by the old version).
3. Nothing else needs changing in `.env`. Leave `COOKIE_SECURE` unset (auto).
4. Strongly recommended: serve the site over HTTPS via a reverse proxy
   (see `HOSTING-STEPS.md` section D).
5. Users who were stuck should just reload the page and log in again.
