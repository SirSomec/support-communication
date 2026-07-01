import { spawnSync } from "node:child_process";

const smokeSteps = [
  { name: "Prisma migration deploy", script: "prisma:migrate:deploy" },
  { name: "Prisma identity seed", script: "prisma:seed" },
  { name: "Tenant isolation verification", script: "tenant-isolation:verify" },
  { name: "Immutable audit verification", script: "audit-immutability:verify" },
  { name: "Secret redaction runtime smoke", script: "redaction:runtime-smoke" }
];

for (const step of smokeSteps) {
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

process.stdout.write("PostgreSQL migration, seed and release-gate smoke completed.\n");
