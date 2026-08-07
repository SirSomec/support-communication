#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly REPOSITORY="/srv/dev-disk-by-uuid-76a709c8-bc1b-431c-bf6b-83d7ccc3e53d/ruvds-backups/repository"
readonly PASSPHRASE_FILE="/root/.config/borg/ruvds-passphrase"
readonly STATE_DIR="/var/lib/ruvds-borg"

exec 9>/run/lock/ruvds-borg-maintenance.lock
flock -n 9 || exit 75

export BORG_REPO="${REPOSITORY}"
export BORG_PASSCOMMAND="cat ${PASSPHRASE_FILE}"

install -d -m 0700 "${STATE_DIR}"
work_dir="$(mktemp -d /tmp/ruvds-borg-restore.XXXXXX)"
cleanup() {
  rm -rf -- "${work_dir}"
  chown -R ruvdsbackup:ruvdsbackup "${REPOSITORY}"
}
trap cleanup EXIT

archive="$(borg list --short --last 1)"
if [[ -z "${archive}" ]]; then
  echo "No Borg archives found." >&2
  exit 1
fi

(
  cd "${work_dir}"
  borg extract "::${archive}" var/lib/ruvds-backup/staging
)
staging="${work_dir}/var/lib/ruvds-backup/staging"
(
  cd "${staging}"
  sha256sum -c manifest.sha256
)

docker run --rm \
  --volume "${staging}/postgres:/restore:ro" \
  postgres:16-alpine \
  pg_restore --list /restore/support_communication.dump >/dev/null
sqlite_result="$(sqlite3 "${staging}/uptime-kuma/kuma.db" 'PRAGMA integrity_check;')"
if [[ "${sqlite_result}" != "ok" ]]; then
  echo "Restored Uptime Kuma database failed integrity_check." >&2
  exit 1
fi

minio_objects="$(find "${staging}/minio" -type f | wc -l)"
{
  printf 'validated_at=%s\n' "$(date --iso-8601=seconds)"
  printf 'archive=%s\n' "${archive}"
  printf 'postgres_dump=ok\n'
  printf 'uptime_kuma_sqlite=ok\n'
  printf 'minio_objects=%s\n' "${minio_objects}"
} >"${STATE_DIR}/last-restore-validation"
