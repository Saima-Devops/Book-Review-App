# Deployment architecture

This diagram describes the existing Reading Room repository, not the assignment's upstream sample app. Add the runtime FULL_NAME as a caption when capturing screenshot 2.

```mermaid
flowchart TB
    User["Public browser"]
    SSH["Operator: SSH from own IPv4 /32"]
    subgraph AWS["AWS EC2 Ubuntu 24.04 x86_64"]
      subgraph Front["Docker front-tier"]
        Proxy["Nginx reverse-proxy\nOnly public app port: 80 -> 8080"]
        Frontend["Next.js frontend :3000\nPages and /_next/static"]
        Backend["Express backend :3001\n/api and DB-backed readiness"]
      end
      subgraph Back["Docker back-tier: internal"]
        Database["MySQL database :3306"]
      end
      Volume[("db_data -> /var/lib/mysql\nEncrypted EC2 root disk")]
      Logs["Host logs/proxy"]
      Backups["Host backups\nCopy off-host for durability"]
    end
    Secret["Optional AWS Secrets Manager\nEC2 role reads one secret"]
    User -->|"HTTP :80"| Proxy
    SSH -->|"SSH :22"| AWS
    Proxy -->|"front-tier: pages + static assets"| Frontend
    Proxy -->|"front-tier: /api + /health"| Backend
    Backend -->|"back-tier only"| Database
    Database --- Volume
    Proxy --- Logs
    Database -. "manual logical dump" .-> Backups
    Secret -. "host setup, not browser" .-> AWS
```

The proxy also belongs to front-tier; the backend belongs to both networks. The database belongs only to back-tier. No application/database host port is published. The EC2 security group permits only 22 from the selected /32 and 80 publicly.

Assignment adaptations: Next.js needs a server for dynamic book IDs and new uploads. A static-only Nginx frontend would require source changes and remove current behavior. The existing /api/books endpoint performs a database query and is exposed as /health at the proxy. No backend source endpoint was added.
