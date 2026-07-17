// Phase C (prisma-only runtime plan 2026-07-15): reset a dedicated Postgres
// database for the Playwright smoke gateway. The smokes previously ran against
// per-run empty JSON stores; on Postgres they need a hermetic database that is
// dropped, re-migrated and re-seeded before every run so state never leaks
// between runs or into the dev database.
//
// Usage: node --env-file=.env.example scripts/smoke-db-reset.mjs
// Env:   DATABASE_URL         base connection (dev db); the smoke db name is swapped in
//        SMOKE_DATABASE_NAME  smoke db name (default: support_communication_smoke)
import { spawnSync } from "node:child_process";

const BASE_URL = process.env.DATABASE_URL ?? "postgresql://support:support@127.0.0.1:56432/support_communication";
const SMOKE_DB = process.env.SMOKE_DATABASE_NAME ?? "support_communication_smoke";
// Swap the database segment of the URL, preserving any query string.
const SMOKE_URL = BASE_URL.replace(/\/[^/?]+(\?|$)/, `/${SMOKE_DB}$1`);
const parsedBaseUrl = new URL(BASE_URL);

if (!/^support_communication_smoke[a-zA-Z0-9_]*$/.test(SMOKE_DB)) {
  process.stderr.write(`Refusing to reset a non-smoke database: ${SMOKE_DB}\n`);
  process.exit(1);
}

function psql(database, args, { capture = false } = {}) {
  const hostname = ["127.0.0.1", "localhost", "::1"].includes(parsedBaseUrl.hostname)
    ? "host.docker.internal"
    : parsedBaseUrl.hostname;
  return spawnSync(
    "docker",
    [
      "run", "--rm",
      "--add-host=host.docker.internal:host-gateway",
      "-e", `PGPASSWORD=${decodeURIComponent(parsedBaseUrl.password)}`,
      "postgres:16-alpine",
      "psql",
      "-h", hostname,
      "-p", parsedBaseUrl.port || "5432",
      "-U", decodeURIComponent(parsedBaseUrl.username),
      "-d", database,
      ...args
    ],
    { cwd: process.cwd(), encoding: "utf8", shell: false, stdio: capture ? "pipe" : "inherit" }
  );
}

// 1. Ensure the smoke database exists (create it once; reset happens via prisma below).
process.stdout.write(`Ensuring database ${SMOKE_DB} exists...\n`);
const exists = psql("postgres", ["-tAc", `SELECT 1 FROM pg_database WHERE datname='${SMOKE_DB}'`], { capture: true });
if (exists.status !== 0) {
  process.stderr.write(`Could not query the PostgreSQL server from DATABASE_URL.\n${exists.stderr ?? ""}\n`);
  process.exit(exists.status ?? 1);
}
if (!String(exists.stdout ?? "").trim()) {
  const created = psql("postgres", ["-c", `CREATE DATABASE ${SMOKE_DB}`]);
  if (created.status !== 0) process.exit(created.status ?? 1);
}

// 2. Drop + recreate the public schema of the dedicated smoke db (hermetic
// reset), then apply every migration forward. `migrate deploy` is forward-only
// (non-destructive); the destructive step is an explicit DROP SCHEMA scoped to
// the name-guarded smoke database above, never the dev or prod database.
process.stdout.write(`Resetting schema of ${SMOKE_DB}...\n`);
const drop = psql(SMOKE_DB, ["-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"]);
if (drop.status !== 0) process.exit(drop.status ?? 1);

process.stdout.write(`Applying migrations to ${SMOKE_DB}...\n`);
const deploy = spawnSync(
  process.execPath,
  ["scripts/run-prisma.mjs", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
  { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: SMOKE_URL }, shell: false, stdio: "inherit" }
);
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

process.stdout.write(`Smoke database ${SMOKE_DB} reset and migrated.\n`);
