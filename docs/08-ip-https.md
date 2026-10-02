# Assignment HTTPS Without a Domain

This optional extension adds a publicly trusted Let's Encrypt certificate for
your EC2 public IPv4 address. It does not change application source, your books,
reviews, database volume, README, or the existing HTTP configuration.

The certificate is valid for about six days (160 hours). There is deliberately
no automatic renewal. Use the certificate's printed `notAfter` timestamp as the
actual deadline. After that time, browsers and curl will reject it. Do not bypass
warnings or use real credentials after expiry. For a long-lived production app,
renewal monitoring and automation would be required.

Reference: [Let's Encrypt's Certbot IP certificate instructions](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/).

## Phase 1: Publish the Local Changes (Mac)

Run from your existing repository. No fork or new repository is needed.

```bash
cd /Users/saimausman/Desktop/book-review-new
git diff --check
git status --short
git add .gitignore infra/main.tf scripts/deploy.sh scripts/configure-env.py ansible/site.yml docker-compose.https.yml proxy/nginx.https.conf scripts/issue-ip-certificate.sh docs/08-ip-https.md
git commit -m "Add optional six-day IP certificate HTTPS deployment"
git push origin main
export APP_REF="$(git rev-parse HEAD)"
printf 'Deployment commit: %s\n' "$APP_REF"
```

Save the printed commit SHA for Phase 3. No infrastructure has changed yet.

## Phase 2: Open HTTPS in Terraform (Mac)

Use the same Bash terminal and runtime inputs used for your current deployment.
If that terminal has been closed, start Bash and source the helper again. Use
region `ap-south-1`, instance type `m7i-flex.large`, the SAME root disk size, SSH
source, existing key files, and secret configuration as your deployed stack.
Do not create another key or change database passwords.

```bash
bash
source scripts/runtime-inputs.sh
export TF_VAR_enable_https=true
bash scripts/deploy.sh plan
```

Read the plan. The intended change is an in-place security-group update opening
TCP 443. It must NOT replace the EC2 instance or destroy anything. A newer Ubuntu
AMI can cause a replacement because the existing Terraform AMI lookup uses
`most_recent`; if replacement appears, stop and ask for help. Do not apply it.

If the plan contains only the intended safe change:

```bash
bash scripts/deploy.sh apply
```

Enter `apply` at the confirmation prompt. Keep port 80 open: Certbot validates
ownership of the IP using HTTP on that port. SSH stays restricted to your /32;
MySQL, backend, and frontend ports stay private. No load balancer, domain, or new
EC2 instance is needed. Existing EC2, disk, and public-IP charges still depend on
your AWS account's credit coverage; this is not a guarantee of zero AWS charges.

Keep `TF_VAR_enable_https=true` for future Terraform plans while HTTPS is used.
The existing Terraform URL outputs still describe the base HTTP deployment;
the new application address will be `https://13.232.206.202`.

## Phase 3: Update the Existing Checkout (EC2)

From Mac, connect to your existing instance:

```bash
ssh -i "$HOME/.ssh/reading-room" ubuntu@13.232.206.202
```

All following commands are on EC2 unless marked otherwise:

```bash
cd /opt/reading-room
git status --short
```

If tracked files are modified, stop and review them. Do not force checkout or
delete anything. If clean, update to the exact commit printed in Phase 1:

```bash
read -r -p "Paste the new pushed commit SHA: " APP_REF
export APP_REF
git fetch origin main
git checkout --detach "$APP_REF"
git rev-parse HEAD
docker compose ps
bash scripts/backup.sh
```

All four services should still be running. Keep the backup filename. Updating
the checkout has not stopped the application or changed the database volume.

## Phase 4: Issue the IP Certificate (EC2)

Check that `CERT_IP` is still the public IP assigned to this instance. Enter your
real email at runtime; it is not committed to Git. Read the subscriber agreement
at [Let's Encrypt's repository](https://letsencrypt.org/repository/) before agreeing.

```bash
export CERT_IP=13.232.206.202
read -r -p "Certificate contact email: " CERT_EMAIL
export CERT_EMAIL
read -r -p "Accept the Let's Encrypt subscriber agreement? Type yes: " CERT_ACCEPT_TOS
export CERT_ACCEPT_TOS
bash scripts/issue-ip-certificate.sh
```

This pulls Certbot before stopping Nginx, then briefly stops ONLY the proxy so
Certbot can bind port 80. The database, backend, and frontend are not stopped.
The proxy is restarted even if certificate issuance fails. Do not run another
deployment at the same time. If issuance fails, read the error before retrying;
do not repeatedly request certificates because issuance is rate limited.

Success prints the issuer, IP subject alternative name, and expiry dates. This
requests a trusted certificate, not a staging/self-signed certificate. Certbot
runs as a temporary container; no cron job or renewal timer is installed.

The ACME account and certificate originals stay under ignored `tls/letsencrypt`.
Only the full chain and private key are copied into `tls/active` for Nginx. The
private key belongs to root, group 101, mode 0640; Nginx remains UID/GID 101 with
read-only certificate mounts. Never print, upload, or commit the private key.

## Phase 5: Activate HTTPS (EC2)

Keep the existing image tag and secret values. The environment helper reads
them from your existing `.env`; changing the public origin does not rotate them.
Clear any old origin/Compose overrides before activation:

```bash
unset COMPOSE_FILE APP_IMAGE_TAG
export PUBLIC_URL="https://$CERT_IP"
export SECRET_SOURCE=local
python3 scripts/configure-env.py --non-interactive
docker compose config --quiet
docker compose run --rm --no-deps reverse-proxy -t
docker compose up -d --no-build --wait --wait-timeout 180
```

The `.env` now selects both Compose files automatically, including in future
SSH sessions. The already-built images are reused. Only the proxy and backend
should need recreation: the proxy gets TLS, and the backend gets the HTTPS
allowed origin. The MySQL named volume is unchanged. Never run `down -v`.

If `nginx -t` fails, stop here and inspect its error before `up`. If activation
fails, use the rollback below. Your application is now served through HTTPS;
HTTP page/API requests redirect with status 308. `/health` remains available on
HTTP for internal readiness checks. HSTS is intentionally omitted so the short
assignment certificate does not impose a long-lived browser HTTPS policy.

## Phase 6: Verify and Take Evidence (EC2)

```bash
export PUBLIC_URL="https://$CERT_IP"
curl --fail --silent --show-error -I "$PUBLIC_URL/"
curl --silent --show-error -I "http://$CERT_IP/"
bash scripts/verify.sh
openssl s_client -connect "$CERT_IP:443" -verify_ip "$CERT_IP" -verify_return_error </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates -ext subjectAltName
docker compose exec reverse-proxy id
```

The HTTPS request should succeed without `-k`; HTTP should show `308` and a
`Location: https://...` header. The verification script should print all OK lines
and healthy services. The certificate SAN must contain your IP. Nginx `id`
should show UID/GID 101, not root. Capture this output and a browser screenshot
of the HTTPS address with the book list displayed for deployment evidence.

Open `https://13.232.206.202` in your browser. Check login and books. Browser
storage is separate for HTTP and HTTPS origins, so you may need to sign in again
and reselect browser-local favorites; database books and reviews are preserved.

If curl cannot connect, check the Terraform 443 rule, `docker compose ps`, and
`docker compose logs --tail=80 reverse-proxy`. If the certificate is rejected,
check the IP SAN, current UTC time, and `notAfter`. Do not disable verification.

## Roll Back to the Original HTTP Stack (EC2)

Use this only for an assignment/demo with no sensitive credentials. Returning
to HTTP removes transport encryption; it is not a production security solution.

```bash
cd /opt/reading-room
unset COMPOSE_FILE APP_IMAGE_TAG
export PUBLIC_URL=http://13.232.206.202
export SECRET_SOURCE=local
python3 scripts/configure-env.py --non-interactive
docker compose up -d --no-build --wait --wait-timeout 180
bash scripts/verify.sh
```

This deselects the TLS overlay without deleting certificates, data, or files.
For long-lived HTTPS, manually issue a new certificate and reactivate, or arrange
proper automated renewal separately. No renewal has been configured here.
