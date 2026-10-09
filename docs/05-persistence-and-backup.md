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

Open Docker Desktop on the workstation and retain the downloaded Aiven CA:

```bash
bash scripts/backup-aiven.sh
```

The script prefers a temporary Docker client, reuses cached mysql:8.4 or mysql:8,
and downloads mysql:8.4 only if needed. It runs mysqldump, not a database server;
no local Homebrew installation is required. It prompts for missing settings and
uses certificate-verified TLS. The CA is mounted read-only. The container is
non-root, capability-restricted, and automatically removed. A stopped Docker
Desktop is reported with an instruction to open it, not to install dependencies.

Non-sensitive settings are remembered in ~/.config/book-shelf/aiven-backup.conf.
The database password is prompted on each run and is never saved on the host.
For Docker, it is passed through stdin to a protected ephemeral tmpfs client
configuration, removed when the command finishes. It is not placed in command
arguments or container environment variables. No TTY is attached to the dump
stream, preventing password prompts and terminal formatting from corrupting SQL.
Use `bash scripts/backup-aiven.sh --configure` to change saved settings.
AIVEN_HOST, AIVEN_PORT, AIVEN_USER, AIVEN_DATABASE, and AIVEN_CA override them;
AIVEN_BACKUP_DIR selects the backup root, and AIVEN_BACKUP_CONFIG selects the
settings file. AIVEN_BACKUP_CLIENT=docker forces Docker;
AIVEN_MYSQL_IMAGE selects a trusted compatible client image. Existing local
clients remain supported with AIVEN_BACKUP_CLIENT=local or AIVEN_MYSQLDUMP.
Homebrew client detection is retained for that optional local path.

Each run creates a unique protected directory under ~/reading-room-backups,
streams the dump through gzip, checks pipeline success and gzip integrity, and
publishes book-shelf.sql.gz only after success. Failed partial archives are
removed; older backups are retained. Covers and all application tables are
included. The script does not deploy images, restore data, or modify database
records. Keep backups encrypted/protected; this script compresses, not encrypts.

Provider backups depend on service plan and retention. Maintain an independent
encrypted logical backup and test its restoration into a separate database.
Use a MySQL client with `--ssl-mode=VERIFY_IDENTITY --ssl-ca=CA_FILE` and a
password prompt or protected credential file; never place passwords in shell history.

For migration into a differently named empty database, omit --databases.
Use --no-tablespaces, --set-gtid-purged=OFF, and --single-transaction.
Use --skip-add-drop-table to avoid silently overwriting existing tables. Review
database names, privileges, and existing tables before import.

The Compose backup/restore scripts do not target Aiven. Do not restore an older
pre-cleanup backup over current data without accounting for removed accounts.

## Policy

Back up before releases, schema changes, removals, and credential rotation.
Define recovery point/time objectives, retention, encryption, and an off-host
schedule appropriate to the environment. Test recovery regularly in isolation;
gzip validity alone does not prove that a database is recoverable.
