# Proxy routes and same origin

Nginx is the only reverse proxy. Host port 80 maps to non-root container port 8080.

| Browser route | Private upstream |
| --- | --- |
| /, /login, /register, /book/ID, other application pages | frontend:3000 |
| /_next/static/ and /assets/ | frontend:3000 |
| /api/ | backend:3001, preserving the /api prefix |
| /health | backend:3001/api/books |

The Next.js application serves its pages; Express serves only API routes. This differs from the assignment's sample backend-rendered app.

NEXT_PUBLIC_API_URL=/ results in relative /api requests. The browser uses one origin for the UI and API, so CORS response headers are unnecessary. The unchanged backend receives an exact ALLOWED_ORIGINS value for its existing middleware. The proxy adds no CORS headers and suppresses the backend's allow-origin/allow-credentials headers.

Nginx suppresses upstream server-error bodies and returns a generic 503 JSON response, reducing exposure of database error objects from unchanged source. Query strings, bodies, authorization headers, and cookies are absent from the JSON access log. Do not put secrets in request URLs; Nginx's standard error log can include request context.

The supplied stack is HTTP for the assignment's port-80 requirement. Do not use real credentials or personal data over public HTTP. Internet production use additionally requires domain/TLS configuration. No port 443 or certificate setup is claimed here.

Observed page/API/static/health results: fill after executing scripts/verify.sh on the VM.
