#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  printf 'Publishing is restricted to GitHub Actions.\n' >&2
  exit 1
fi
if [[ "${GITHUB_REF:-}" != "refs/heads/main" ||
      ( "${GITHUB_EVENT_NAME:-}" != "push" &&
        ( "${GITHUB_EVENT_NAME:-}" != "workflow_dispatch" || "${PUBLISH_IMAGES:-}" != "true" ) ) ]]; then
  printf 'Publishing was not requested for main; no images published.\n'
  exit 0
fi

: "${DOCKERHUB_USERNAME:?Add the DOCKERHUB_USERNAME repository secret}"
: "${DOCKERHUB_TOKEN:?Add the DOCKERHUB_TOKEN repository secret}"
: "${RUNNER_TEMP:?Missing runner temporary directory}"
: "${GITHUB_SHA:?Missing commit SHA}"
: "${GITHUB_RUN_NUMBER:?Missing run number}"
: "${GITHUB_RUN_ATTEMPT:?Missing run attempt}"

if [[ "$DOCKERHUB_USERNAME" != "saim2026" || ! "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ||
      ! "$GITHUB_RUN_NUMBER" =~ ^[1-9][0-9]*$ || ! "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ||
      "${APP_IMAGE_TAG:-}" != "ci-$GITHUB_SHA" ]]; then
  printf 'Invalid Docker Hub namespace, build identifiers, or tested image tag.\n' >&2
  exit 1
fi

services=(frontend backend proxy)
version="build-$GITHUB_RUN_NUMBER-$GITHUB_RUN_ATTEMPT"
commit_tag="sha-$GITHUB_SHA"
target="$DOCKERHUB_USERNAME/book-shelf"

# Check every tested image before authenticating or publishing anything.
for service in "${services[@]}"; do
  docker image inspect "reading-room-$service:$APP_IMAGE_TAG" >/dev/null
done

export DOCKER_CONFIG
DOCKER_CONFIG="$(mktemp -d "$RUNNER_TEMP/book-shelf-docker.XXXXXX")"
cleanup() {
  docker logout docker.io >/dev/null 2>&1 || true
  rm -f "$DOCKER_CONFIG/config.json"
  rmdir "$DOCKER_CONFIG" || true
}
trap cleanup EXIT
printf '%s' "$DOCKERHUB_TOKEN" | docker login docker.io --username "$DOCKERHUB_USERNAME" --password-stdin
unset DOCKERHUB_TOKEN

for service in "${services[@]}"; do
  source="reading-room-$service:$APP_IMAGE_TAG"
  for tag in "$version" "$commit_tag"; do
    docker image tag "$source" "$target:$service-$tag"
    docker image push "$target:$service-$tag"
    docker manifest inspect "$target:$service-$tag" >/dev/null
    printf 'Verified on Docker Hub: %s:%s-%s\n' "$target" "$service" "$tag"
  done
done

# An old run can publish a historical build, but must not roll latest backward.
remote_head="$(git ls-remote --exit-code origin refs/heads/main)"
read -r current_main _ <<< "$remote_head"
promoted=false
if [[ "$current_main" == "$GITHUB_SHA" ]]; then
  for service in "${services[@]}"; do
    docker image tag "reading-room-$service:$APP_IMAGE_TAG" "$target:$service-latest"
    docker image push "$target:$service-latest"
    docker manifest inspect "$target:$service-latest" >/dev/null
  done
  promoted=true
else
  printf 'Main has advanced. Historical versions published; latest was not changed.\n'
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'published=true\nlatest_updated=%s\n' "$promoted" >> "$GITHUB_OUTPUT"
fi

printf '\nDocker Hub publication completed and registry tags verified.\n'
for service in "${services[@]}"; do
  printf '::notice title=Published %s image::%s:%s-%s (latest updated: %s)\n' "$service" "$target" "$service" "$version" "$promoted"
done

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    printf '## Docker Hub Delivery: PUSHED AND VERIFIED\n\n'
    printf 'Tested commit: `%s`\n\n' "$GITHUB_SHA"
    printf 'Repository: `%s`\n\n' "$target"
    printf '| Service | Deploy this build | Commit reference | Latest alias | Latest updated |\n'
    printf '| --- | --- | --- | --- | --- |\n'
    for service in "${services[@]}"; do
      printf '| %s | `%s:%s-%s` | `%s:%s-%s` | `%s:%s-latest` | %s |\n' "$service" "$target" "$service" "$version" "$target" "$service" "$commit_tag" "$target" "$service" "$promoted"
    done
  } >> "$GITHUB_STEP_SUMMARY"
fi
