#!/usr/bin/env bash
set -euo pipefail

# Verifies the production integrations that can otherwise look healthy while
# being logically disabled.  It is intentionally read-only: Docker restarts
# remain the responsibility of its restart policy, while an operator receives
# an email with the exact failed checks.
ROOT=/opt/support-communication/app
ENV_FILE=/opt/support-communication/secrets/production.env
STATE_DIR=/var/lib/support-communication
STATE_FILE="$STATE_DIR/integration-watchdog-last-alert"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT/deploy/compose/compose.production.yml" -f "$ROOT/deploy/compose/compose.vps-override.yml")
failures=()

cd "$ROOT"

service_id() {
  "${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -n 1
}

require_healthy_service() {
  local service="$1" id status
  id="$(service_id "$service")"
  if [[ -z "$id" ]]; then
    failures+=("$service is missing")
    return
  fi
  status="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id")"
  if [[ "$status" != "running healthy" && "$status" != "running none" ]]; then
    failures+=("$service status is $status")
  fi
}

require_healthy_service api-gateway
require_healthy_service telegram-polling-worker
require_healthy_service outbox-worker
require_healthy_service lead-notification-worker
require_healthy_service webhook-delivery-worker

mailserver_status="$(docker inspect --format '{{.State.Status}}' mailserver 2>/dev/null || true)"
if [[ "$mailserver_status" != "running" ]]; then
  failures+=("mailserver status is ${mailserver_status:-missing}")
fi

telegram_worker="$(service_id telegram-polling-worker)"
if [[ -n "$telegram_worker" ]]; then
  worker_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$telegram_worker")"
  for required in TELEGRAM_INGRESS_MODE=polling TELEGRAM_POLLING_ENABLED=true TELEGRAM_WEBHOOK_ENABLED=false; do
    if ! grep -Fxq "$required" <<<"$worker_env"; then
      failures+=("telegram-polling-worker lacks $required")
    fi
  done
  # Docker's relative --since clock is inconsistent on hosts configured with a
  # local timezone while JSON container logs are UTC. Check that the worker is
  # emitting heartbeats, but never treat a skipped backoff pass (`failed:0`) as
  # proof that Telegram itself is reachable.
  worker_logs="$(docker logs --tail 200 "$telegram_worker" 2>&1)"
  if ! grep -Fq '"enabled":true,"operation"' <<<"$worker_logs"; then
    failures+=("telegram-polling-worker has no polling heartbeat in recent logs")
  fi

  # This runs inside the worker so NODE_USE_ENV_PROXY and HTTPS_PROXY match the
  # production ingress path. An intentionally invalid token must reach the Bot
  # API and return 401; it neither exposes a real token nor follows the root
  # redirect to core.telegram.org.
  if ! docker exec "$telegram_worker" node -e "fetch('https://api.telegram.org/bot0:invalid/getMe', { signal: AbortSignal.timeout(15000) }).then((response) => process.exit(response.status === 401 ? 0 : 1)).catch(() => process.exit(1))"; then
    failures+=("Telegram Bot API is unreachable through telegram-polling-worker proxy")
  fi
fi

if ! systemctl is-active --quiet xray-telegram.service; then
  failures+=("xray-telegram.service is inactive")
fi

api="$(service_id api-gateway)"
if [[ -z "$api" ]] || ! docker exec "$api" node -e "fetch('http://127.0.0.1:4100/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  failures+=("API readiness check failed")
fi
if [[ -n "$api" ]] && ! docker exec "$api" node -e "fetch('https://platform-api2.max.ru').then(r=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"; then
  failures+=("MAX API TLS or network check failed")
fi

if ((${#failures[@]} == 0)); then
  exit 0
fi

message="Support Communication integration watchdog detected: ${failures[*]}"
logger -t support-communication-integration-watchdog -- "$message"

# Limit repeated alerts for an unchanged failure to one per hour.  Details are
# always retained in the system journal.
now="$(date +%s)"
last=0
if [[ -r "$STATE_FILE" ]]; then last="$(cat "$STATE_FILE" 2>/dev/null || printf 0)"; fi
if ((now - last >= 3600)); then
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$now" > "$STATE_FILE"
  recipient="$(sed -n 's/^PUBLIC_DEMO_NOTIFICATION_SMTP_TO=//p' "$ENV_FILE" | tail -n 1)"
  sender="$(sed -n 's/^MAIL_FROM=//p' "$ENV_FILE" | tail -n 1)"
  if [[ -n "$recipient" && "$(docker inspect --format '{{.State.Status}}' mailserver 2>/dev/null || true)" == "running" ]]; then
    printf 'To: %s\nFrom: %s\nSubject: Support Communication: integration attention required\n\n%s\nSee: journalctl -u support-communication-integration-watchdog.service\n' "$recipient" "${sender:-noreply@localhost}" "$message" | docker exec -i mailserver sendmail -t
  fi
fi
printf '%s\n' "$message" >&2
exit 1
