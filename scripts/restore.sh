#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = --help ]; then
  echo 'Usage: CONFIRM_RESTORE=restore bash scripts/restore.sh backups/FILE.sql.gz'
  echo 'First take a safety backup and stop reverse-proxy frontend backend.'
  exit 0
fi
: "${1:?Pass the chosen backup filename}"
test "${CONFIRM_RESTORE:-}" = restore || { echo 'Export CONFIRM_RESTORE=restore after reviewing the restore.' >&2; exit 1; }
test -f "$1" || { echo 'Backup file not found.' >&2; exit 1; }
running="$(docker compose ps --status running --services)"
if printf '%s\n' "$running" | grep -Eq '^(backend|frontend|reverse-proxy)$'; then
  echo 'Stop reverse-proxy frontend backend to prevent writes during restore.' >&2
  exit 1
fi
gzip -t "$1"
gzip -dc "$1" | docker compose exec -T database sh -c '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  exec mysql -u root "$MYSQL_DATABASE"
'
echo 'Restore finished. Start the application services and verify the test record.'
