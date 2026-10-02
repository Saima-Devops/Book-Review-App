# Environment, ports, and persistence

Variable names only; never paste real environment values into this document.

| Component | Required names | Internal port |
| --- | --- | --- |
| Provisioning | AWS_REGION, TF_VAR_region, TF_VAR_instance_type, TF_VAR_root_volume_size, TF_VAR_ssh_cidr, TF_VAR_public_key_path | SSH 22 from operator /32 |
| Optional EC2 secret role | TF_VAR_secret_arn | AWS HTTPS egress |
| Deployment | APP_REPO, APP_REF, APP_DIR, APP_IMAGE_TAG, SSH_KEY, PUBLIC_URL, SECRET_SOURCE, FULL_NAME | No extra public ports |
| Optional Secrets Manager | SECRET_ARN, AWS_REGION | Host-side API retrieval |
| Compose database | MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD | 3306 |
| Compose backend | NODE_ENV, PORT, DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, JWT_SECRET, ALLOWED_ORIGINS | 3001 |
| Frontend build | NEXT_PUBLIC_API_URL | 3000 |
| Proxy | No application secrets | 8080, published as host 80 |
| Optional overrides | NODE_IMAGE, MYSQL_IMAGE, NGINX_IMAGE, DB_VOLUME_NAME | None |

NEXT_PUBLIC_API_URL is built as /, making the existing API client use relative /api URLs. ALLOWED_ORIGINS is mapped from the runtime PUBLIC_URL. DB_HOST is the Compose service name database.

Runtime: backend uses node src/server.js; frontend uses next start. Database: MySQL 8.4. The db_data volume mounts /var/lib/mysql and defaults to Docker volume reading-room_db_data. DB_VOLUME_NAME can point to the previous reading-room_mysql_data volume during an upgrade.

MySQL initializes the database/user once. Existing backend Sequelize synchronization creates tables and seeds sample books only when Books is empty; no extra SQL initialization files are needed.

Readiness: MySQL executes SELECT 1 as the application user; backend queries /api/books; frontend requests /; proxy requests /health, routed to backend /api/books. Only Nginx publishes a port.
