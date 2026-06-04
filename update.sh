#!/bin/bash
# QWAS Messenger - update script (GitHub-based deploy)
# Usage: qwas-update [repo-url]
# If no URL given, reads from $QWAS_REPO or ~/.qwas-repo

set -e

APP_DIR="$HOME/QWAS"
APP_NAME="qwas"
BRANCH="${QWAS_BRANCH:-main}"
PORT="${QWAS_PORT:-3000}"

# Determine repo URL
if [ -n "$1" ]; then
  REPO_URL="$1"
elif [ -n "$QWAS_REPO" ]; then
  REPO_URL="$QWAS_REPO"
elif [ -f "$HOME/.qwas-repo" ]; then
  REPO_URL=$(cat "$HOME/.qwas-repo")
else
  echo "Usage: qwas-update <repo-url>"
  echo "Or set QWAS_REPO env var, or save URL to ~/.qwas-repo"
  exit 1
fi

log()  { echo -e "\033[1;34m==>\033[0m $1"; }
ok()   { echo -e "\033[1;32m✓\033[0m $1"; }
warn() { echo -e "\033[1;33m!\033[0m $1"; }
err()  { echo -e "\033[1;31m✗\033[0m $1"; exit 1; }

cd "$HOME" || err "no HOME"

if [ ! -d "$APP_DIR/.git" ]; then
  log "Cloning $REPO_URL -> $APP_DIR"
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR" || err "clone failed"
  ok "cloned"
else
  log "Pulling $REPO_URL ($BRANCH)"
  cd "$APP_DIR"
  LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "none")
  git fetch origin "$BRANCH" --depth 1 || err "fetch failed"
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)
  if [ -z "$REMOTE" ]; then err "no remote branch"; fi
  if [ "$LOCAL" = "$REMOTE" ]; then
    ok "already up to date ($LOCAL)"
  else
    log "Updating $LOCAL -> $REMOTE"
    [ -f .env ] && cp .env .env.qwasbak
    [ -d uploads ] && cp -r uploads uploads.qwasbak
    [ -d node_modules ] && mv node_modules node_modules.qwasbak
    git reset --hard "origin/$BRANCH" || err "reset failed"
    [ -f .env.qwasbak ] && mv .env.qwasbak .env
    [ -d uploads.qwasbak ] && rm -rf uploads && mv uploads.qwasbak uploads
    if [ -d node_modules.qwasbak ]; then
      rm -rf node_modules
      mv node_modules.qwasbak node_modules
    fi
    ok "updated"
  fi
fi

cd "$APP_DIR"

log "Installing dependencies"
npm install --omit=dev 2>&1 | tail -5

log "Running migrations"
npm run migrate 2>&1 | tail -20 || warn "migrations had issues, continuing"

log "Restarting via PM2"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME"
else
  pm2 start server.js --name "$APP_NAME"
  pm2 save
fi

sleep 2
log "Health check:"
HEALTH=$(curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null || echo "FAIL")
echo "  $HEALTH"
log "PM2 status:"
pm2 status "$APP_NAME" 2>/dev/null | grep -E "qwas|status" || true
echo
ok "DONE"
