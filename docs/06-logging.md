# Logging

Maintainer: Saima Usman.

## Managed Services

Use Northflank runtime logs for frontend/backend startup and failures, and
Aiven metrics/logs for database availability, storage, and connections. Set
retention and alerting according to the hosting plan. No centralized log export
or alert service is provisioned by this repository.

## Compose / EC2

Nginx access logs are escaped JSON: time, method, path without query string,
status, bytes, duration, and upstream status. Error logs are standard text.
Files are mounted at `logs/proxy` and persist across proxy restarts.

Nginx runs as UID/GID 101. Ansible configures directory ownership and daily
logrotate with 14 rotations and a 20 MiB threshold; USR1 reopens files.
Container stdout/stderr uses Docker json-file rotation at 10 MiB with five files.

```bash
docker compose logs --tail=100 backend frontend database reverse-proxy
sudo tail -n 20 logs/proxy/access.log
sudo tail -n 20 logs/proxy/error.log
```

Run on the deployment host. Restrict log access. Do not publish environment
dumps, passwords, JWTs, reset links, authorization headers, database URIs, or
private keys. Nginx access fields deliberately omit credentials, but error logs
and application exception output still require review.
