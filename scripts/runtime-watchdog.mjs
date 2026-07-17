import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const once = process.argv.includes("--once");
const intervalMs = positive(process.env.RUNTIME_WATCHDOG_INTERVAL_MS, 60_000);
const statePath = resolve(process.env.RUNTIME_WATCHDOG_STATE_FILE || join(root, ".runtime", "watchdog-state.json"));

do {
  const snapshot = collectSnapshot();
  const previous = readState();
  let notificationDelivered = true;
  if (!previous || previous.status !== snapshot.status || JSON.stringify(previous.reasons) !== JSON.stringify(snapshot.reasons)) {
    try {
      await notify(snapshot, previous?.status);
    } catch (error) {
      notificationDelivered = false;
      process.stderr.write(`${JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "runtime.notification_failed",
        service: "support-communication-watchdog"
      })}\n`);
    }
  }
  if (notificationDelivered) writeState(snapshot);
  if (once) break;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
} while (true);

function collectSnapshot() {
  const reasons = [];
  const compose = spawnSync(process.execPath, ["scripts/compose-health-check.mjs"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (compose.status !== 0) reasons.push(`services:${compact(compose.stderr || compose.stdout)}`);
  const ready = spawnSync("curl.exe", ["-fsS", "http://127.0.0.1:4101/api/v1/ready"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (ready.status !== 0) reasons.push("api_dependencies:unready");

  const metrics = databaseMetrics();
  if (metrics.unavailable) reasons.push("database_metrics:unavailable");
  if (metrics.pending > positive(process.env.RUNTIME_WATCHDOG_MAX_PENDING, 100)) reasons.push(`queue_pending:${metrics.pending}`);
  if (metrics.oldestPendingSeconds > positive(process.env.RUNTIME_WATCHDOG_MAX_PENDING_AGE_SECONDS, 300)) reasons.push(`queue_age_seconds:${metrics.oldestPendingSeconds}`);
  if (metrics.deadLetters > 0) reasons.push(`dead_letters:${metrics.deadLetters}`);
  if (metrics.failedReports > 0) reasons.push(`failed_reports:${metrics.failedReports}`);
  if (metrics.providerFailures > 0) reasons.push(`provider_failures_15m:${metrics.providerFailures}`);
  return { at: new Date().toISOString(), metrics, reasons, status: reasons.length ? "degraded" : "healthy" };
}

function databaseMetrics() {
  const sql = `SELECT
    count(*) FILTER (WHERE status IN ('pending','failed')),
    COALESCE(EXTRACT(EPOCH FROM (now()-min(occurred_at) FILTER (WHERE status IN ('pending','failed'))))::bigint,0),
    count(*) FILTER (WHERE status='dead_lettered' OR dead_lettered_at IS NOT NULL),
    (SELECT count(*) FROM report_export_jobs WHERE status_key IN ('failed','dead_lettered')),
    count(*) FILTER (WHERE last_error IS NOT NULL AND occurred_at > now()-interval '15 minutes' AND lower(queue)='message-delivery')
    FROM outbox_events;`;
  const compose = ["compose", "-f", "docker-compose.yml", "exec", "-T", "postgres", "psql", "-U", "support", "-d", "support_communication", "-tA", "-F", "|", "-c", sql];
  const result = spawnSync("docker", compose, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return { deadLetters: 0, failedReports: 0, oldestPendingSeconds: 0, pending: 0, providerFailures: 0, unavailable: true };
  const [pending, oldestPendingSeconds, deadLetters, failedReports, providerFailures] = result.stdout.trim().split("|").map(Number);
  return { deadLetters, failedReports, oldestPendingSeconds, pending, providerFailures };
}

async function notify(snapshot, previousStatus) {
  const event = { ...snapshot, event: snapshot.status === "healthy" && previousStatus === "degraded" ? "runtime.recovered" : "runtime.status_changed", service: "support-communication-watchdog" };
  process.stdout.write(`${JSON.stringify(event)}\n`);
  const url = String(process.env.RUNTIME_WATCHDOG_WEBHOOK_URL || "").trim();
  if (!url) return;
  const response = await fetch(url, {
    body: JSON.stringify(event),
    headers: { "content-type": "application/json", ...(process.env.RUNTIME_WATCHDOG_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.RUNTIME_WATCHDOG_WEBHOOK_TOKEN}` } : {}) },
    method: "POST",
    signal: AbortSignal.timeout(positive(process.env.RUNTIME_WATCHDOG_WEBHOOK_TIMEOUT_MS, 10_000))
  });
  if (!response.ok) throw new Error(`runtime_watchdog_notification_failed:${response.status}`);
}

function readState() {
  try { return JSON.parse(readFileSync(statePath, "utf8")); } catch { return null; }
}

function writeState(snapshot) {
  mkdirSync(dirname(statePath), { recursive: true });
  const temporary = `${statePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
  renameSync(temporary, statePath);
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compact(value) { return String(value || "unknown").replace(/\s+/g, " ").trim().slice(0, 500); }
