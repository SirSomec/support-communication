import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const auditSuites = [
  {
    file: "tests/billing-service-admin-contracts.test.ts",
    pattern: "persists billing tariff and quota audit evidence|syncs provider subscription|replays invoice-only|fails duplicate provider replay|persists service-admin impersonation and break-glass audit evidence"
  },
  {
    file: "tests/outbox-worker-contracts.test.ts",
    pattern: "replays dead-lettered outbox events through a common queue helper|delegates dead-letter replay|replays dead-lettered billing sync jobs"
  },
  {
    file: "tests/integration-contracts.test.ts",
    pattern: "persists immutable webhook replay audit events|first-write-wins"
  },
  {
    file: "tests/identity-contracts.test.ts",
    pattern: "persists tenant status audit events as immutable privileged mutation evidence"
  },
  {
    file: "tests/report-contracts.test.ts",
    pattern: "persists immutable report export retry audit events"
  },
  {
    file: "tests/automation-quality-contracts.test.ts",
    pattern: "preserves immutable quality rating audit evidence|preserves immutable manual QA review audit evidence|preserves immutable AI scoring audit evidence"
  },
  {
    file: "tests/prisma-billing-repository-contracts.test.ts",
    pattern: "provider sync subscription|quota reservations"
  },
  {
    file: "tests/prisma-outbox-contracts.test.ts",
    pattern: "dead-letter replay audit|billing provider sync audit|Prisma schema"
  },
  {
    file: "tests/persistent-foundation-contracts.test.ts",
    pattern: "provider subscription and invoice sync|durable report exports|durable integration rotations"
  },
  {
    file: "tests/dead-letter-replay-contracts.test.ts",
    pattern: "validation-denial audit|requeue audit|immutable"
  }
];

describe("immutable audit release verifier", () => {
  for (const suite of auditSuites) {
    it(`passes ${suite.file} audit gates`, () => {
      const result = spawnSync(process.execPath, [
        "--test",
        "--import",
        "tsx",
        suite.file,
        "--test-name-pattern",
        suite.pattern
      ], {
        cwd: new URL("..", import.meta.url),
        encoding: "utf8"
      });

      assert.equal(result.status, 0, [
        result.stdout,
        result.stderr
      ].filter(Boolean).join("\n"));
    });
  }
});
