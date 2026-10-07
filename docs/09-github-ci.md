# GitHub Actions and Docker Hub Delivery

Maintainer: Saima Usman.

Workflow: **Book Shelf CI and Docker Hub Delivery**, defined in
`.github/workflows/ci.yml`. It runs for pushes to main, pull requests targeting
main, and workflow_dispatch. Successful main push runs publish images automatically.
Manual runs publish only on main with the explicit "Publish tested images to
Docker Hub" checkbox selected. The default manual run validates without publishing.

## Checks

- Backend unit tests cover authentication, ownership, ratings, catalog input, cover validation,
  recovery, database TLS options, reporting, and moderation decisions.
- Python tests cover configuration, secret preservation/rotation safeguards,
  Compose networks/storage, and image-publishing behavior.
- Frontend lint-adapter and API-proxy tests, ESLint, and npm audits run with locked dependencies.
- Docker builds compile production images and start a disposable MySQL stack.
- API integration tests check registration, reviews, book ownership, reporting,
  admin access, duplicate reports, dismissal, removal, ratings, decision history,
  cover upload/download, invalid images, and cover deletion.
- HTTP checks cover pages, API, static assets, readiness, and missing-page status.
- Container checks verify non-root application users and book/cover persistence after database restart.
- The HTTPS overlay uses a runner-only certificate with explicit curl trust,
  verifying HTTPS and redirects without disabling verification.

The workflow does not perform browser-interaction regression tests, image OS
scanning, real certificate issuance, SMTP delivery tests, or cloud deployment.
Local browser checks do not replace an automated browser test job.

## Local Checks

```bash
npm --prefix backend ci
npm --prefix backend test
npm --prefix backend audit --audit-level=high
npm --prefix frontend ci
npm --prefix frontend run test:lint-glob
npm --prefix frontend run test:hosting
npm --prefix frontend run lint
npm --prefix frontend audit --audit-level=high
python3 -m unittest discover -s tests -v
git diff --check
```

Use Node.js 22 and Python 3. Docker Compose configuration tests require the CLI,
not a running daemon; without the CLI those tests are skipped.
Database integration requires a running disposable stack, TEST_API_URL pointing
to localhost, and ALLOW_TEST_WRITES=yes. Never enable write tests against a
production proxy or tunnel.

## Registry Configuration

Repository: [saim2026/book-shelf](https://hub.docker.com/r/saim2026/book-shelf).
Configure GitHub repository secrets DOCKERHUB_USERNAME=saim2026 and
DOCKERHUB_TOKEN with a time-limited Read/Write Docker Hub PAT, without Delete
access. Credentials are available only to the publishing step, not PR runs.

| Service | Build tag example | Moving alias |
| --- | --- | --- |
| Frontend | frontend-build-123-1 | frontend-latest |
| Backend | backend-build-123-1 | backend-latest |
| Compose proxy | proxy-build-123-1 | proxy-latest |

Each service also receives SERVICE-sha-FULL_COMMIT_SHA. A bare latest tag is not
published because the repository contains three different images.
Build tags identify a run and attempt; registry digests provide immutable
references. SHA/latest aliases can change on reruns.

The publisher tags the exact tested images, pushes every version before latest
promotion, and skips latest promotion when a rerun's commit is no longer main's
head. Main jobs are serialized. Multi-tag promotion is not atomic: matching
build tags/digests avoid mixed releases after partial failures.
Each pushed tag is checked against Docker Hub using manifest inspection before
publication is marked complete. Successful runs show full deployable image
references in the final Docker Hub Delivery Report and publishing logs.

The delivery report runs after checks even when publishing fails or is skipped.
It distinguishes a verified release, a validation-only run, failed checks, partial
pushes, and an unchanged latest alias. It never offers new deployment references
without a complete verified publication. A failure after publishing remains
visible rather than being reported as a successful pipeline.

Images are Linux/AMD64. No database data, secret values, or certificate files are
baked into them. Registry authentication uses password-stdin and a private
temporary Docker configuration removed on exit.

## Release Boundary

Manual workflow runs execute tests and publish only with explicit main-branch opt-in.
An original main push rerun may publish with a new attempt number. High/critical npm advisories fail
the workflow; advisory changes can fail a previously passing release.

GitHub actions are pinned to release commit SHAs, the workflow token is read-only,
and checkout does not persist credentials. The disposable CI volume is uniquely
named per run/attempt and deleted only on its runner. ADMIN_USER_IDS=1 grants
the first synthetic CI account moderation access; it is not image configuration.

Northflank/EC2 rollout remains a separate operator-approved operation. See the
[installation guide](../installation_guide.md) and
[operations runbook](07-operations-runbook.md).

References: [Docker PATs](https://docs.docker.com/security/access-tokens/),
[GitHub Actions](https://docs.github.com/en/actions),
[Node test runner](https://nodejs.org/api/test.html).
