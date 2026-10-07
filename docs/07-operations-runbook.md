# Operations Runbook

Maintainer: Saima Usman.

## Release

1. Back up the database and record currently deployed image tags/digests.
2. Push the reviewed release to main and wait for all CI/publishing jobs.
3. Select frontend/backend build tags from the same run and attempt.
4. Update the backend first and confirm schema/database readiness.
5. Update the frontend and verify pages, APIs, authentication, and moderation.
6. Record commit, image digests, deployment time, and verification results.

Northflank deployment is manual. Publishing latest tags does not establish a
deployed release. Keep the existing database, signing secret, and CA mount.
See [managed deployment](10-northflank-aiven.md).

## Rollback

Restore previous image references only after checking compatibility with the
current schema. An additive schema migration does not automatically require a
database restore. Database rollback is a separate, destructive recovery decision
that may discard recent writes. Retain tested earlier images during the rollback window.

## Compose Operation

```bash
docker compose up -d --wait --wait-timeout 600
docker compose ps
docker compose logs --tail=100 backend database frontend reverse-proxy
docker compose down
```

Routine shutdown must omit -v. Releases use the pushed source commit and
`docker compose up -d --build --wait --wait-timeout 600`. For database maintenance,
stop application writers first. Verify with `scripts/verify.sh` on the Compose host.

## Incident Response

- Database timeout: check service health, hostname/port, network allowlist, and backend egress.
- CA failure: check mounted path and PEM formatting; do not disable verification.
- Authentication failures: check stable JWT secret and account session version.
- API 503: distinguish frontend proxy configuration from backend/database failure.
- Email failure: check SMTP configuration, sender credentials, provider restrictions, and logs.
- Moderation denial: confirm session and backend-only ADMIN_USER_IDS.

After recovery, confirm data integrity, API readiness, frontend routes, and
expected privilege boundaries. Record observed events, not assumed causes.
Fault/recovery drills belong in an isolated test environment or scheduled maintenance.

## Secret Rotation

Rotate the actual database account and hosting secret together. Updating an
environment value alone does not change MySQL credentials. JWT rotation invalidates
sessions. SMTP app passwords and Docker Hub PATs require separate rotation.

The environment helper rejects changed database identities/secrets unless
`ALLOW_SECRET_UPDATE=yes` is explicitly supplied for a planned operation.
Docker access is highly privileged; never expose the Docker socket.

## Lifecycle

Account deletion, backup retention, moderation snapshot retention, off-host
monitoring, and scaling require an operational policy. Neither rate-limit
counters nor catalog caches are shared across replicas. Complete the
[production checklist](13-production-readiness.md) before expanding public access.
