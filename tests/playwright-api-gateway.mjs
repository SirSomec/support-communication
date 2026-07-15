import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Phase C (prisma-only runtime plan 2026-07-15): the Playwright smoke gateway
// runs against a dedicated, hermetic Postgres database instead of per-run JSON
// stores. Before booting the gateway we reset + migrate + seed that database
// (smoke:db-seed), then start the gateway in production-like Prisma mode.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(repoRoot, "backend");

const smokeDatabaseName = process.env.SMOKE_DATABASE_NAME ?? "support_communication_smoke";
const smokeDatabaseUrl = process.env.SMOKE_DATABASE_URL
  ?? `postgresql://support:support@127.0.0.1:56432/${smokeDatabaseName}`;

// 1. Hermetic reset + seed of the dedicated smoke database (idempotent per run).
const seed = spawnSync(process.execPath, ["--env-file=.env.example", "scripts/smoke-db-seed.mjs"], {
  cwd: backendDir,
  env: { ...process.env, SMOKE_DATABASE_NAME: smokeDatabaseName },
  shell: false,
  stdio: "inherit"
});
if (seed.status !== 0) {
  process.stderr.write("Smoke database seed failed; aborting gateway start.\n");
  process.exit(seed.status ?? 1);
}

// 2. Production-like Prisma mode against the smoke database. NODE_ENV=test keeps
//    the deterministic MFA OTP (123456) the smokes rely on; every repository runs
//    on Postgres so there is no JSON-store third mode.
const repositoryEnvVars = [
  "IDENTITY_REPOSITORY",
  "BILLING_REPOSITORY",
  "CONVERSATION_REPOSITORY",
  "WORKSPACE_REPOSITORY",
  "ROUTING_REPOSITORY",
  "PRESENCE_REPOSITORY",
  "INTEGRATION_REPOSITORY",
  "NOTIFICATION_REPOSITORY",
  "OPERATIONS_REPOSITORY",
  "PLATFORM_REPOSITORY",
  "QUALITY_REPOSITORY",
  "QUALITY_SCORING_REPOSITORY",
  "OPEN_CHANNEL_REPOSITORY",
  "AUTOMATION_REPOSITORY",
  "REPORT_REPOSITORY"
];

const env = {
  ...process.env,
  SERVICE_NAME: "api-gateway-playwright",
  TELEGRAM_POLLING_ENABLED: "false",
  RUNTIME_PROFILE: "production-like",
  LOCAL_DEVELOPMENT_SEED_ENABLED: "false",
  NODE_ENV: "test",
  MFA_OTP_DELIVERY_MODE: "deterministic",
  DATABASE_URL: smokeDatabaseUrl,
  // production-like config validation requires non-default secrets (same local-dev
  // values the docker stack uses); the smoke gateway is never internet-facing.
  DEMO_SERVICE_ADMIN_KEY: process.env.DEMO_SERVICE_ADMIN_KEY ?? "local-dev-service-admin-key",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "local-dev-access-secret-16",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "local-dev-refresh-secret-16",
  PUBLIC_API_KEY_SECRET: process.env.PUBLIC_API_KEY_SECRET ?? "local-dev-public-api-secret"
};
for (const name of repositoryEnvVars) {
  env[name] = "prisma";
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "start:api-gateway"], {
  cwd: backendDir,
  env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

function forward(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
