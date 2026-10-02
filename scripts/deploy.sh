#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-help}"

require() {
  command -v "$1" >/dev/null || { echo "Install $1 first." >&2; exit 1; }
}
provision_inputs() {
  : "${AWS_REGION:?Source scripts/runtime-inputs.sh first}"
  : "${TF_VAR_region:?Missing region}"
  : "${TF_VAR_instance_type:?Missing instance type}"
  : "${TF_VAR_root_volume_size:?Missing disk size}"
  : "${TF_VAR_ssh_cidr:?Missing SSH CIDR}"
  : "${TF_VAR_public_key_path:?Missing public key}"
  test "$AWS_REGION" = "$TF_VAR_region" || { echo "Region variables must match." >&2; exit 1; }
}
case "$mode" in
  plan)
    require terraform
    provision_inputs
    terraform -chdir=infra init
    terraform -chdir=infra validate
    # CLI values override any leftover terraform.tfvars from older deployments.
    terraform -chdir=infra plan -out=reading-room.tfplan \
      -var="region=$TF_VAR_region" \
      -var="instance_type=$TF_VAR_instance_type" \
      -var="root_volume_size=$TF_VAR_root_volume_size" \
      -var="ssh_cidr=$TF_VAR_ssh_cidr" \
      -var="public_key_path=$TF_VAR_public_key_path" \
      -var="secret_arn=${TF_VAR_secret_arn:-}"
    ;;
  apply)
    require terraform
    test -f infra/reading-room.tfplan || { echo "Run the plan command first." >&2; exit 1; }
    # Applying a saved plan has no Terraform confirmation prompt.
    read -r -p "Type apply to create/update the resources in the reviewed plan: " confirmation
    test "$confirmation" = apply || { echo "Cancelled."; exit 1; }
    terraform -chdir=infra apply reading-room.tfplan
    echo "Infrastructure phase complete. Preparation and deployment are separate commands."
    ;;
  prepare|configure)
    require terraform
    require ansible-playbook
    : "${APP_REPO:?Set your existing repository URL}"
    : "${APP_REF:?Set an exact Git commit SHA}"
    : "${APP_DIR:?Set remote deployment directory}"
    : "${SSH_KEY:?Set private key path}"
    : "${AWS_REGION:?Set AWS_REGION}"
    : "${SECRET_SOURCE:?Set local or aws}"
    export APP_IP="${APP_IP:-$(terraform -chdir=infra output -raw public_ip)}"
    export PUBLIC_URL="${PUBLIC_URL:-http://$APP_IP}"
    export APP_IMAGE_TAG="${APP_IMAGE_TAG:-$APP_REF}"
    export SECRET_ARN="${SECRET_ARN:-}"
    export GITHUB_DEPLOY_KEY="${GITHUB_DEPLOY_KEY:-}"
    test -f "$SSH_KEY" || { echo "Private key does not exist." >&2; exit 1; }
    [[ "$APP_REF" =~ ^[a-fA-F0-9]{40}$ ]] || { echo "APP_REF must be a full Git commit SHA." >&2; exit 1; }
    [[ "$APP_DIR" =~ ^/[a-zA-Z0-9/_-]+$ ]] || { echo "APP_DIR must be a simple absolute path." >&2; exit 1; }
    [[ "$APP_REPO" =~ ^https://github.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+(\.git)?$ || "$APP_REPO" =~ ^git@github.com:[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+(\.git)?$ ]] || { echo "Use a GitHub repository URL without embedded credentials." >&2; exit 1; }
    [[ "$SECRET_SOURCE" = local || "$SECRET_SOURCE" = aws ]] || { echo "SECRET_SOURCE must be local or aws." >&2; exit 1; }
    if [ "$SECRET_SOURCE" = aws ]; then : "${SECRET_ARN:?Set SECRET_ARN}"; fi
    tags=prepare
    if [ "$mode" = configure ]; then tags=deploy; fi
    ansible-playbook --tags "$tags" -i "$APP_IP," -u ubuntu \
      --private-key "$SSH_KEY" --ssh-common-args='-o StrictHostKeyChecking=yes' ansible/site.yml
    ;;
  help|--help|-h)
    echo "Run each phase yourself: bash scripts/deploy.sh [plan|apply|prepare|configure]"
    echo "First: source scripts/runtime-inputs.sh"
    echo "plan/apply do not deploy. prepare installs tools/checks out code. configure starts services."
    ;;
  *)
    echo "Unknown phase: $mode" >&2
    exit 1
    ;;
esac
