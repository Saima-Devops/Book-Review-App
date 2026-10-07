# Environment and Ports

Maintainer: Saima Usman. Values containing credentials belong in protected
environment files or hosting secrets, never source control.

## Managed Backend

| Variable | Purpose |
| --- | --- |
| NODE_ENV / PORT | production / 3001 |
| DB_HOST / DB_PORT | Aiven public hostname and service-specific port |
| DB_NAME / DB_USER / DB_PASS | Application database, database account, password |
| DB_SSL | true for Aiven |
| DB_SSL_CA_FILE | Absolute path to mounted CA PEM, e.g. /app/certs/ca.pem |
| DB_SSL_CA | Alternative inline CA PEM with real line breaks |
| JWT_SECRET | Persistent, randomly generated signing secret |
| ADMIN_USER_IDS | Comma-separated administrator account IDs; empty disables access |
| PUBLIC_URL | Frontend HTTPS origin used in recovery emails |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM | Optional reset-email delivery |
| ALLOWED_ORIGINS | Exact comma-separated browser origins for direct API calls |

Supply exactly one CA option. TLS mode validates both the certificate chain and
hostname; malformed/missing certificates fail startup. Aiven Overview may show
`defaultdb`; `DB_NAME=book_shelf` selects the application database independently.

## Managed Frontend

`PORT=3000`, `NODE_ENV=production`, and
`BACKEND_API_ORIGIN=https://BACKEND-HOSTNAME`. The origin has no port 3001,
`/api` suffix, credentials, query, or fragment. It is server-only runtime configuration.

`NEXT_PUBLIC_API_URL` is a build argument. Published frontend images compile it
as `/` so the browser uses same-origin `/api/*`. A runtime variable cannot change
already-compiled public configuration.

## Compose

| Component | Container port | Published port |
| --- | --- | --- |
| reverse-proxy | 8080; 8443 with TLS overlay | 80; 443 with TLS overlay |
| frontend | 3000 | None |
| backend | 3001 | None |
| database | 3306 | None |

The root `.env` supplies `PUBLIC_URL`, `MYSQL_DATABASE`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and `JWT_SECRET`. Compose maps these
to backend `DB_*` variables and `ALLOWED_ORIGINS`. Optional SMTP and admin
settings are forwarded to the backend. `BACKEND_API_ORIGIN` is unnecessary when
Nginx handles API routing.

`APP_IMAGE_TAG` labels local builds. `DB_VOLUME_NAME` defaults to
`reading-room_db_data`; retain the existing value during upgrades.
`NODE_IMAGE`, `MYSQL_IMAGE`, and `NGINX_IMAGE` support tested base-image overrides.

## Optional AWS Inputs

The Bash runtime helper collects region, x86_64 instance type, numeric root-disk
GiB, SSH IPv4 /32, key paths, repository, pushed commit, deployment directory,
secret source, and operator label (`FULL_NAME`). `TF_VAR_region` must match
`AWS_REGION`. `TF_VAR_enable_https=true` enables inbound 443; SSH remains restricted.
Secrets Manager uses `SECRET_ARN`; application secret values are not Terraform inputs.
