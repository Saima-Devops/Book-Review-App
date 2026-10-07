# Optional EC2 HTTPS with an IP Certificate

Maintainer: Saima Usman.

This guide applies only to the optional EC2/Compose deployment. Northflank
public endpoints already provide managed HTTPS and do not use this procedure.

Let's Encrypt IP certificates use the shortlived profile, valid for 160 hours.
The included helper does **not** configure automatic renewal. This is unsuitable
for an unattended production endpoint until renewal, activation, and expiry
monitoring have been implemented.
[Certificate reference](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/).

## Prerequisites

An existing healthy Compose deployment, a stable public IPv4 address, inbound
80/443, a valid contact email, and agreement to the certificate authority's terms.
Keep port 80 available for HTTP validation. Back up before changing deployment
configuration. Never reuse addresses from a retired instance.

From the workstation, collect the existing runtime infrastructure settings,
enable HTTPS, and review the plan:

```bash
bash
source scripts/runtime-inputs.sh
export TF_VAR_enable_https=true
bash scripts/deploy.sh plan
```

Apply only the reviewed intended changes. Instance replacement can destroy local
data; a most-recent AMI lookup may propose replacement even for a networking change.
The apply phase changes infrastructure only.

## Certificate Issuance on EC2

From the deployment checkout, retaining the existing secrets and volume:

```bash
bash scripts/backup.sh
read -r -p "Current EC2 public IPv4: " CERT_IP
read -r -p "Certificate contact email: " CERT_EMAIL
read -r -p "Accept subscriber agreement? Type yes: " CERT_ACCEPT_TOS
export CERT_IP CERT_EMAIL CERT_ACCEPT_TOS
bash scripts/issue-ip-certificate.sh
```

The helper pulls Certbot, briefly stops only Nginx to bind port 80, then restarts
the proxy even if issuance fails. Avoid simultaneous deployments and repeated
failed issuance attempts. Certificate data remains under ignored
`tls/letsencrypt`; active files are staged in `tls/active`.
The private key is root-owned, group 101, mode 0640.

## Activation

For local-secret mode on EC2:

```bash
unset COMPOSE_FILE APP_IMAGE_TAG
export PUBLIC_URL="https://$CERT_IP"
export SECRET_SOURCE=local
python3 scripts/configure-env.py --non-interactive
docker compose config --quiet
docker compose run --rm --no-deps reverse-proxy -t
docker compose up -d --no-build --wait --wait-timeout 180
bash scripts/verify.sh
```

For Secrets Manager mode, retain SECRET_SOURCE=aws and the existing region/ARN.
Activation selects the HTTPS Compose overlay, mounts certificates read-only,
and publishes 443 -> 8443. HTTP application requests redirect to HTTPS with 308;
HTTP /health remains available for internal readiness checks. HSTS is not enabled.

## Verification and Renewal

```bash
curl --fail --silent --show-error -I "$PUBLIC_URL/"
openssl s_client -connect "$CERT_IP:443" -verify_ip "$CERT_IP" \
  -verify_return_error </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -dates -ext subjectAltName
```

Verify the IP SAN and notAfter deadline. Do not use curl -k or ignore browser
warnings. HTTPS is a separate browser origin; existing browser-local favourites
remain under the old origin.

Renew before expiry, restage the new certificate/key, validate Nginx, recreate
the proxy, and verify the served certificate. Automated renewal remains an
operator responsibility. Returning to HTTP is not a production recovery strategy.
