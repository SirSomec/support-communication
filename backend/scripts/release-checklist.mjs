import { spawnSync } from "node:child_process";

const checklistSteps = [
  { name: "Prisma schema validation", script: "prisma:validate" },
  { name: "Prisma migration deploy", script: "prisma:migrate:deploy" },
  { name: "Prisma identity seed", script: "prisma:seed" },
  { name: "Tenant isolation verification", script: "tenant-isolation:verify" },
  { name: "Immutable audit verification", script: "audit-immutability:verify" },
  { name: "Migration rollback-check verification", script: "migration-rollback-check:verify" },
  { name: "Public API docs smoke", script: "public-api:docs:verify" },
  { name: "Secret redaction runtime smoke", script: "redaction:runtime-smoke" },
  { name: "Outbox worker smoke", script: "outbox:worker:once" },
  { name: "Billing sync worker smoke", script: "billing:worker:once" }
];

for (const step of checklistSteps) {
  process.stdout.write(`Running ${step.name}...\n`);
  const result = spawnSync("npm", ["run", step.script], {
    env: process.env,
    shell: true,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(`${step.name} failed with exit code ${result.status ?? 1}.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("Backend release verification checklist completed.\n");
