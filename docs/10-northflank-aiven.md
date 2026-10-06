# Book Shelf on Northflank with Aiven MySQL

This is a manual deployment using two application services and an existing Aiven
MySQL database. No AWS resources, Northflank database addon, or separate proxy
service are required. Check your account's current free-plan limits before
creating services. Do not choose a paid plan or enable paid extras.

## 1. Keep the migrated database

The target is `book_shelf`, not `defaultdb`. Its imported data contains four
books, two reviews, and Saima Usman's account. The local database and original
backup are unchanged; the original backup still contains the removed test users.
Do not restore it over the cleaned database. Keep backups outside GitHub.

## 2. Publish the updated images

Review and commit the hosting changes locally, then push to `main`. Wait for
all GitHub Actions tests and Docker Hub publishing to succeed. Select the new
matching `backend-build-<run>-<attempt>` and `frontend-build-<run>-<attempt>` tags
from the workflow summary. Older images do not contain these hosting changes.
The repository is `saim2026/book-shelf`. Build tags let you control upgrades;
`backend-latest` and `frontend-latest` are moving aliases.

## 3. Create the backend service first

In the existing Northflank project in US Central, create a deployment service
from the published Docker Hub backend image. Use the available free service size.
Leave the image's startup command unchanged. Configure HTTP container port
`3001` and obtain a public HTTPS URL. The backend currently responds at `/`;
use `/` for an HTTP startup/readiness check if the platform requests a path.
The application starts listening only after database initialization succeeds.

Set these runtime variables through the service's environment/secret settings:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DB_HOST` | `book-shelf-db-book-shelf.f.aivencloud.com` |
| `DB_PORT` | `24720` |
| `DB_NAME` | `book_shelf` |
| `DB_USER` | `avnadmin` for initial setup; prefer a dedicated app user later |
| `DB_PASS` | Your Aiven password, stored as a secret |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Entire downloaded CA PEM, including BEGIN/END lines and real newlines |
| `JWT_SECRET` | New random secret, stored as a secret |

Generate a JWT secret locally with `openssl rand -hex 32`. Copy it directly
to the hosting secret setting; do not paste it into chat or commit it.
Use the same JWT secret for backend restarts, or existing sessions will be invalid.
Do not set `DB_SSL_CA_FILE` when using `DB_SSL_CA`. As an alternative, mount the
CA file and set `DB_SSL_CA_FILE` to its absolute container path, leaving
`DB_SSL_CA` unset. Invalid or missing certificates stop startup; certificate and
hostname verification are always enabled in TLS mode. Never bypass verification.

Aiven's allowlist must permit the backend's outbound connection. Check whether
your Northflank plan provides stable egress addresses before narrowing it;
your Mac's IP alone will not permit the hosted backend. Opening access to all
is broader exposure, not equivalent to an allowlist. Keep TLS, strong credentials,
and least-privilege database access regardless.

## 4. Create the frontend service

Use the matching published frontend image, its default startup command, and
HTTP container port `3000`. Set `NODE_ENV=production`, `PORT=3000`, and:

```text
BACKEND_API_ORIGIN=https://YOUR-BACKEND-HOSTNAME
```

This is the backend HTTPS origin only: no `/api` path, credentials, query, or
fragment. The image already has the browser API base compiled as `/`; runtime
`NEXT_PUBLIC_API_URL` cannot change that compiled setting. The frontend's new
server-side `/api/*` route reads `BACKEND_API_ORIGIN` at runtime and forwards
requests to the fixed backend. Authorization is forwarded; cookies, browser
origin, and client-supplied forwarding headers are not. Redirects are rejected.
Requests are uncached and have a 30-second upstream timeout.

Do not copy DB passwords, JWT secrets, or CA configuration to the frontend.
If calling the backend directly from a browser, separately configure its
`ALLOWED_ORIGINS`; this deployment uses same-origin frontend routing instead.
Your existing Compose Nginx proxy still handles `/api` directly, unchanged.

## 5. Verify before sharing

Run on your Mac, replacing the frontend hostname:

```bash
export PUBLIC_URL=https://YOUR-FRONTEND-HOSTNAME
curl --fail --silent --show-error "$PUBLIC_URL/api/books"
curl --fail --silent --show-error "$PUBLIC_URL/login" >/dev/null
```

Confirm the four imported titles, then check login, book details, favorites,
and ownership controls in the browser. Only test uploads/reviews if you intend
to save those records. Password recovery requires the existing SMTP settings
and the frontend public URL; follow `docs/password-recovery.md`. Do not claim
email recovery works until delivery is configured and tested. Supply SMTP values
as backend runtime secrets/settings instead of following the older guide's
EC2 deployment commands; no AWS setup is needed here. API rate limits remain
shared behind the frontend proxy, as with the existing Nginx deployment.

The old `scripts/verify.sh` also inspects local Docker Compose. It is not the
correct end-to-end check for these separately hosted services. Keep it for
Compose deployments. Free-plan uptime, inactivity rules, resource limits, and
region availability remain provider-controlled. Never run CI integration tests
with write access against this migrated database.
