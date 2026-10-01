# The Reading Room — AWS Docker Compose deployment

Prepared by **Saima Usman**. 

A refreshed Epic Book Review App with new UI, responsive book cards, title/author search, sorting, and favourites stored in this browser. Favourites are device-local; users and reviews live in MySQL.


## 1. Put the cleaned project on your Mac

Extract book-review-aws.zip into a new folder. Open Terminal:

```bash
cd ~/Downloads/book-review-aws
```

Adjust the path if you extracted elsewhere. The project should contain frontend/, backend/, infra/, ansible/, scripts/, docker-compose.yml and .env.example.

## 3. Verify local tools and AWS access

Run on your Mac, not inside the VM:

```bash
terraform version
ansible-playbook --version
aws --version
python3 --version
aws sts get-caller-identity >/dev/null && echo 'AWS authentication works'
```

Install missing tools through your normal Homebrew setup. Use your existing AWS CLI login/profile; never paste AWS keys into the project. If using a named profile, run `export AWS_PROFILE=your-profile`. AWS credentials must allow the VPC, EC2, security group, key pair and Elastic IP resources in infra/main.tf.

## 4. Create a dedicated SSH key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/reading-room -C 'saima-reading-room'
chmod 600 ~/.ssh/reading-room
export SSH_KEY="$HOME/.ssh/reading-room"
export APP_REPO="https://github.com/YOUR_GITHUB_USERNAME/book-review-app.git"
```

Do not overwrite an existing key. If you set a passphrase, add it to your SSH agent with `ssh-add ~/.ssh/reading-room`.

## 5. Configure AWS infrastructure

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
curl -4 https://checkip.amazonaws.com
```

Edit infra/terraform.tfvars:

```hcl
region = "ap-south-1"
instance_type = "t3.medium"
ssh_cidr = "YOUR_ACTUAL_PUBLIC_IPV4/32"
public_key_path = "~/.ssh/reading-room.pub"
```

The default VM has 4 GiB RAM to accommodate Next.js builds and MySQL. It, its disk, and its public IPv4 address incur AWS charges; this package does not claim free-tier eligibility. Changing instance size may replace/stop resources as shown by Terraform; inspect the plan. All three services share this one VM. There is no RDS or NAT gateway.

## 6. Review and create the infrastructure

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh plan
```

Review the saved plan. It must open only SSH 22 to your /32 and application ports 3000/3001 publicly. No MySQL 3306 rule exists.

When ready:

```bash
./scripts/deploy.sh apply
```

This applies the saved plan and runs Ansible's **prepare** phase: waits for SSH, installs Docker/Compose/Git, clones your public fork and overlays your edited source, creates protected secrets once, and writes the public addresses. It pauses before building/starting services so you can collect the assignment's sequential evidence. It clones your fork once; your local edited source takes precedence. The fork must be public for this credential-free workflow.

If provisioning succeeded but preparation was interrupted:

```bash
./scripts/deploy.sh prepare
```

Do not repeatedly apply an old saved plan. Generate a fresh plan for infrastructure changes.

## 7. Task 1 evidence: project and safe configuration

Connect:

```bash
APP_IP=$(terraform -chdir=infra output -raw public_ip)
ssh -i "$SSH_KEY" ubuntu@"$APP_IP"
cd /opt/reading-room
export PS1='Saima Usman | \u@\h:\w\$ '
printf 'Full Name: Saima Usman\n'
ls -la
```

Screenshot 1: ensure frontend/, backend/, .env.example, .gitignore and docker-compose.yml appear. No real .env contents should appear.

Screenshot 2:

```bash
printf 'Full Name: Saima Usman\n'
cat .env.example .gitignore frontend/.dockerignore backend/.dockerignore
```

Ansible generated a mode-0600 .env on this VM; you do not need to type database/JWT secrets manually. MYSQL_PASSWORD supplies backend DB_PASS too, avoiding mismatches. Extra DB_* names in .env.example document the app interface; Compose maps the actual database values from MYSQL_*.

## 8. Task 2: Dockerfiles and build

Screenshots 3 and 4:

```bash
printf 'Full Name: Saima Usman\n'
cat frontend/Dockerfile
cat backend/Dockerfile
```

Screenshot 5:

```bash
docker compose build
```

If your SSH session predates the Docker group change, reconnect; do not make the Docker socket world-writable. Build failure should be resolved before proceeding.

## 9. Task 3: Compose evidence

```bash
printf 'Full Name: Saima Usman\n'
cat docker-compose.yml
```

Capture screenshots 6–9 showing MySQL + SQL readiness check + volume mount, backend depends_on and CORS mapping, frontend public API build argument, and mysql_data volume definition. Compose displays references, not secret values. Do NOT screenshot `docker compose config` without --quiet: interpolation can expose secrets.

The frontend browser calls http://VM_PUBLIC_IP:3001/api/...; the backend calls mysql:3306. NEXT_PUBLIC_API_URL must have NO /api suffix and is baked into the frontend build. ALLOWED_ORIGINS is http://VM_PUBLIC_IP:3000. Ansible fills these with the Elastic IP automatically.

## 10. Task 4: start and verify

On the VM:

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 300
printf 'Full Name: Saima Usman\n'
docker compose ps
docker compose logs mysql backend --tail=50
```

Verify `.env` is untracked with `git check-ignore .env` and `git ls-files .env` (the second command should print nothing).

Capture screenshots 10 and 11. MySQL, backend and frontend should all be healthy; logs should show successful database connection. MySQL must have no published host port.

For future deployments from your Mac, this single command transfers your changes, rebuilds and verifies both URLs:

```bash
./scripts/deploy.sh configure
```

Existing .env secrets and the named database volume are retained. This still rebuilds images; it saves setup effort, not build time. Existing stale source files are not automatically removed from the VM, so renamed/deleted code should be reviewed when making later structural changes.

## 11. Task 5: browser checks

On your Mac open http://VM_PUBLIC_IP:3000. Register a NEW account, log in, open a book, submit a review and confirm it appears. Search, sort, and save a favourite too.

Capture screenshot 12 for registration/login, 13 for your posted review, and 14 for a successful API request in DevTools Network and no CORS errors in the cleared Console after repeating an action. Put **Saima Usman** as a clear caption beneath EACH browser screenshot in your Google Doc. Do not include passwords or Authorization headers in screenshots.

## 12. Task 6: persistence proof

Capture screenshot 15 showing your account/review BEFORE stopping. On the VM:

```bash
printf 'Full Name: Saima Usman\n'
docker compose down
docker compose up -d --wait --wait-timeout 300
docker compose ps
```

Capture screenshot 16 for the commands/status and screenshot 17 for the same account/review after restart. Refresh the browser and, ideally, log in again to show database-backed persistence rather than just cached account info.

**Never use `docker compose down -v` or volume pruning before this proof.** This volume survives container recreation; it does NOT provide a backup or survive deletion of the EC2 disk.

## 13. Task 7: six-line explanation

`docker compose down` removes the project's containers and network while preserving named volumes.
The mysql_data volume keeps MySQL users, books and reviews outside the containers.
Starting the stack again reconnects MySQL to the same stored data.
`docker compose down -v` also removes named volumes and deletes the database data.
A full reset is useful for disposable development data or testing first-start initialization.
Complete and capture the persistence evidence before considering a full reset.

## 14. Commit safely

From your Mac fork directory:

```bash
git check-ignore .env infra/terraform.tfvars ansible/inventory.ini
git ls-files '*env*'
git status --short
git add frontend backend infra/main.tf infra/terraform.tfvars.example \
  ansible/site.yml scripts/deploy.sh docker-compose.yml .env.example .gitignore README.md
git add -u
git diff --cached --stat
```

Inspect `git diff --cached` locally for secrets before committing. Only .env.example should be committed as environment configuration. Then:

```bash
git commit -m 'Redesign Book Review UI and automate AWS Compose deployment'
git push -u origin aws-compose-redesign
```

Screenshots must use the VM app and real user/review data. Any included UI preview uses sample API responses and is not deployment evidence.

## Teardown after submission

Do this only when you intend to remove the AWS environment and no longer need its data:

```bash
terraform -chdir=infra plan -destroy
terraform -chdir=infra destroy
```

Review the deletion list. Destroying the VM deletes its root disk and database volume. Export/backup data first if you need it.

## Validation and limits

The frontend production build passed with Next.js 15.5.27. Ansible syntax and Terraform HCL parsing passed. AWS provider initialization/validation, real Terraform apply, Docker image builds, MySQL integration, registration/login/review persistence, and browser CORS against AWS still require your environment. No cloud changes were executed here.

This is an HTTP assignment deployment. Use only lab credentials/data. Production would require HTTPS, hardened authentication, backups and stronger operations controls.

Reference: original application https://github.com/pravinmishraaws/book-review-app ; Docker installation https://docs.docker.com/engine/install/ubuntu/ ; Next.js release https://nextjs.org/blog/september-2026-security-release .
