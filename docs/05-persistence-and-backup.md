# Persistence, backup, and restore

MySQL mounts the db_data named volume at /var/lib/mysql. The physical volume name is configurable through DB_VOLUME_NAME. Container recreation and compose down preserve it; down -v does not. Deleting the EC2 disk also loses local volumes, logs, and backups.

scripts/backup.sh runs a MySQL logical dump with single-transaction, routines, events, and triggers, compresses it, and atomically places a mode-0600 file in the host backups/ directory. It uses database container environment variables; no passwords appear in command arguments. Backups include accounts/password hashes, books, and reviews and must be treated as sensitive.

Recommended schedule: daily, plus before deployments and secret/schema changes. Keep at least 7 daily local backups and 30 daily encrypted off-host copies, adjusted to recovery and privacy requirements. Local volume/backup persistence is not disaster recovery. Store off-host backups in a private encrypted S3 bucket or equivalent; configure lifecycle, least-privilege access, and restore testing. No scheduler or S3 resources are created automatically.

For consistent restore evidence, stop frontend, backend, and proxy BEFORE the drill backup so no later user writes can be lost. Keep the database running. Use scripts/db-drill.sh with a unique DRILL_ID to create/show/delete only its dedicated unreviewed Operations test book. It never removes tables or the volume.

Restore: review the chosen backup, take a safety backup, stop application writers, export CONFIRM_RESTORE=restore, then run scripts/restore.sh with the file. The script refuses restoration while application containers run. Restart the stack, confirm /health, then verify the drill record.

Never restore an untrusted dump. A full database restore replaces data to the backup point; perform the drill in a test environment or scheduled maintenance window.

Manual results to record: UTC time; chosen backup filename; test-book ID/title before deletion; affected row count; absent record; restored record; same record after down/up. These are pending until performed on the VM.
