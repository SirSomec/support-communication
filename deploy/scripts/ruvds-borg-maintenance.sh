#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly REPOSITORY="/srv/dev-disk-by-uuid-76a709c8-bc1b-431c-bf6b-83d7ccc3e53d/ruvds-backups/repository"
readonly PASSPHRASE_FILE="/root/.config/borg/ruvds-passphrase"
readonly STATE_DIR="/var/lib/ruvds-borg"

exec 9>/run/lock/ruvds-borg-maintenance.lock
flock -n 9 || exit 75

restore_repository_ownership() {
  chown -R ruvdsbackup:ruvdsbackup "${REPOSITORY}"
}
trap restore_repository_ownership EXIT

export BORG_REPO="${REPOSITORY}"
export BORG_PASSCOMMAND="cat ${PASSPHRASE_FILE}"

install -d -m 0700 "${STATE_DIR}"

borg prune \
  --show-rc \
  --list \
  --glob-archives 'mail.supportcom.ru-*' \
  --keep-daily 14 \
  --keep-weekly 8 \
  --keep-monthly 12 \
  --keep-yearly 3
borg compact --show-rc

date --iso-8601=seconds >"${STATE_DIR}/last-maintenance-success"
