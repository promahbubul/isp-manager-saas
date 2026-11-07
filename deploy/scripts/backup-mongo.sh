#!/usr/bin/env bash
# Daily MongoDB backup with 14-day retention.
# Cron (as the deploy user):  30 3 * * *  bash /home/deploy/isp-manager-saas/deploy/scripts/backup-mongo.sh >> /home/deploy/backup.log 2>&1
#
# Reads DB_URL from backend/.env. Copy the backups OFF the server too
# (e.g. rclone to Google Drive / S3) — a backup on the same disk is not a backup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/mongo}"
KEEP_DAYS="${KEEP_DAYS:-14}"

DB_URL="$(grep -E '^DB_URL=' "$ROOT/backend/.env" | head -1 | cut -d= -f2-)"
if [ -z "$DB_URL" ]; then
  echo "DB_URL not found in backend/.env" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/isp-$STAMP.archive.gz"

mongodump --uri="$DB_URL" --archive="$FILE" --gzip
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Off-site copy (recommended). Set RCLONE_REMOTE, e.g. "gdrive:isp-backups" after `rclone config`.
# Uploaded logos are copied too.
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE/mongo/" --quiet
  [ -d "$ROOT/backend/uploads" ] && rclone sync "$ROOT/backend/uploads" "$RCLONE_REMOTE/uploads" --quiet
  rclone delete "$RCLONE_REMOTE/mongo/" --min-age "${KEEP_DAYS}d" --quiet || true
  echo "$(date -Is) off-site copy ok: $RCLONE_REMOTE"
fi

# Uptime monitor ping (e.g. healthchecks.io): alerts you if this backup stops running.
[ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 "$BACKUP_PING_URL" >/dev/null || true

find "$BACKUP_DIR" -name 'isp-*.archive.gz' -mtime +"$KEEP_DAYS" -delete

# Restore (careful — overwrites data):
#   mongorestore --uri="$DB_URL" --archive=FILE --gzip --drop
