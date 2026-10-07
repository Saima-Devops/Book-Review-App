# Deployment Architecture

Maintainer: Saima Usman.

## Managed Hosting

```mermaid
flowchart LR
  Reader["Browser"] -->|"HTTPS"| Frontend["Northflank: book-shelf-frontend\nNext.js :3000"]
  Frontend -->|"HTTPS /api/*\nAuthorization forwarded"| Backend["Northflank: book-shelf-backend\nExpress :3001"]
  Backend -->|"MySQL verified TLS"| DB[("Aiven MySQL\nbook_shelf")]
  Backend -->|"Optional verified SMTP"| Mail["Email provider"]
  Actions["GitHub Actions"] -->|"Tested versioned images"| Registry["Docker Hub\nsaim2026/book-shelf"]
  Registry -. "Manual release selection" .-> Frontend
  Registry -. "Manual release selection" .-> Backend
```

Northflank terminates public HTTPS. Container networking remains HTTP. The
frontend forwards same-origin API requests using its server-only runtime
`BACKEND_API_ORIGIN`. Backend secrets are not shared with the frontend.
Aiven stores Users, Books, Reviews, and Reports. Favourites remain in browser
local storage.
Optional book covers are normalized JPEGs stored in Books, not on an ephemeral
container filesystem. The frontend serves them through the same API proxy.

## Docker Compose / Optional AWS EC2

```mermaid
flowchart TB
  Reader["Browser"] -->|"80; 443 with TLS overlay"| Proxy["reverse-proxy\nNginx :8080 / :8443"]
  Proxy -->|"Pages and assets"| Frontend["frontend\nNext.js :3000"]
  Proxy -->|"/api/*"| Backend["backend\nExpress :3001"]
  Proxy -->|"/health -> /api/books"| Backend
  Backend -->|"Internal back-tier"| DB[("database\nMySQL :3306")]
  DB --- Volume[("Persistent db_data volume")]
  Proxy --- Logs["Host logs/proxy"]
```

Frontend/proxy use `front-tier`; backend uses both networks; database uses only
internal `back-tier`. Only Nginx publishes application ports. EC2 is an optional
single-host deployment using Ubuntu x86_64, not a prerequisite for managed hosting.
Retained `reading-room` names avoid replacing existing infrastructure and volumes.
Neither free hosting nor a single EC2 host provides application-level high availability.
