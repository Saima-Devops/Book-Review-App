#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
if [ "${1:-}" = --help ]; then
  echo 'Usage: bash scripts/backup.sh (run on VM; reads container environment)'
  exit 0
fi
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$(mktemp "backups/.backup-$stamp.XXXXXX")"
trap 'rm -f "$partial"' EXIT
docker compose exec -T database sh -c '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  exec mysqldump -u root --single-transaction --routines --events --triggers \
    --no-tablespaces --set-gtid-purged=OFF --databases "$MYSQL_DATABASE"
' | gzip > "$partial"
gzip -t "$partial"
destination="backups/database-$stamp-$$.sql.gz"
mv "$partial" "$destination"
trap - EXIT
printf 'Backup created: %s\n' "$destination"
