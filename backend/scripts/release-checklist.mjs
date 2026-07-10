import { spawnSync } from "node:child_process";

const checklistSteps = [
  { name: "Release database preflight", script: "release:database:preflight" },
  { name: "Prisma schema validation", script: "prisma:validate" },
  { name: "Prisma client generation", script: "prisma:generate" },
  { name: "Prisma migration deploy", script: "prisma:migrate:deploy" },
  { name: "Prisma identity seed", script: "prisma:seed" },
  { name: "Dependency security audit", script: "security:audit" },
  { name: "Tenant isolation verification", script: "tenant-isolation:verify" },
  { name: "Immutable audit verification", script: "audit-immutability:verify" },
  { name: "Migration rollback-check verification", script: "migration-rollback-check:verify" },
  { name: "Public API docs smoke", script: "public-api:docs:verify" },
  { name: "Secret redaction runtime smoke", script: "redaction:runtime-smoke" },
  { name: "Outbox worker smoke", script: "outbox:worker:once" },
  {
    name: "Provider outbox runtime smoke",
    script: "provider:outbox:smoke",
    env: {
      OUTBOX_PROVIDER_SMOKE_ENABLED: "true"
    }
  },
  { name: "File scan scanner worker smoke", script: "file-scan:worker:once" },
  { name: "Billing sync worker smoke", script: "billing:worker:once" },
  { name: "Notification delivery worker smoke", script: "notification:worker:once" },
  { name: "Webhook delivery worker smoke", script: "webhook:worker:once" },
  { name: "Telegram polling worker smoke", script: "telegram-polling:worker:once" },
  { name: "Proactive delivery worker smoke", script: "proactive-delivery:worker:once" },
  { name: "Proactive delivery Prisma concurrency smoke", script: "proactive-delivery:prisma-concurrency-smoke" },
  { name: "Public demo lead notification worker smoke", script: "lead-notification:worker:once" },
  { name: "Report digest worker smoke", script: "report-digest:worker:once" },
  { name: "Report export worker smoke", script: "report-export:worker:once" }
];

for (const step of checklistSteps) {
  process.stdout.write(`Running ${step.name}...\n`);
  const result = spawnSync("npm", ["run", step.script], {
    env: { ...process.env, ...step.env },
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
