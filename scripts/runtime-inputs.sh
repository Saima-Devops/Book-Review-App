#!/usr/bin/env bash
# Source this file so exports remain in the caller's terminal.
if [ -z "${BASH_VERSION:-}" ]; then
  echo 'Open a Bash shell first: bash' >&2
  return 1
fi
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo 'Run: source scripts/runtime-inputs.sh' >&2
  exit 1
fi

reading_room_prompt() {
  local name="$1" label="$2" fallback="${3:-}" answer
  if [ -z "${!name:-}" ]; then
    read -r -p "$label${fallback:+ [$fallback]}: " answer
    printf -v "$name" '%s' "${answer:-$fallback}"
  fi
  export "$name"
}

reading_room_prompt AWS_REGION 'AWS region (required)'
reading_room_prompt TF_VAR_instance_type 'x86_64 EC2 instance type' t3.medium
reading_room_prompt TF_VAR_root_volume_size 'Encrypted root disk GiB' 30
reading_room_prompt TF_VAR_ssh_cidr 'Your current public IPv4/32 (required)'
reading_room_prompt SSH_KEY 'Existing private SSH key absolute path (required)'
reading_room_prompt TF_VAR_public_key_path 'Matching public SSH key path' "${SSH_KEY}.pub"
reading_room_prompt APP_REPO 'Your existing GitHub repo URL' "$(git remote get-url origin 2>/dev/null || true)"
reading_room_prompt APP_REF 'Deployment commit SHA (must be pushed)' "$(git rev-parse HEAD 2>/dev/null || true)"
reading_room_prompt APP_DIR 'EC2 deployment directory' /opt/reading-room
reading_room_prompt SECRET_SOURCE 'Secrets source: local or aws' local
if [ "$SECRET_SOURCE" = aws ]; then
  reading_room_prompt SECRET_ARN 'Existing AWS Secrets Manager ARN (required)'
else
  export SECRET_ARN=''
fi
reading_room_prompt FULL_NAME 'Full name for evidence captions (required)'
export TF_VAR_region="$AWS_REGION"
export TF_VAR_secret_arn="${SECRET_ARN:-}"
export APP_IMAGE_TAG="$APP_REF"
if [ -z "$AWS_REGION" ] || [ -z "$TF_VAR_ssh_cidr" ] || [ -z "$SSH_KEY" ] || [ -z "$APP_REPO" ] || [ -z "$APP_REF" ] || [ -z "$FULL_NAME" ]; then
  echo 'A required input is empty. Export it before proceeding.' >&2
  return 1
fi
if [ "$SECRET_SOURCE" != local ] && [ "$SECRET_SOURCE" != aws ]; then
  echo 'SECRET_SOURCE must be local or aws.' >&2
  return 1
fi
if [ "$SECRET_SOURCE" = aws ] && [ -z "$SECRET_ARN" ]; then
  echo 'SECRET_ARN is required for AWS Secrets Manager.' >&2
  return 1
fi
unset -f reading_room_prompt
echo 'Runtime inputs exported for this terminal. No cloud action was performed.'
