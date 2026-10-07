# Health Checks and Startup

Maintainer: Saima Usman.

## Compose

1. MySQL executes SELECT 1 using the configured application account/database.
2. Backend waits for healthy MySQL, initializes schema, and listens on 3001.
3. Frontend independently serves Next.js on 3000.
4. Nginx waits for healthy frontend/backend and checks /health through the API.

Backend readiness requests `/api/books`, which queries MySQL. Nginx `/health`
aliases that endpoint and returns the books response; it is not a dedicated
health JSON route. Frontend checks request `/`.

`depends_on` controls startup order, not ongoing recovery. `unless-stopped`
restarts exited processes but not merely unhealthy containers or intentionally
stopped services. Monitoring and recovery procedures remain necessary.

## Northflank

Configure HTTP checks on frontend port 3000 at `/` and backend port 3001 at
`/api/books` for database-backed readiness. Backend `/` is a lightweight process
check: it confirms initial startup but does not recheck database availability.
Allow sufficient startup time for TLS connection and schema initialization.

A frontend page check does not prove API or database readiness. Verify
`https://FRONTEND-HOSTNAME/api/books` separately. Platform health checks and
container HEALTHCHECK definitions are distinct; configure platform checks explicitly.
