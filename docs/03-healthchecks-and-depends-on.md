# Readiness and startup

1. Database starts; its check runs SELECT 1 using the configured application database and user.
2. Backend waits for the database to become healthy. Its HTTP check requests /api/books, which performs a database query.
3. Frontend independently starts; its HTTP check verifies that Next.js serves /.
4. Reverse-proxy waits for healthy backend and frontend. Its check requests /health through Nginx to the backend query endpoint.

Check implementations are included in runtime images: mysql in MySQL, built-in fetch in Node 22, and wget in the Alpine Nginx image.

The public /health alias checks API/database readiness and returns the existing books response. It is not a new backend route and is not a full synthetic frontend check. Frontend readiness is checked separately.

depends_on controls initial startup, not ongoing recovery. unless-stopped restarts exited processes but does not restart an unhealthy process or one deliberately stopped by an operator. Monitoring should alert on unhealthy services. Nginx dynamically resolves Docker service names after container replacement.

Observed VM results: record deployment date, all four health statuses, and /health status after running the guide. No cloud execution or successful runtime evidence is claimed in this repository.
