#!/usr/bin/env bash
# AOne PMO: one-command install / update with Docker.
#
#   ./deploy.sh        (use "sudo ./deploy.sh" if Docker needs sudo on this server)
#
# Safe to run again for every update. It never touches an existing .env
# (database password + session secret) or data/ (the database itself).
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '%s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker Engine first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "'docker compose' is not available. Install the Docker Compose v2 plugin (package: docker-compose-plugin)."

# ---- .env: keep an existing one, or create one for a brand-new install ----
if [ -f .env ]; then
  say "Using the existing .env (database password and session secret unchanged)."
else
  if [ -d data/postgres ]; then
    fail "data/postgres already holds a database, but there is no .env here.
Copy the .env from the previous installation into this folder first
(its POSTGRES_PASSWORD must match that database), then run ./deploy.sh again."
  fi
  gen() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  umask 077
  cat > .env <<EOF
# Created by deploy.sh on $(date -u +%Y-%m-%d). Keep this file private and
# back it up together with the data/ folder.
POSTGRES_PASSWORD=$(gen)
JWT_SECRET=$(gen)
PORT=3000
EOF
  say "Created .env with a new random database password and session secret."
fi

grep -qE '^POSTGRES_PASSWORD=.+' .env || fail ".env has no POSTGRES_PASSWORD value."
grep -qE '^JWT_SECRET=.{32,}' .env || fail ".env needs a JWT_SECRET of at least 32 characters."
if grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2- | grep -q '[^A-Za-z0-9_-]'; then
  fail "POSTGRES_PASSWORD may only contain letters, numbers, - and _ (it is placed inside a connection URL)."
fi

# ---- build and start ----
say "Building and starting AOne PMO (first build takes a few minutes)..."
docker compose up -d --build

PORT_VALUE="$(grep -E '^PORT=' .env | tail -n 1 | cut -d= -f2- || true)"
PORT_VALUE="${PORT_VALUE:-3000}"

say "Waiting for the app to report healthy..."
for _ in $(seq 1 60); do
  CID="$(docker compose ps -q app 2>/dev/null || true)"
  if [ -n "$CID" ]; then
    STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CID" 2>/dev/null || true)"
    if [ "$STATUS" = "healthy" ]; then
      say ""
      say "AOne PMO is running."
      say "  Open:  http://<this-server's-address>:${PORT_VALUE}"
      say "  First visit on a new install shows 'Set up AOne PMO' to create the admin account."
      say "  For HTTPS and a proper domain, see HOSTING-STEPS.md section D."
      exit 0
    fi
  fi
  sleep 3
done

say ""
say "The app did not become healthy within 3 minutes. Recent logs:"
docker compose logs app --tail 60 || true
fail "See HOSTING-STEPS.md section F (troubleshooting)."
