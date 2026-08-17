#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly COMPOSE_DIR="${ROOT_DIR}/deploy/compose"
readonly ENV_FILE="${PRODUCTION_ENV_FILE:-/opt/support-communication/secrets/production.env}"
readonly PROJECT_NAME="${PRODUCTION_COMPOSE_PROJECT:-support-communication-production}"

readonly -a APPLICATION_FILES=(
  -f "${COMPOSE_DIR}/compose.production.yml"
  -f "${COMPOSE_DIR}/compose.vps-override.yml"
)
readonly -a COMPLETE_RUNTIME_FILES=(
  "${APPLICATION_FILES[@]}"
  -f "${COMPOSE_DIR}/compose.monitoring.yml"
)

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Production environment file is not readable: ${ENV_FILE}" >&2
  exit 1
fi

application_compose() {
  docker compose \
    -p "${PROJECT_NAME}" \
    --env-file "${ENV_FILE}" \
    "${APPLICATION_FILES[@]}" \
    "$@"
}

complete_runtime_compose() {
  docker compose \
    -p "${PROJECT_NAME}" \
    --env-file "${ENV_FILE}" \
    "${COMPLETE_RUNTIME_FILES[@]}" \
    "$@"
}

validate() {
  application_compose config --quiet
  complete_runtime_compose config --quiet
}

pull_application() {
  application_compose pull
}

migrate() {
  application_compose --profile release run --rm migrate
}

start_complete_runtime() {
  # Monitoring belongs to the same Compose project as the application. Always
  # include it when removing orphans, otherwise Compose deletes Kuma and Netdata.
  complete_runtime_compose up -d --remove-orphans
}

case "${1:-deploy}" in
  validate)
    validate
    ;;
  pull)
    validate
    pull_application
    ;;
  migrate)
    validate
    migrate
    ;;
  up)
    validate
    start_complete_runtime
    ;;
  deploy)
    validate
    pull_application
    migrate
    start_complete_runtime
    ;;
  *)
    echo "Usage: $0 [validate|pull|migrate|up|deploy]" >&2
    exit 2
    ;;
esac
