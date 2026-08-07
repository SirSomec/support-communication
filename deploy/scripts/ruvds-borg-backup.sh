#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly BACKUP_ROOT="/var/lib/ruvds-backup"
readonly STAGING_DIR="${BACKUP_ROOT}/staging"
readonly CONFIG_FILE="/etc/ruvds-borg-backup.conf"
readonly LOCK_FILE="/run/lock/ruvds-borg-backup.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "A backup is already running." >&2
  exit 75
fi

if [[ ! -r "${CONFIG_FILE}" ]]; then
  echo "Missing ${CONFIG_FILE}." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${CONFIG_FILE}"
: "${BORG_REPO:?BORG_REPO is required}"
: "${BORG_PASSPHRASE_FILE:?BORG_PASSPHRASE_FILE is required}"
: "${BORG_RSH:?BORG_RSH is required}"

export BORG_REPO BORG_RSH
export BORG_PASSCOMMAND="cat ${BORG_PASSPHRASE_FILE}"
export BORG_UNKNOWN_UNENCRYPTED_REPO_ACCESS_IS_OK=no

install -d -m 0700 "${BACKUP_ROOT}" "${STAGING_DIR}"
find "${STAGING_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
install -d -m 0700 \
  "${STAGING_DIR}/postgres" \
  "${STAGING_DIR}/redis" \
  "${STAGING_DIR}/minio" \
  "${STAGING_DIR}/uptime-kuma" \
  "${STAGING_DIR}/inventory"

container_for_service() {
  local project="$1"
  local service="$2"
  local container
  container="$(docker ps \
    --filter "label=com.docker.compose.project=${project}" \
    --filter "label=com.docker.compose.service=${service}" \
    --format '{{.Names}}' | head -n 1)"
  if [[ -z "${container}" ]]; then
    echo "Container not found: ${project}/${service}" >&2
    return 1
  fi
  printf '%s\n' "${container}"
}

cleanup() {
  local exit_code=$?
  if [[ -n "${MINIO_CONTAINER:-}" ]]; then
    docker exec "${MINIO_CONTAINER}" rm -rf /tmp/ruvds-borg-backup-minio >/dev/null 2>&1 || true
  fi
  if [[ -n "${UPTIME_CONTAINER:-}" ]]; then
    docker exec "${UPTIME_CONTAINER}" rm -f /tmp/ruvds-borg-backup-kuma.db >/dev/null 2>&1 || true
  fi
  exit "${exit_code}"
}
trap cleanup EXIT

POSTGRES_CONTAINER="$(container_for_service support-communication-infrastructure postgres)"
REDIS_CONTAINER="$(container_for_service support-communication-infrastructure redis)"
MINIO_CONTAINER="$(container_for_service support-communication-infrastructure minio)"
UPTIME_CONTAINER="$(container_for_service support-communication-production uptime-kuma)"

docker exec "${POSTGRES_CONTAINER}" sh -ec \
  'pg_dumpall -U "$POSTGRES_USER" --globals-only' \
  >"${STAGING_DIR}/postgres/globals.sql"

mapfile -t databases < <(
  docker exec "${POSTGRES_CONTAINER}" sh -ec \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select datname from pg_database where datistemplate = false order by datname"'
)
for database in "${databases[@]}"; do
  docker exec "${POSTGRES_CONTAINER}" sh -ec \
    'pg_dump -U "$POSTGRES_USER" --format=custom --no-owner --no-privileges --dbname "$1"' \
    sh "${database}" >"${STAGING_DIR}/postgres/${database}.dump"
done

docker exec "${REDIS_CONTAINER}" sh -ec \
  'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE >/dev/null'
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${STAGING_DIR}/redis/dump.rdb" >/dev/null

docker exec "${UPTIME_CONTAINER}" sh -ec '
  rm -f /tmp/ruvds-borg-backup-kuma.db
  sqlite3 /app/data/kuma.db ".backup /tmp/ruvds-borg-backup-kuma.db"
'
docker cp "${UPTIME_CONTAINER}:/tmp/ruvds-borg-backup-kuma.db" \
  "${STAGING_DIR}/uptime-kuma/kuma.db" >/dev/null
if [[ "$(sqlite3 "${STAGING_DIR}/uptime-kuma/kuma.db" 'PRAGMA integrity_check;')" != "ok" ]]; then
  echo "Uptime Kuma SQLite integrity check failed." >&2
  exit 1
fi

docker exec "${MINIO_CONTAINER}" sh -ec '
  rm -rf /tmp/ruvds-borg-backup-minio
  mkdir -p /tmp/ruvds-borg-backup-minio
  mc alias set ruvds-backup-source http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc mirror --quiet --overwrite ruvds-backup-source /tmp/ruvds-borg-backup-minio
'
docker cp "${MINIO_CONTAINER}:/tmp/ruvds-borg-backup-minio/." \
  "${STAGING_DIR}/minio/" >/dev/null

date --iso-8601=seconds >"${STAGING_DIR}/inventory/created-at.txt"
hostnamectl >"${STAGING_DIR}/inventory/hostnamectl.txt"
dpkg-query -W -f='${binary:Package}|${Version}\n' \
  >"${STAGING_DIR}/inventory/packages.txt"
docker ps --no-trunc --format '{{.Names}}|{{.Image}}|{{.Status}}' \
  >"${STAGING_DIR}/inventory/containers.txt"
docker volume ls --format '{{.Name}}' \
  >"${STAGING_DIR}/inventory/docker-volumes.txt"

(
  cd "${STAGING_DIR}"
  find . -type f ! -name manifest.sha256 -print0 \
    | sort -z \
    | xargs -0 -r sha256sum >manifest.sha256
  sha256sum -c manifest.sha256 >/dev/null
)

archive="$(hostname)-$(date +%Y-%m-%dT%H:%M:%S)"
borg create \
  --show-rc \
  --stats \
  --compression zstd,3 \
  --exclude-caches \
  --exclude '/opt/mailserver/docker-data/dms/mail-logs/*' \
  --exclude '/opt/mailserver/docker-data/dms/mail-state/lib-clamav/*' \
  --exclude '/opt/support-communication/releases/*' \
  --exclude '/var/lib/docker/volumes/support-communication-production_clamav-data/*' \
  --exclude '/var/lib/docker/volumes/support-communication-production_netdata-cache/*' \
  --exclude '/var/lib/docker/volumes/support-e2e-*' \
  "::${archive}" \
  /etc \
  /root/.ssh \
  /opt \
  /var/lib/ruvds-backup/staging \
  /var/lib/docker/volumes/support-communication-infrastructure_minio-data \
  /var/lib/docker/volumes/support-communication-infrastructure_postgres-data \
  /var/lib/docker/volumes/support-communication-infrastructure_redis-data \
  /var/lib/docker/volumes/support-communication-production_caddy-config \
  /var/lib/docker/volumes/support-communication-production_caddy-data \
  /var/lib/docker/volumes/support-communication-production_netdata-config \
  /var/lib/docker/volumes/support-communication-production_uptime-kuma-data

printf '%s|%s\n' "$(date --iso-8601=seconds)" "${archive}" \
  >"${BACKUP_ROOT}/last-success"
