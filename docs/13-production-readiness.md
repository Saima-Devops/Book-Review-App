# Production Release Readiness

Maintainer: Saima Usman.

This checklist describes release responsibilities, not a security certification.
Passing CI and using HTTPS do not eliminate all vulnerabilities or establish
high availability.

## Required Release Controls

- All CI jobs and Docker Hub publishing succeed for the intended commit.
- Frontend/backend references come from the same tested run/attempt; digests are recorded.
- Data is backed up off-host, and an isolated restore has been tested.
- Database access uses verified TLS, strong credentials, and appropriate account privileges.
- Network access permits required backend egress without unnecessarily broad source ranges.
- Public endpoints use valid HTTPS; expiry/renewal is monitored where applicable.
- Signing secrets remain stable across upgrades and are kept out of images/source.
- Administrator IDs are verified in the correct deployment database.
- Logs and API responses are reviewed for credential/internal-detail disclosure.
- User-facing optional features are tested before being advertised as available.

## Known Boundaries

- Free service plans have resource/inactivity limits and may lack an SLA.
- A single backend/database deployment is not an application HA architecture.
- Favourites remain browser-local rather than synchronized database preferences.
- SMTP and a custom domain require separate configuration; neither is enabled by default.
- Signup does not verify email ownership.
- Rate limits and catalog caches are process-local; scaling requires shared coordination.
- Password-recovery rate limiting behind a proxy can group multiple clients.
- Moderation snapshots persist after target deletion; retention and privacy policy are operational requirements.
- Some legacy backend error responses include database error objects; assess/redact public exposure.
- The provided EC2 IP certificate helper does not automate renewal.
- CI npm audits do not scan container OS packages; run an approved image scanner before release.
- Browser interaction checks are not currently a persistent CI browser-test job.

## Security and Privacy Operations

Restrict hosting, registry, database, and backup access. Prefer dedicated service
accounts and scoped tokens. Establish patching, credential rotation, data retention,
incident response, and account-deletion procedures. Avoid publishing secrets,
user exports, report text, or private deployment details in documentation.

## Release Record

Record the actual commit, image digests, deployed configuration version, backup
reference, deployment time, verification results, and approved exceptions in a
private operational record. Do not mark a checklist complete based on anticipated
results or an earlier image's tests.
