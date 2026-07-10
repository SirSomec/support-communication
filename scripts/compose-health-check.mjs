import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const requiredServices = new Map([
  ["api-gateway", { health: "healthy" }],
  ["billing-sync-worker", {}],
  ["frontend", {}],
  ["lead-notification-worker", {}],
  ["mailpit", { health: "healthy" }],
  ["minio", { health: "healthy" }],
  ["notification-delivery-worker", {}],
  ["outbox-worker", {}],
  ["postgres", { health: "healthy" }],
  ["proactive-delivery-worker", {}],
  ["report-digest-worker", {}],
  ["report-export-worker", {}],
  ["redis", { health: "healthy" }],
  ["telegram-polling-worker", {}],
  ["webhook-delivery-worker", {}]
]);

const result = spawnSync(
  "docker",
  [
    "compose",
    "-f",
    "docker-compose.yml",
    "-f",
    "docker-compose.pilot.yml",
    "--profile",
    "prisma-postgres",
    "ps",
    "--format",
    "json"
  ],
  {
    cwd: root,
    encoding: "utf8"
  }
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const rows = parseComposePs(result.stdout);
const byService = new Map(rows.map((row) => [String(row.Service ?? ""), row]));
const failures = [];

for (const [service, requirement] of requiredServices.entries()) {
  const row = byService.get(service);
  if (!row) {
    failures.push(`${service}: missing`);
    continue;
  }

  if (row.State !== "running") {
    failures.push(`${service}: state=${row.State || "unknown"}`);
  }

  if (requirement.health && row.Health !== requirement.health) {
    failures.push(`${service}: health=${row.Health || "none"}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`Compose health check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Compose health check passed for ${requiredServices.size} services.\n`);

function parseComposePs(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
