# Routing and CORS

Maintainer: Saima Usman.

## Managed Hosting

Browser requests use the frontend origin. Next.js routes `/api/*` to the HTTPS
backend configured by `BACKEND_API_ORIGIN`. The route preserves method, path,
query, request body, authorization, backend status, and Retry-After.

It does not forward browser cookies, Origin, or client-provided forwarding
headers. It rejects redirects, disables caching, uses a 30-second upstream
timeout, and returns generic errors for connection/configuration failures.
The target host comes from server configuration, not user input.

The backend's existing error responses are otherwise preserved. Review legacy
database error exposure before a public production release; this proxy is not
a general error-redaction layer.

## Compose Nginx

| Route | Upstream |
| --- | --- |
| Pages, /book/ID, /_next/static/, /assets/ | frontend:3000 |
| /api/ | backend:3001, preserving prefix |
| /health | backend:3001/api/books |

The proxy suppresses upstream 500/502/503/504 bodies with generic 503 JSON and
omits query strings, bodies, cookies, and authorization headers from access logs.
Standard error logs can still include request context.

Same-origin browser requests do not require cross-origin access. Direct browser
calls to the backend require the exact frontend origin in `ALLOWED_ORIGINS`.
The backend retains its existing CORS validation; CORS is not authentication.

Compose's base file serves HTTP. Public credentials require the TLS overlay or
another trusted HTTPS entry point. Northflank supplies managed public HTTPS.
