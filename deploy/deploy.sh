#!/bin/sh
# Copy this checkout to the server and (re)start it there.
#   deploy/deploy.sh ubuntu@sessions.example.com            # first deploy and every update
#   deploy/deploy.sh ubuntu@sessions.example.com /srv/es    # a different folder on the server
# Needs ssh access to the server (set SSH options in ~/.ssh/config), rsync on both sides, and pnpm here. deploy/.env is never copied: it is
# written once on the server (see RUNBOOK.md, First deploy) and stays there.
set -eu
target="${1:?usage: deploy/deploy.sh user@host [remote-dir]}"
remote_dir="${2:-/opt/expert-sessions}"
here="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building the web app here (the server is too small to run Vite)"
(cd "$here" && pnpm --filter web build >/dev/null) || { echo "web build failed; fix it before deploying" >&2; exit 1; }

echo "Copying $here -> $target:$remote_dir"
rsync -az --delete \
  --exclude node_modules --exclude .env --exclude 'deploy/.env' \
  --exclude 'deploy/backups' --exclude .DS_Store --exclude '.git/' \
  "$here/" "$target:$remote_dir/"

echo "Building and starting on $target (the first build takes a few minutes)"
ssh "$target" sh -s "$remote_dir" <<'REMOTE'
set -eu
cd "$1/deploy"
if [ ! -f .env ]; then
  echo "deploy/.env is missing on the server. Copy .env.production.example to .env and fill it in (RUNBOOK.md, First deploy)." >&2
  exit 1
fi
docker compose up -d --build --remove-orphans
sleep 10
docker compose ps
echo "--- health from inside the server"
docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health && echo
echo "--- last lines of the api log"
docker compose logs --tail=15 app
REMOTE
echo "Done. From a phone on mobile data, open https://<PUBLIC_HOST>/api/health — it must say ok:true."
