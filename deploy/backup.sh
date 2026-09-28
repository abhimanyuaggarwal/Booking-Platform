#!/bin/sh
# Daily pg_dump into /backups, keeping KEEP_DAYS days. Runs inside the backup container; the
# connection comes from PGHOST/PGUSER/PGPASSWORD/PGDATABASE in docker-compose.yml.
# Restore:  pg_restore -h db -U es -d expert_sessions --clean --if-exists /backups/<file>.dump
set -eu
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p /backups
while true; do
  file="/backups/expert_sessions-$(date +%Y%m%d-%H%M).dump"
  if pg_dump --format=custom --file="$file.part" && mv "$file.part" "$file"; then
    echo "backup written: $file ($(du -h "$file" | cut -f1))"
  else
    echo "backup FAILED at $(date -Iseconds); will try again in an hour" >&2
    rm -f "$file.part"
    sleep 3600
    continue
  fi
  find /backups -name 'expert_sessions-*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
