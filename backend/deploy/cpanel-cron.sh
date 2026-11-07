#!/bin/bash
# cPanel cron job — run every 5 minutes:
#   /bin/bash $HOME/isp.rsitlink.com/cpanel-cron.sh >/dev/null 2>&1
# 1. After a deploy changed package.json: npm install in the app's Node.js virtualenv, then restart the app.
# 2. Ping the API so Passenger keeps the app running (the billing / SMS jobs live inside it).
APP_NAME="isp.rsitlink.com"
APP_DIR="$HOME/$APP_NAME"
APP_URL="https://$APP_NAME"
LOG="$APP_DIR/deploy.log"

cd "$APP_DIR" || exit 1
exec 9>"$APP_DIR/.cron.lock"
flock -n 9 || exit 0 # a previous run (long npm install) is still busy

HASH=$(md5sum package.json | cut -d' ' -f1)
if [ "$HASH" != "$(cat .deps-hash 2>/dev/null)" ]; then
  echo "$(date '+%F %T') package.json changed — installing packages" >>"$LOG"
  # shellcheck disable=SC1090
  source "$(ls -d "$HOME/nodevenv/$APP_NAME"/*/bin/activate | sort -V | tail -1)"
  if npm install --omit=dev --no-audit --no-fund >>"$LOG" 2>&1; then
    echo "$HASH" >.deps-hash
    mkdir -p tmp && touch tmp/restart.txt
    echo "$(date '+%F %T') packages installed, app restarted" >>"$LOG"
  else
    echo "$(date '+%F %T') npm install FAILED (will retry in 5 minutes)" >>"$LOG"
  fi
fi

curl -fsS -m 30 "$APP_URL/api/v1/health/live" >/dev/null || echo "$(date '+%F %T') health check failed" >>"$LOG"

# keep the log small
tail -n 500 "$LOG" >"$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
