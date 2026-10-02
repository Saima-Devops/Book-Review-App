#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = --help ]; then
  echo 'Usage: PUBLIC_URL=http://VM_IP bash scripts/verify.sh'
  exit 0
fi
: "${PUBLIC_URL:?Export the public origin without a trailing slash}"
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/health" >/dev/null
echo 'Database-backed health: OK'
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/api/books" >/dev/null
echo 'Books API: OK'
page="$(mktemp)"
trap 'rm -f "$page"' EXIT
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/" > "$page"
echo 'Application page: OK'
asset="$(python3 - "$page" <<'PY'
from html.parser import HTMLParser
from pathlib import Path
import sys

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href') and value and value.startswith('/_next/static/'):
                self.urls.append(value)

parser = Assets()
parser.feed(Path(sys.argv[1]).read_text())
if not parser.urls:
    raise SystemExit('No built static asset found in frontend HTML.')
print(parser.urls[0])
PY
)"
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL$asset" >/dev/null
echo 'Built static asset: OK'
status="$(curl --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}' "$PUBLIC_URL/assignment-missing-page")"
test "$status" = 404 || { echo "Expected 404, received $status." >&2; exit 1; }
echo 'Missing page: expected 404'
docker compose ps
