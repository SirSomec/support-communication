#!/usr/bin/env bash
set -euo pipefail

# Selects a proven Telegram Xray outbound without relying on Xray's internal
# observatory. Some REALITY routes can serve Bot API traffic while timing out
# unrelated observatory probes, which would otherwise cause a false failover.
XRAY_BIN=${XRAY_BIN:-/usr/local/bin/xray}
XRAY_CONFIG=${XRAY_CONFIG:-/etc/xray-config.json}
PRIMARY_TAG=${TELEGRAM_XRAY_PRIMARY_TAG:-telegram-primary-ger}
FALLBACK_TAG=${TELEGRAM_XRAY_FALLBACK_TAG:-telegram-primary-smart}
RULE_TAG=${TELEGRAM_XRAY_RULE_TAG:-telegram-bot-api-primary}
RUNTIME_DIR=${RUNTIME_DIRECTORY:-/run/support-communication-telegram-xray-failover}
PROBE_PORT=${TELEGRAM_XRAY_PROBE_PORT:-18089}

mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"
exec 9>"$RUNTIME_DIR/lock"
flock -n 9 || exit 0

probe_config=""
probe_log=""
probe_pid=""

cleanup() {
  if [[ -n "$probe_pid" ]]; then
    kill "$probe_pid" 2>/dev/null || true
    wait "$probe_pid" 2>/dev/null || true
  fi
  [[ -n "$probe_config" ]] && rm -f -- "$probe_config"
  [[ -n "$probe_log" ]] && rm -f -- "$probe_log"
  return 0
}
trap cleanup EXIT

probe_outbound() {
  local outbound_tag=$1 status
  cleanup
  probe_pid=""
  probe_config="$(mktemp "$RUNTIME_DIR/probe.XXXXXX.json")"
  probe_log="$(mktemp "$RUNTIME_DIR/probe.XXXXXX.log")"
  chmod 600 "$probe_config" "$probe_log"

  node -e '
    const fs = require("fs");
    const [sourcePath, targetPath, outboundTag, port] = process.argv.slice(1);
    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    const outbound = (source.outbounds || []).find((entry) => entry.tag === outboundTag);
    if (!outbound) throw new Error("telegram_xray_failover_outbound_missing");
    const config = {
      log: { loglevel: "warning" },
      inbounds: [{ tag: "probe-http", listen: "127.0.0.1", port: Number(port), protocol: "http", settings: {} }],
      outbounds: [outbound],
      routing: { rules: [{ type: "field", inboundTag: ["probe-http"], outboundTag }] }
    };
    fs.writeFileSync(targetPath, JSON.stringify(config));
  ' "$XRAY_CONFIG" "$probe_config" "$outbound_tag" "$PROBE_PORT" || return 1

  "$XRAY_BIN" run -test -c "$probe_config" >/dev/null || return 1
  "$XRAY_BIN" run -c "$probe_config" >"$probe_log" 2>&1 &
  probe_pid=$!
  sleep 1

  set +e
  status="$(printf 'GET /bot0:invalid/getMe HTTP/1.1\r\nHost: api.telegram.org\r\nConnection: close\r\n\r\n' |
    timeout 15 openssl s_client -proxy "127.0.0.1:$PROBE_PORT" -connect api.telegram.org:443 -servername api.telegram.org -quiet 2>/dev/null |
    awk 'NR == 1 { print $2; exit }')"
  set -e

  cleanup
  probe_pid=""
  probe_config=""
  probe_log=""
  [[ "$status" == "401" ]]
}

active_outbound="$(node -e '
  const fs = require("fs");
  const [configPath, ruleTag] = process.argv.slice(1);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rule = (config.routing?.rules || []).find((entry) => entry.ruleTag === ruleTag);
  if (!rule || typeof rule.outboundTag !== "string") throw new Error("telegram_xray_failover_rule_missing");
  process.stdout.write(rule.outboundTag);
' "$XRAY_CONFIG" "$RULE_TAG")"

desired_outbound="$PRIMARY_TAG"
if ! probe_outbound "$PRIMARY_TAG"; then
  # A second real Bot API probe prevents a transient handshake failure from
  # changing the active route.
  sleep 2
  if ! probe_outbound "$PRIMARY_TAG"; then
    if ! probe_outbound "$FALLBACK_TAG"; then
      logger -t support-communication-telegram-xray-failover -- \
        "Telegram Xray failover: neither $PRIMARY_TAG nor $FALLBACK_TAG passed Bot API probe"
      exit 0
    fi
    desired_outbound="$FALLBACK_TAG"
  fi
fi

if [[ "$desired_outbound" == "$active_outbound" ]]; then
  exit 0
fi

next_config="$(mktemp "$RUNTIME_DIR/xray-config.XXXXXX.json")"
backup_config="${XRAY_CONFIG}.failover-$(date -u +%Y%m%dT%H%M%SZ)"
chmod 600 "$next_config"

node -e '
  const fs = require("fs");
  const [sourcePath, targetPath, ruleTag, outboundTag] = process.argv.slice(1);
  const config = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const rule = (config.routing?.rules || []).find((entry) => entry.ruleTag === ruleTag);
  if (!rule || !(config.outbounds || []).some((entry) => entry.tag === outboundTag)) {
    throw new Error("telegram_xray_failover_switch_invalid");
  }
  delete rule.balancerTag;
  rule.outboundTag = outboundTag;
  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));
' "$XRAY_CONFIG" "$next_config" "$RULE_TAG" "$desired_outbound"

"$XRAY_BIN" run -test -c "$next_config" >/dev/null
cp --preserve=mode,ownership,timestamps "$XRAY_CONFIG" "$backup_config"
chmod 600 "$backup_config"
install -o root -g root -m 600 "$next_config" "${XRAY_CONFIG}.new"
mv -f "${XRAY_CONFIG}.new" "$XRAY_CONFIG"

if ! systemctl restart xray-telegram.service || ! systemctl is-active --quiet xray-telegram.service; then
  install -o root -g root -m 600 "$backup_config" "$XRAY_CONFIG"
  systemctl restart xray-telegram.service || true
  rm -f -- "$next_config"
  logger -t support-communication-telegram-xray-failover -- "Telegram Xray failover: rollback after Xray restart failure"
  exit 1
fi

rm -f -- "$next_config"
logger -t support-communication-telegram-xray-failover -- "Telegram Xray failover: switched $active_outbound to $desired_outbound"
