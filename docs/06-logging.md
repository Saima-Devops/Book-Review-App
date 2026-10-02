# Logging

Nginx access logs use escaped JSON with timestamp, method, path without query string, status, bytes, duration, and upstream status. Nginx error logs use standard timestamped text. Both are bind-mounted at APP_DIR/logs/proxy and persist across proxy restarts.

The proxy runs as UID/GID 101. Ansible creates a protected log directory owned by that UID and installs daily logrotate with 14 rotations and a 20 MiB size threshold. Rotation signals Nginx with USR1 to reopen files.

Backend stdout/stderr remains available via docker compose logs backend. Existing application logs are standard text, not converted to JSON because source changes were excluded. Docker json-file logging wraps stdout/stderr and rotates at 10 MiB with five files per container.

Do not capture real credentials, authorization headers, cookies, session tokens, database connection strings, or environment dumps. Do not put secrets into URL paths/query strings. Access logs omit those fields; standard Nginx error logs may include request context.

Generate page, API, built asset, and 404 traffic with scripts/verify.sh. Restart the proxy, repeat verification, then show access/error files with sudo and backend output with compose logs. Record observed log persistence; no execution result is fabricated.
