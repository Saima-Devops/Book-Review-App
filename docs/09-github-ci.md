# GitHub Actions Tests

The workflow `.github/workflows/ci.yml` runs on pushes to `main`, pull requests
targeting `main`, and manual runs from the GitHub Actions tab. It uses GitHub's
temporary Ubuntu runners, not your EC2 instance. No AWS credentials, SSH keys,
production passwords, IP certificate, or GitHub repository secrets are needed.
AWS provisioning and deployment remain manual. This is the CI/test stage of a
CI/CD pipeline, not an automatic EC2 deployment workflow.

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
4. Select **Reading Room CI** and open the newest run.
5. Check **Backend and Deployment Tests**, **Frontend Lint and Audit**, and
   **Docker API and HTTPS Tests**. All three should be green.
6. For a manual rerun, select **Run workflow**, choose your branch, and confirm.
7. If a job fails, expand its failing step. The Docker job prints container status
   and recent logs before cleaning up. Fix the cause and push a new commit.

For pull requests, repository rules can require these three job checks before
merging. Check names appear after the first workflow run.

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
