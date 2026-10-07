# Northflank and Aiven Deployment

Maintainer: Saima Usman.

The managed stack uses two Northflank deployment services and an external Aiven
MySQL service. It does not need a Northflank database addon, AWS resources, or
a separate Nginx service. The full procedure is in
[installation_guide.md](../installation_guide.md).

## Backend Configuration

Image: docker.io/saim2026/book-shelf:backend-build-RUN-ATTEMPT.
Use a matching tested release tag or digest; backend-latest is a moving alias.
Retain the image startup command and configure HTTP port 3001, public access,
and a platform database-backed health check at /api/books.

| Runtime setting | Value |
| --- | --- |
| NODE_ENV / PORT | production / 3001 |
| DB_HOST / DB_PORT | Current Aiven service hostname / service-specific port |
| DB_NAME | book_shelf, or the actual application database |
| DB_USER / DB_PASS | Application database account / secret password |
| DB_SSL | true |
| DB_SSL_CA_FILE | /app/certs/ca.pem |
| JWT_SECRET | Stable random signing secret |
| ADMIN_USER_IDS | Verified administrator IDs, or empty |

Mount the downloaded Aiven CA as a runtime file at /app/certs/ca.pem. The path
must be absolute and readable by the non-root container user.
Leave DB_SSL_CA unset. Alternatively, provide the complete PEM as DB_SSL_CA
with real line breaks and leave DB_SSL_CA_FILE unset. Never configure both.

Aiven's defaultdb connection example does not override DB_NAME. Create the
application database before startup and import required existing records before
allowing sample initialization. For established deployments, retain the database
and credentials rather than creating a new service.

A dedicated database account scoped to book_shelf is preferred over avnadmin.
It needs the application's data permissions and permissions for documented
startup schema changes. Validate account privileges before switching credentials.

## Frontend Configuration

Image: docker.io/saim2026/book-shelf:frontend-build-RUN-ATTEMPT.
Use the same run/attempt as the backend.

```dotenv
NODE_ENV=production
PORT=3000
BACKEND_API_ORIGIN=https://BACKEND-PUBLIC-HOSTNAME
```

Configure HTTP container port 3000, public access, and an HTTP / health check.
Northflank terminates public HTTPS; HTTP is the correct container protocol.
The runtime backend origin must not contain /api, :3001, credentials, or query.
Do not copy database credentials, signing secrets, or CA files into the frontend.

The published frontend is compiled with NEXT_PUBLIC_API_URL=/ and proxies
/api/* at runtime. Changing NEXT_PUBLIC_API_URL after image build does not
reconfigure browser code. Nginx handles this routing separately in Compose.

## Networking and Diagnostics

The Aiven allowlist must permit Northflank's outbound addresses, not just an
operator's laptop. Check plan support and cost for stable egress before choosing
a restricted production allowlist.

0.0.0.0/0 permits all IPv4 sources; ::/0 permits all IPv6 sources. Either open
range can cause the console to display an open-access warning. A successful
temporary open-access test is not a completed network-hardening step.
TLS and credentials are still required; they do not substitute for access restriction.

- Invalid CA: check exact file contents/path and remove conflicting CA variables.
- ETIMEDOUT: check database running status, hostname/port, allowlist, and egress.
- Frontend API 503: check BACKEND_API_ORIGIN and backend reachability.
- API access errors: check database credentials and actual target database.

## Public Verification

```bash
export PUBLIC_URL=https://FRONTEND-PUBLIC-HOSTNAME
curl --fail --silent --show-error "$PUBLIC_URL/api/books"
curl --fail --silent --show-error "$PUBLIC_URL/login" >/dev/null
```

Confirm expected records, then test authentication, details, reviews, ownership,
favourites, and reporting. Use disposable content for removal tests.
scripts/verify.sh inspects Compose and is not a managed-hosting verification tool.

SMTP and a custom domain are optional; configure them separately and test
delivery/DNS/certificates before announcing availability.
Free-plan limits, inactivity rules, and uptime are provider-controlled.
[Northflank networking](https://northflank.com/docs/v1/application/network/networking-on-northflank)
and [Aiven free-tier limits](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier).
