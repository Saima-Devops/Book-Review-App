# The Reading Room

A book review app for discovering books, sharing ratings and reviews, and keeping a personal favourites list.

## Features

- Register, log in, and log out.
- Browse books, search by title or author, and sort by title or rating.
- Add a book with its title, author, and starting rating while logged in.
- Post reviews with a 1-5 star rating.
- Edit or delete your own reviews; ownership is checked by the API.
- Update a book's average rating when reviews are added, edited, or deleted.
- Save books in My favourites and filter the collection to saved books.
- Use a responsive interface with collection and favourites navigation.

Users, books, and reviews are stored in MySQL. Favourites are stored in browser local storage, separately for each signed-in user and guests. They persist on that browser but do not sync between devices. Adding a book currently means submitting its details, not uploading an ebook or cover file.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 App Router, React 19, CSS, Tailwind CSS 4, Axios |
| API | Node.js, Express 4 |
| Database | MySQL 8.4, Sequelize 6, mysql2 |
| Authentication | JSON Web Tokens, bcryptjs password hashing |
| Quality checks | ESLint, npm audit |
| Containers | Docker, Docker Compose v2 |
| Optional AWS automation | Terraform, Ansible, Bash |

Docker images use Node.js 22 Alpine. Direct npm dependencies are pinned and both lockfiles are included for reproducible installs. Targeted overrides supply patched PostCSS for Next.js and UUID for Sequelize.

## Project structure

```text
frontend/           Next.js app and frontend Dockerfile
backend/            Express API, models, and backend Dockerfile
infra/              Optional Terraform AWS infrastructure
ansible/            Optional EC2 provisioning and deployment
scripts/deploy.sh   Terraform/Ansible deployment helper
docker-compose.yml  Frontend, backend, and MySQL services
.env.example        Environment variable reference
```

## Fork and clone

Fork this repository on GitHub, then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

Use the actual repository name in both commands. Commit package lockfiles with dependency changes. Keep passwords, JWT secrets, and real environment files out of Git.

## Run with Docker Compose

Install Docker Engine or Docker Desktop with Compose v2. Create a root environment file:

```bash
cp .env.example .env
```

Edit `.env` with these values, replacing all secret placeholders with unique randomly generated values:

```dotenv
MYSQL_ROOT_PASSWORD=REPLACE_WITH_RANDOM_ROOT_PASSWORD
MYSQL_DATABASE=book_review_db
MYSQL_USER=bookreview_user
MYSQL_PASSWORD=REPLACE_WITH_RANDOM_APP_PASSWORD
JWT_SECRET=REPLACE_WITH_RANDOM_JWT_SECRET
ALLOWED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Generate each secret separately with `openssl rand -hex 32`. Compose maps `MYSQL_PASSWORD` to the backend's `DB_PASS`; extra `DB_*` variables in the example are unnecessary for Compose.

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 300
docker compose ps
```

Open [the app](http://localhost:3000). The [books API](http://localhost:3001/api/books) should respond. Sample books are created when the database is empty.

The browser calls the backend through `NEXT_PUBLIC_API_URL`. This URL must be browser-accessible and must not include an `/api` suffix. It is baked into the frontend during build, so rebuild the frontend after changing it. `ALLOWED_ORIGINS` must match the frontend URL exactly; multiple origins may be comma-separated.

MySQL is accessible only inside the Compose network. Accounts, books, and reviews persist in the `mysql_data` named volume.

```bash
docker compose logs --tail=100 backend frontend mysql
docker compose down
docker compose up -d --wait --wait-timeout 300
```

`docker compose down` preserves the database volume. `docker compose down -v` deletes it and its data. Database backups are separate from volume persistence. Changing password variables after initial MySQL initialization does not change existing database passwords.

## Local development without app containers

Install Node.js 22 and npm. Start a local MySQL server and create a database and application user with access to that database. Alternatively, configure the root `.env` as above and use the existing MySQL service with the following temporary override. This publishes MySQL only on localhost for the API running on your host:

```yaml
# Save as compose.local.yml in the project root.
services:
  mysql:
    ports:
      - "127.0.0.1:3306:3306"
```

```bash
docker compose -f docker-compose.yml -f compose.local.yml up -d --wait mysql
```

Create `backend/.env`:

```dotenv
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=book_review_db
DB_USER=bookreview_user
DB_PASS=YOUR_MYSQL_APP_PASSWORD
JWT_SECRET=YOUR_RANDOM_JWT_SECRET
ALLOWED_ORIGINS=http://localhost:3000
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Start the API in one terminal:

```bash
cd backend
npm ci
npm start
```

Start the frontend in another terminal from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The API creates the tables on startup; the database itself must already exist.

## Deploy on AWS EC2

Use an Ubuntu EC2 instance with enough memory for MySQL and the frontend build; the included Terraform configuration uses `t3.medium`. Attach a security group allowing SSH port 22 from your own IP and application ports 3000 and 3001 from the intended audience. Do not expose MySQL port 3306.

1. Install Git, Docker Engine, and Docker Compose v2 on the instance.
2. Clone your GitHub fork onto the instance.
3. Create the root `.env` as described above with unique secrets.
4. Set `ALLOWED_ORIGINS=http://EC2_PUBLIC_IP:3000` and `NEXT_PUBLIC_API_URL=http://EC2_PUBLIC_IP:3001`. Use the actual public IP or DNS name.
5. Run `docker compose config --quiet`, then `docker compose up -d --build --wait --wait-timeout 300`.
6. Check `docker compose ps`, open the app, register, and test adding a book, reviewing it, editing/deleting the review, and saving a favourite.

Use a stable address such as an Elastic IP. For an HTTPS deployment, configure TLS and routing through a reverse proxy and use matching HTTPS frontend/API URLs. The supplied Compose file exposes HTTP on ports 3000 and 3001.

To deploy subsequent committed changes:

```bash
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 300
```

This preserves the named database volume. Refer to [Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/) for host installation.

### Optional Terraform and Ansible workflow

Install Terraform, Ansible, and the AWS CLI on your workstation and configure AWS authentication. Create a dedicated SSH key, copy `infra/terraform.tfvars.example` to `infra/terraform.tfvars`, and set the region, instance type, your SSH IP range, and public key path.

```bash
export SSH_KEY="$HOME/.ssh/reading-room"
export APP_REPO="https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git"
bash scripts/deploy.sh plan
bash scripts/deploy.sh apply
```

Review the Terraform plan before applying. The apply command creates infrastructure and prepares the EC2 host, but skips starting the app. Start it with:

```bash
bash scripts/deploy.sh configure
```

Preparation clones a public fork, transfers local application source, installs Docker, generates secrets on the first deployment, and sets public URLs. Later configure runs retain the secrets and database volume. These resources incur AWS charges.

## Dependency checks

Run in each application directory:

```bash
npm ci
npm audit
npm ls --all
```

Run frontend checks in `frontend/`:

```bash
npm run lint
npm run build
```

Audit results reflect the advisory database at the time they run. Container operating-system packages require a separate image scan; rebuild with `docker compose build --pull` to refresh base images.

## Attribution

Based on the [original Book Review App - Epic Book by Pravin Mishra](https://github.com/pravinmishraaws/book-review-app).
