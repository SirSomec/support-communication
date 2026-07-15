// Phase C (prisma-only runtime plan 2026-07-15): full hermetic seed of the
// Playwright smoke database. Chains: reset+migrate -> identity/billing baseline
// (prisma:seed, which also populates the permission_role reference table) ->
// demo catalog for the remaining domains. Run before launching the smoke gateway.
//
// Usage: node --env-file=.env.example scripts/smoke-db-seed.mjs
import { spawnSync } from "node:child_process";

const BASE_URL = process.env.DATABASE_URL ?? "postgresql://support:support@127.0.0.1:56432/support_communication";
const SMOKE_DB = process.env.SMOKE_DATABASE_NAME ?? "support_communication_smoke";
const SMOKE_URL = BASE_URL.replace(/\/[^/?]+(\?|$)/, `/${SMOKE_DB}$1`);

function step(label, args, env = {}) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, ...env }, shell: false, stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(`Step failed: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

// 1. Reset schema + apply migrations to the dedicated smoke db (harness swaps in
//    the smoke db name itself, so it runs against the dev base URL from --env-file).
step("reset + migrate smoke db", ["--env-file=.env.example", "scripts/smoke-db-reset.mjs"]);

// 2. Identity + billing baseline (tenants, users, RBAC grants, and the
//    permission_role reference table the catalog seeder's grants depend on).
step("seed identity + billing baseline", ["--env-file=.env.example", "--import", "tsx", "scripts/seed-identity.ts"], { DATABASE_URL: SMOKE_URL });

// 3. Demo catalog for the remaining nine domains (isolated per domain; known
//    normalization gaps in conversation/automation/integrations are reported, not fatal).
step("seed demo catalog", ["--env-file=.env.example", "--import", "tsx", "scripts/seed-smoke-catalog.ts"], { DATABASE_URL: SMOKE_URL });

process.stdout.write(`\nSmoke database ${SMOKE_DB} fully seeded.\n`);
