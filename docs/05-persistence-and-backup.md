# Persistence, Backup, and Restore

Maintainer: Saima Usman.

Users, Books, Reviews, and Reports are database records. Favourites are
browser-local and are not included in SQL backups. Backups contain password
hashes and potentially sensitive reports; encrypt off-host copies and restrict access.
Uploaded covers are part of Books and are included in logical database backups.

## Compose

MySQL mounts `db_data` at `/var/lib/mysql`. `DB_VOLUME_NAME` selects its physical
name. Container recreation and `docker compose down` preserve it;
`down -v`, disk deletion, and infrastructure replacement can destroy it.

```bash
bash scripts/backup.sh
```

The script creates a single-transaction logical dump, includes routines/events/
triggers, compresses it, checks gzip integrity, and atomically publishes a
mode-0600 file in `backups/`. Application passwords are not command-line arguments.
These backups use --databases and are intended for same-database Compose restoration.

Restore only trusted dumps in maintenance windows:

```bash
bash scripts/backup.sh
docker compose stop reverse-proxy frontend backend
CONFIRM_RESTORE=restore bash scripts/restore.sh backups/CHOSEN.sql.gz
docker compose up -d --wait --wait-timeout 600
PUBLIC_URL=https://PUBLIC-HOSTNAME bash scripts/verify.sh
```

Choose the actual backup filename and configured origin. Restoration can discard
newer writes. The script refuses to restore while application writers are running.
A failed import can leave a partial restore; recover from the safety backup
before reopening access. Restore is not an atomic database rollback.

## Aiven

Provider backups depend on service plan and retention. Maintain an independent
encrypted logical backup and test its restoration into a separate database.
Use a MySQL client with `--ssl-mode=VERIFY_IDENTITY --ssl-ca=CA_FILE` and a
password prompt or protected credential file; never place passwords in shell history.

For migration into a differently named empty database, create a dump without
--databases, --no-tablespaces, --set-gtid-purged=OFF, and --single-transaction.
Use --skip-add-drop-table to avoid silently overwriting existing tables. Review
database names, privileges, and existing tables before import.

The Compose backup/restore scripts do not target Aiven. Do not restore an older
pre-cleanup backup over current data without accounting for removed accounts.

## Policy

Back up before releases, schema changes, removals, and credential rotation.
Define recovery point/time objectives, retention, encryption, and an off-host
schedule appropriate to the environment. Test recovery regularly in isolation;
gzip validity alone does not prove that a database is recoverable.
