# Operations runbook

Run commands from the EC2 checkout. Keep root .env protected at mode 0600. Use runtime PUBLIC_URL and FULL_NAME for verification and evidence.

## Normal operation

Start: docker compose up -d --wait --wait-timeout 600. Deployment rebuild: docker compose up -d --build --wait --wait-timeout 600.

Shutdown: docker compose down. Never add -v for routine shutdown. This is a single-host stack; shutdown/rebuilds can cause downtime.

Health: docker compose ps; run PUBLIC_URL=the-runtime-origin bash scripts/verify.sh. Review docker compose logs --tail=100 backend database frontend reverse-proxy and sudo tail logs/proxy/access.log. Avoid printing .env or interpolated Compose configuration.

Safe restart: docker compose restart SERVICE, then docker compose up -d --wait --wait-timeout 600 and verify. For planned database maintenance, stop application writers first, restart the database, wait for readiness, then bring the full stack up.

## Backup and restore

Run bash scripts/backup.sh before a release or maintenance change. Store its filename and UTC timestamp; copy encrypted backups off the VM.

Restore a reviewed trusted backup only in a maintenance window. Take a fresh safety backup, stop reverse-proxy frontend backend, export CONFIRM_RESTORE=restore, and run bash scripts/restore.sh backups/CHOSEN.sql.gz. Restart all services and verify records plus health. An older restore discards later writes; named-volume retention does not prevent this.

## Release and rollback

Deploy a full pushed commit SHA as APP_REF; APP_IMAGE_TAG follows that SHA. Record previous SHA and backup path before deployment. Run prepare for the new commit, configure secrets, then configure to build/start and verify.

For rollback, export the previous full SHA as APP_REF and APP_IMAGE_TAG, run prepare, then configure. It rebuilds that source; retained tagged images can reduce recovery time when starting them directly through Compose. Check database compatibility before reverting source. Do not restore the database automatically with a code rollback, and do not prune prior images until the rollback window ends.

Base tags move. For reproducible releases, select scanned/tested image digests via NODE_IMAGE, MYSQL_IMAGE, and NGINX_IMAGE at runtime, preserving MySQL's 8.4 family and a Nginx version supporting resolve (1.27.3+). Record digests per release.

## Secret rotation

Updating .env or Secrets Manager alone does not alter initialized MySQL users. Use a maintenance window and a safety backup. Rotate the actual MySQL application/root accounts using an authenticated administrator session, update the secret store and local environment consistently, then recreate affected containers and verify. Do not paste password-bearing SQL into recorded terminal history or screenshots.

configure-env.py refuses changed existing secret/database identity values unless ALLOW_SECRET_UPDATE=yes is explicitly exported after planning the migration. JWT_SECRET changes invalidate existing sessions. Document the rotation date, not the secret. For custom KMS keys, add a narrowly scoped kms:Decrypt permission and corresponding key policy; the included IAM policy assumes the standard Secrets Manager AWS-managed key.

Secrets Manager is the source of truth for aws mode; EC2 reads it using its instance role. Local mode uses protected .env. Docker environment inspection is privileged; Docker-group membership is effectively root access. Do not expose the Docker socket.

## Reliability drills

In a maintenance/test environment, verify health, stop backend, record /api/books as unavailable, start backend, then wait and verify. Repeat by stopping database, recording a failed database-backed request, and starting database. No volume deletion, table deletion, or port publication is allowed.

Deliberate compose stop disables process restart behavior until manually started. Unhealthy checks do not automatically restart containers. Wait for database reconnection; if the backend does not recover, restart it only after database readiness and record that fallback.

## Post-incident checks

Confirm all services healthy; public page, static asset, API, and /health respond; only proxy publishes 80; security group has only 22 restricted and 80 public; sample/review data remains; logs contain no credentials; backups are readable and copied off-host. Record incident times, observed status codes, recovery actions, and remaining risks.

## Reliability record

Fill from actual VM observations:

| Test | UTC time | Failure status | Recovery action | Final health/API status |
| --- | --- | --- | --- | --- |
| Backend stopped | Pending | Pending | Start backend | Pending |
| Database stopped | Pending | Pending | Start database; verify reconnection | Pending |

This template is not proof that the drills succeeded.
