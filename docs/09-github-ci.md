# GitHub Actions CI and Docker Hub Delivery

The workflow `.github/workflows/ci.yml` runs on pushes to `main`, pull requests
targeting `main`, and manual runs from the GitHub Actions tab. It uses GitHub's
temporary Ubuntu runners, not your EC2 instance. No AWS credentials, SSH keys,
production passwords, or IP certificate are needed. CI tests do not need secrets;
publishing on pushes to `main` requires the two Docker Hub secrets below.
This delivers tested images to Docker Hub, not an automatic EC2 deployment.

## What Gets Tested

- Backend unit tests use Node's built-in test runner: JWT authentication,
  registration/password hashing, login, book creation/validation, duplicate
  detection, all five star values, review ownership, edit/delete, rating averages,
  missing records, and database error responses.
- Python's standard-library unittest checks protected environment creation,
  secret-change safeguards, origin validation, HTTP/HTTPS selection, rollback,
  persistent-volume settings, private networks, and container hardening.
- Frontend ESLint and high/critical npm dependency audits run with locked installs.
- Production Dockerfiles build through Compose, including the Next.js build.
- A real temporary MySQL 8.4 database tests the API through Nginx: register/login,
  create a book, reject unauthenticated writes, create reviews, reject another
  user's edits/deletes, update ratings, and delete reviews.
- HTTP smoke checks verify the book list, login/register/book pages, a built static
  asset, database-backed readiness, and missing-page 404 behavior.
- Runtime checks verify non-root users and database persistence across a restart.
- The HTTPS overlay is exercised with a CI-only certificate for `127.0.0.1`.
  curl explicitly trusts that test certificate; it does not disable TLS verification.
  This verifies Nginx configuration, HTTPS routes, and HTTP-to-HTTPS redirects, not
  real Let's Encrypt issuance or the expiry of your EC2 certificate.

No application source or production dependency versions were changed. Backend
package scripts were added; the tests use existing dependencies and built-in
Node/Python libraries. Browser-interaction tests for favorites, Discover, and
star controls are not included; HTTP/API tests do not prove those UI interactions.
The workflow does not scan OS/container packages; npm audits cover npm dependencies.

## Run Safe Tests Locally (Mac)

Use Node.js 22 to match the application containers, Python 3, and the Docker
Compose CLI for configuration tests. These commands do not start containers or
write to a real database:

```bash
cd /Users/saimausman/Desktop/book-review-new
npm --prefix backend ci
npm --prefix backend test
python3 -m unittest discover -s tests -v
npm --prefix frontend ci
npm --prefix frontend run lint
```

If the Docker CLI is missing, the two Compose configuration tests are skipped
locally. GitHub runners have Docker, so they execute those tests.

## Enable and Run on GitHub

1. Review `git status --short` and the new files. Commit the test files, backend
   package script update, workflow, and this guide to your existing repository.
2. Push the commit to `main`, or open a pull request into `main`.
3. Open your repository on GitHub and select **Actions**.
4. Select **Book Shelf CI and Docker Hub Delivery** and open the newest run.
5. Check **Backend and Deployment Tests**, **Frontend Lint and Audit**, and
   **Docker API and HTTPS Tests**. All three should be green.
6. **Run workflow** runs tests only. Rerunning an original `main` push also retries
   publishing, using a new run-attempt build tag.
7. If a job fails, expand its failing step. The Docker job prints container status
   and recent logs before cleaning up. Fix the cause and push a new commit.

For pull requests, repository rules can require these three job checks before
merging. Check names appear after the first workflow run.

## Configure Docker Hub Publishing

1. Sign in to Docker Hub as `saim2026`. Open **Repositories > Create repository**.
   Select namespace `saim2026`, enter name `book-shelf`, choose **Public**, and
   create it. Only this one repository is needed. Public visibility lets others
   pull the images without your credentials.
2. In Docker account settings, create a personal access token for GitHub Actions
   with Read and Write access, without Delete access. Give it an expiration date.
   Never add the token to `.env`, source code, a screenshot, or a chat message.
3. In `Saima-Devops/Book-Review-App`, open **Settings > Secrets and variables >
   Actions > New repository secret**. Create `DOCKERHUB_USERNAME` with value
   `saim2026`, and `DOCKERHUB_TOKEN` with the token value.
4. Review and commit your application changes, the workflow, publishing script,
   publishing tests, and this guide. Push to `main` yourself.
5. Open the newest Actions run. Publishing runs only after both earlier jobs
   and every Docker/API/HTTPS check pass. Inspect **CD - Publish tested images
   to Docker Hub** and the run summary for the published tags.
6. Open `saim2026/book-shelf` on Docker Hub and select **Tags**. Each service gets
   `<service>-build-<run-number>-<attempt>`, `<service>-sha-<full-commit-SHA>`, and
   `<service>-latest`. For example: `saim2026/book-shelf:frontend-build-123-1`.

All images share one repository, so tags include the service name to avoid
overwriting each other:

| Service | Version example | Latest |
| --- | --- | --- |
| Frontend | `frontend-build-123-1` | `frontend-latest` |
| Backend | `backend-build-123-1` | `backend-latest` |
| Reverse proxy | `proxy-build-123-1` | `proxy-latest` |

A bare `latest` tag cannot represent three separate application images. It is
not published; always specify the service tag when pulling an image. For example:

```bash
docker pull saim2026/book-shelf:frontend-latest
docker pull saim2026/book-shelf:backend-latest
docker pull saim2026/book-shelf:proxy-latest
```

The publisher tags the exact images tested on the runner, not a second build.
Only the frontend, backend, and proxy are published; MySQL data, accounts,
reviews, runtime secrets, and TLS certificates are not included in the images.
Images use the runner's Linux/AMD64 architecture; ARM64 variants are not built.
Public frontend configuration is built for same-origin routing through the proxy.
For separate Northflank services, the frontend can instead forward `/api/*`
using the runtime `BACKEND_API_ORIGIN` setting. See `docs/10-northflank-aiven.md`.

Pull requests and manually dispatched runs never publish or receive registry
credentials. Main runs are serialized rather than canceled midway through a
publication. An older rerun can publish historical versions but cannot promote
the service's latest tags when its commit is no longer the current `main` head.
All versioned image pushes finish before any latest tags are updated. Docker
Hub does not update three tags atomically: if promotion partially fails,
use the matching build number and attempt across all services and rerun the failed workflow.
Build tags identify a specific attempt; SHA and latest tags can be updated on
reruns. Use a registry digest when an immutable image reference is required.

Missing secrets or a rejected token fail publishing clearly while leaving the
test results visible. Give the token Write permission and verify that the
`book-shelf` repository belongs to `saim2026`. Rotate expired tokens in GitHub secrets.
No AWS credentials or infrastructure changes are required.

Authentication uses `--password-stdin` and a private, temporary Docker config
directory removed when publishing exits. Registry credentials are never passed
as build arguments or copied into application images.

References: [Docker access tokens](https://docs.docker.com/security/access-tokens/),
[Docker login](https://docs.docker.com/reference/cli/docker/login/), and
[Docker image publishing](https://docs.docker.com/reference/cli/docker/image/push/).

Dependencies are installed using committed lockfiles. Audits fail for high or
critical npm vulnerabilities; new advisories can fail a previously passing run.
Do not bypass those failures without investigating them.

## Test Data Safety

The Docker job has a unique project and database-volume name based on the GitHub
run ID and attempt. Credentials are deliberately synthetic and must never be
used for production. The job creates books/users/reviews in that temporary
database and deletes ONLY its own CI volume during cleanup.

Do not copy the Docker job's commands onto EC2. In particular, never run its
`docker compose down --volumes` cleanup against the deployed stack.

`npm --prefix backend run test:integration` requires `TEST_API_URL` pointing to
localhost and `ALLOW_TEST_WRITES=yes`. These are safeguards, not proof that a
database is disposable: never enable them for a local production proxy or SSH
tunnel to production. Let GitHub Actions run integration tests for you.

GitHub Actions are pinned to verified release commit SHAs, the workflow token is
read-only, and checkout does not persist credentials. Pull requests do not use
`pull_request_target` or access deployment secrets. Future EC2 delivery should
be a separate, explicitly approved deployment phase; it is not enabled here.

References: [GitHub checkout action](https://github.com/actions/checkout),
[Node setup action](https://github.com/actions/setup-node), and
[Node.js test runner](https://nodejs.org/api/test.html).
