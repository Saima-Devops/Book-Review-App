#!/usr/bin/env bash
# Managed MySQL backup; does not deploy images or modify database records.
set -euo pipefail
umask 077

configure=false
case "${1:-}" in
  --help|-h)
    printf '%s\n' \
      'Usage: bash scripts/backup-aiven.sh [--configure]' \
      'Prompts for missing settings and the database password. Never saves passwords.' \
      'Settings: ~/.config/book-shelf/aiven-backup.conf (outside the repository).' \
      'Backups: ~/reading-room-backups/ (override with AIVEN_BACKUP_DIR).' \
      'Overrides: AIVEN_HOST, AIVEN_PORT, AIVEN_USER, AIVEN_DATABASE, AIVEN_CA.' \
      'Docker is preferred; open Docker Desktop before running.' \
      'Optional: AIVEN_BACKUP_CLIENT=auto|docker|local, AIVEN_MYSQL_IMAGE,' \
      'AIVEN_MYSQLDUMP and AIVEN_BACKUP_CONFIG.' \
      '--configure: edit the connection settings before taking a backup.'
    exit 0 ;;
  --configure) configure=true ;;
  '') ;;
  *) printf 'Unknown option. Use --help.\n' >&2; exit 1 ;;
esac
if [[ $# -gt 1 ]]; then printf 'Too many arguments. Use --help.\n' >&2; exit 1; fi

client="${AIVEN_BACKUP_CLIENT:-auto}"
case "$client" in auto|docker|local) ;; *) printf 'Invalid AIVEN_BACKUP_CLIENT. Use auto, docker, or local.\n' >&2; exit 1 ;; esac
dump="${AIVEN_MYSQLDUMP:-}"
if [[ "$client" = auto && -n "$dump" ]]; then client=local; fi
if [[ "$client" = auto ]]; then
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then client=docker
    elif command -v mysqldump >/dev/null 2>&1; then client=local
    else printf 'Open Docker Desktop, wait until it is running, then rerun this script. No Homebrew installation is needed.\n' >&2; exit 1
    fi
  else client=local
  fi
fi
image=''
if [[ "$client" = docker ]]; then
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    printf 'Open Docker Desktop and rerun this script.\n' >&2; exit 1
  fi
  image="${AIVEN_MYSQL_IMAGE:-}"
  if [[ -z "$image" ]]; then
    for candidate in mysql:8.4 mysql:8; do
      if docker image inspect "$candidate" >/dev/null 2>&1; then image="$candidate"; break; fi
    done
    image="${image:-mysql:8.4}"
  fi
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    printf 'Downloading the MySQL client image once: %s\n' "$image"
    if ! docker pull "$image"; then
      printf 'Client image download failed. Check Docker Hub access and retry. Existing containers were not changed.\n' >&2; exit 1
    fi
  fi
elif [[ -z "$dump" ]]; then
  dump="$(command -v mysqldump || true)"
  if [[ -z "$dump" ]] && command -v brew >/dev/null 2>&1; then
    for formula in mysql-client@8.4 mysql@8.4 mysql-client mysql; do
      prefix="$(brew --prefix "$formula" 2>/dev/null || true)"
      if [[ -n "$prefix" && -x "$prefix/bin/mysqldump" ]]; then
        dump="$prefix/bin/mysqldump"; break
      fi
    done
  fi
fi
if [[ "$client" = local ]]; then
  if [[ -z "$dump" ]] || ! command -v "$dump" >/dev/null 2>&1; then
    printf 'Open Docker Desktop to use the container client, or optionally run: brew install mysql-client@8.4\n' >&2
    exit 1
  fi
fi
if [[ "$client" = local ]] && ! "$dump" --version >/dev/null 2>&1; then
  printf 'The MySQL client cannot start. Check its installation before retrying.\n' >&2
  exit 1
fi

config="${AIVEN_BACKUP_CONFIG:-$HOME/.config/book-shelf/aiven-backup.conf}"
saved_host='' saved_port='' saved_user='' saved_database='' saved_ca=''
if [[ -f "$config" ]]; then
  # Parse data only; never source a file that could contain executable shell code.
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    case "$key" in
      host) saved_host="$value" ;;
      port) saved_port="$value" ;;
      user) saved_user="$value" ;;
      database) saved_database="$value" ;;
      ca) saved_ca="$value" ;;
    esac
  done < "$config"
fi
host="${AIVEN_HOST:-$saved_host}"
port="${AIVEN_PORT:-$saved_port}"
user="${AIVEN_USER:-$saved_user}"
database="${AIVEN_DATABASE:-$saved_database}"
ca="${AIVEN_CA:-$saved_ca}"

ask() {
  local variable="$1" label="$2" default="$3" current answer
  current="${!variable}"
  if [[ -n "$current" && "$configure" = false ]]; then return; fi
  default="${current:-$default}"
  if ! read -r -p "$label${default:+ [$default]}: " answer; then
    printf '\nMissing %s. Run interactively or supply the AIVEN_* variables.\n' "$label" >&2
    exit 1
  fi
  printf -v "$variable" '%s' "${answer:-$default}"
}
default_ca=''
if [[ -f "$HOME/Downloads/ca.pem" ]]; then default_ca="$HOME/Downloads/ca.pem"; fi
ask host 'Aiven hostname' ''
ask port 'Aiven port' ''
ask user 'Aiven username' 'avnadmin'
ask database 'Database name' 'book_shelf'
ask ca 'CA certificate full path (without quotes)' "$default_ca"
if [[ "$ca" = '~/'* ]]; then ca="$HOME/${ca:2}"; fi

if [[ ! "$host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ||
      ! "$port" =~ ^[0-9]{1,5}$ ||
      ! "$database" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]*$ || ${#database} -gt 64 ||
      -z "$user" || "$user" = *$'\n'* || "$user" = *$'\r'* ]]; then
  printf 'Invalid connection settings. Rerun with --configure.\n' >&2; exit 1
fi
if (( 10#$port < 1 || 10#$port > 65535 )); then
  printf 'Port must be between 1 and 65535.\n' >&2; exit 1
fi
if [[ "$ca" != /* || ! -f "$ca" || ! -r "$ca" || "$ca" = *$'\n'* || "$ca" = *$'\r'* ]]; then
  printf 'CA certificate must be a readable file at an absolute path. Rerun with --configure.\n' >&2
  exit 1
fi

partial='' config_partial='' ca_copy=''
cleanup() {
  local status=$?
  [[ -z "$partial" ]] || rm -f "$partial"
  [[ -z "$config_partial" ]] || rm -f "$config_partial"
  [[ -z "$ca_copy" ]] || rm -f "$ca_copy"
  if [[ "$status" -ne 0 ]]; then
    printf 'Backup failed; no completed backup was created. Existing backups were not changed. Do not deploy yet.\n' >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$(dirname "$config")"
config_partial="$(mktemp "$config.partial.XXXXXX")"
printf 'host=%s\nport=%s\nuser=%s\ndatabase=%s\nca=%s\n' \
  "$host" "$port" "$user" "$database" "$ca" > "$config_partial"
mv "$config_partial" "$config"
config_partial=''

root="${AIVEN_BACKUP_DIR:-$HOME/reading-room-backups}"
mkdir -p "$root"
directory="$(mktemp -d "$root/aiven-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
partial="$directory/.book-shelf.sql.gz.partial"
destination="$directory/book-shelf.sql.gz"
printf 'Backing up %s on %s:%s using verified TLS.\n' "$database" "$host" "$port"
printf 'Enter the database password when prompted; it will not be saved.\n'
unset MYSQL_PWD
dump_args=(--host="$host" --port="$port" --user="$user" \
  --ssl-mode=VERIFY_IDENTITY --single-transaction --no-tablespaces \
  --set-gtid-purged=OFF --column-statistics=0 --skip-add-drop-table)
if [[ "$client" = docker ]]; then
  # Make a private temporary copy readable by the container's non-root UID.
  ca_copy="$directory/.ca.pem"
  cp "$ca" "$ca_copy"
  chmod 444 "$ca_copy"
  # No -t: a terminal would mix password prompts/terminal bytes into the SQL dump.
  # Send credentials through stdin to an ephemeral tmpfs file, never argv or env.
  set +x
  unset password
  if ! IFS= read -r -s -p 'Database password: ' password || [[ -z "$password" ]]; then
    printf '\nA non-empty database password is required.\n' >&2; exit 1
  fi
  printf '\n'
  password="${password//\\/\\\\}"
  password="${password//\"/\\\"}"
  password="${password//$'\r'/\\r}"
  password="${password//$'\t'/\\t}"
  printf '[client]\npassword="%s"\n' "$password" | \
    docker run --rm -i --pull=never --read-only --user 999:999 \
      --cap-drop=ALL --security-opt=no-new-privileges \
      --tmpfs /tmp:rw,noexec,nosuid,size=1m,mode=1777 \
      --volume "$ca_copy:/certs/ca.pem:ro" --entrypoint sh "$image" -c '
        set -eu
        umask 077
        trap '\''rm -f /tmp/client.cnf'\'' EXIT
        cat > /tmp/client.cnf
        mysqldump --defaults-extra-file=/tmp/client.cnf "$@"
      ' sh "${dump_args[@]}" --ssl-ca=/certs/ca.pem "$database" | gzip > "$partial"
  unset password
else
  "$dump" "${dump_args[@]}" --password --ssl-ca="$ca" "$database" | gzip > "$partial"
fi
gzip -t "$partial"
chmod 600 "$partial"
mv "$partial" "$destination"
partial=''
printf '\nBackup created and gzip integrity verified:\n%s\n' "$destination"
ls -lh "$destination"
printf 'Connection settings saved without passwords. Keep the backup private; restore-test it separately.\n'
