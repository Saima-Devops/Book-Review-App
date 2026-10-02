#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-help}"
if [ "$mode" = help ] || [ "$mode" = --help ]; then
  echo 'Export a unique DRILL_ID, then run: bash scripts/db-drill.sh [create|show|delete]'
  echo 'Only the dedicated Operations test book is eligible for deletion.'
  exit 0
fi
: "${DRILL_ID:?Set a unique timestamp or identifier for this drill}"
[[ "$DRILL_ID" =~ ^[A-Za-z0-9_-]{1,40}$ ]] || { echo 'Invalid DRILL_ID.' >&2; exit 1; }
selector="title = 'Backup drill $DRILL_ID' AND author = 'Operations test'"
case "$mode" in
  create)
    sql="INSERT INTO Books (title, author, rating, createdAt, updatedAt) SELECT 'Backup drill $DRILL_ID', 'Operations test', 5, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM Books WHERE $selector);"
    ;;
  show)
    sql="SELECT id, title, author, rating FROM Books WHERE $selector;"
    ;;
  delete)
    sql="DELETE FROM Books WHERE $selector AND NOT EXISTS (SELECT 1 FROM Reviews WHERE Reviews.bookId = Books.id); SELECT ROW_COUNT() AS deleted_test_rows;"
    ;;
  *) echo 'Unknown drill mode.' >&2; exit 1 ;;
esac
printf '%s\n' "$sql" | docker compose exec -T database sh -c '
  export MYSQL_PWD="$MYSQL_PASSWORD"
  exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"
'
