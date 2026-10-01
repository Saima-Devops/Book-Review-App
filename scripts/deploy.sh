#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-plan}"
for tool in terraform python3 tar; do command -v "$tool" >/dev/null || { echo "Install $tool first"; exit 1; }; done
case "$mode" in
  plan)
    terraform -chdir=infra init
    terraform -chdir=infra fmt
    terraform -chdir=infra validate
    terraform -chdir=infra plan -out=reading-room.tfplan
    ;;
  apply)
    test -f infra/reading-room.tfplan || { echo 'Run ./scripts/deploy.sh plan first'; exit 1; }
    terraform -chdir=infra apply reading-room.tfplan
    "$0" prepare
    ;;
  configure|prepare)
    command -v ansible-playbook >/dev/null || { echo 'Install Ansible first'; exit 1; }
    : "${SSH_KEY:?Set SSH_KEY to your private key path}"
    : "${APP_REPO:?Set APP_REPO to your public GitHub fork URL}"
    test -f "$SSH_KEY" || { echo 'Private key does not exist'; exit 1; }
    app_ip="$(terraform -chdir=infra output -raw public_ip)"
    python3 - "$app_ip" <<'SCRIPT'
import sys, os, json, re
from pathlib import Path
repo = os.environ['APP_REPO']
if not re.fullmatch(r'https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?',repo):
    raise SystemExit('APP_REPO must be a public GitHub HTTPS URL without credentials')
Path('deployment-vars.json').write_text(json.dumps({'app_repo':repo}))
Path('ansible/inventory.ini').write_text('[app]\nreading-room ansible_host='+sys.argv[1]+' ansible_user=ubuntu\n')
SCRIPT
    tar -czf source.tar.gz --exclude=node_modules --exclude=.next --exclude=.env --exclude='frontend/.env.*' --exclude='backend/.env.*' --exclude=.git frontend backend docker-compose.yml .env.example .gitignore
    extra_args=()
    if [ "$mode" = prepare ]; then extra_args+=(--skip-tags deploy); fi
    ansible-playbook "${extra_args[@]}" --extra-vars @deployment-vars.json -i ansible/inventory.ini --private-key "$SSH_KEY" --ssh-common-args='-o StrictHostKeyChecking=accept-new' ansible/site.yml
    ;;
  *) echo 'Usage: ./scripts/deploy.sh [plan|apply|prepare|configure]'; exit 1;;
esac
