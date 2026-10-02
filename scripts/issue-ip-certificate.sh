#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = --help ]; then
  echo 'Run on EC2: CERT_IP=public_IP CERT_EMAIL=your_email CERT_ACCEPT_TOS=yes bash scripts/issue-ip-certificate.sh'
  echo 'Issues one six-day certificate, briefly stopping only the proxy. No renewal is scheduled.'
  exit 0
fi
: "${CERT_IP:?Export the current EC2 public IPv4 address}"
: "${CERT_EMAIL:?Export your email address}"
test "${CERT_ACCEPT_TOS:-}" = yes || { echo 'Read https://letsencrypt.org/repository/ and export CERT_ACCEPT_TOS=yes to accept the subscriber agreement.' >&2; exit 1; }
python3 - "$CERT_IP" "$CERT_EMAIL" <<'PY'
import ipaddress
import sys
ip = ipaddress.ip_address(sys.argv[1])
if ip.version != 4 or not ip.is_global:
    raise SystemExit('CERT_IP must be a public IPv4 address.')
if '@' not in sys.argv[2] or any(c.isspace() for c in sys.argv[2]):
    raise SystemExit('Enter a valid contact email address.')
PY
test -f .env || { echo 'Existing deployment .env is required.' >&2; exit 1; }
certbot_image="${CERTBOT_IMAGE:-certbot/certbot:v5.4.0}"
docker compose config --quiet
# Pull before taking the proxy offline; the application and database stay running.
docker pull "$certbot_image"
sudo install -d -m 0700 tls tls/letsencrypt tls/work tls/logs
sudo install -d -o root -g 101 -m 0755 tls/active
# Permit the deployment owner to traverse to the two staged files, not the ACME account.
sudo chown "$(id -u):$(id -g)" tls
sudo chmod 0711 tls
restart_proxy() { docker compose start reverse-proxy; }
trap restart_proxy EXIT
docker compose stop reverse-proxy
docker run --rm -p 80:80 \
  -v "$PWD/tls/letsencrypt:/etc/letsencrypt" \
  -v "$PWD/tls/work:/var/lib/letsencrypt" \
  -v "$PWD/tls/logs:/var/log/letsencrypt" \
  "$certbot_image" certonly --standalone --non-interactive \
  --agree-tos --email "$CERT_EMAIL" --preferred-profile shortlived \
  --cert-name "$CERT_IP" --ip-address "$CERT_IP"
sudo install -o root -g 101 -m 0644 "tls/letsencrypt/live/$CERT_IP/fullchain.pem" tls/active/fullchain.pem
sudo install -o root -g 101 -m 0640 "tls/letsencrypt/live/$CERT_IP/privkey.pem" tls/active/privkey.pem
sudo openssl x509 -in tls/active/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
echo 'Certificate staged. Existing proxy will restart; HTTPS activation is a separate step.'
echo 'No automatic renewal configured. See docs/08-ip-https.md.'
