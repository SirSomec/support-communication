import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveBotRuntimeDeadLetterState,
  resolveBotRuntimeRetryState
} from "../apps/api-gateway/src/automation/bot-runtime.worker.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";

describe("BAI-704 bot load and failover contracts", () => {
  it("schedules retry then dead-letters after max attempts", () => {
    const retry = resolveBotRuntimeRetryState({
      currentAttempts: 0,
      error: new Error("provider_timeout"),
      failedAt: "2026-07-12T10:00:00.000Z",
      retryBackoffMs: 2000
    });
    assert.equal(retry.status, "retry_scheduled");
    assert.equal(retry.nextAttemptAt, "2026-07-12T10:00:02.000Z");
    assert.match(retry.lastError, /provider_timeout/);

    const dead = resolveBotRuntimeDeadLetterState({
      currentAttempts: 2,
      error: new Error("provider_5xx"),
      failedAt: "2026-07-12T10:00:05.000Z"
    });
    assert.equal(dead.status, "dead_lettered");
    assert.equal(dead.deadLetteredAt, "2026-07-12T10:00:05.000Z");
    assert.match(dead.lastError, /provider_5xx/);
  });

  it("treats repeated publish with the same idempotency key as a duplicate", async () => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    try {
      const automation = new AutomationService();
      const scenario = {
        id: "bot-load-publish",
        name: "Load publish",
        channels: ["SDK"],
        flowNodes: [{ id: "start", type: "message", title: "Hi" }],
        flowEdges: [] as Array<{ from: string; to: string }>,
        idempotencyKey: "load-publish-1"
      };
      await automation.createBotScenario(scenario, { tenantId: "tenant-volga" });
      const first = await automation.publishBotScenario(scenario, { tenantId: "tenant-volga" });
      const second = await automation.publishBotScenario(scenario, { tenantId: "tenant-volga" });
      assert.equal(first.status, "ok");
      assert.equal(second.status, "ok");
      assert.equal(first.data.duplicate, false);
      assert.equal(second.data.duplicate, true);
    } finally {
      AutomationRepository.clearDefault();
    }
  });

  it("keeps additive bot scenario migrations and restore docs available", () => {
    const migrationsDir = join(process.cwd(), "prisma/migrations");
    const required = [
      "202607120003_bot_scenario_lifecycle/migration.sql",
      "202607120004_bot_scenario_triggers/migration.sql"
    ];
    for (const relative of required) {
      const path = join(migrationsDir, relative);
      assert.equal(existsSync(path), true, relative);
      const sql = readFileSync(path, "utf8");
      assert.match(sql, /CREATE|ALTER/i);
      assert.doesNotMatch(sql, /DROP TABLE/i);
    }
    const restoreDoc = [
      join(process.cwd(), "../docs/runtime-backup-and-recovery.md"),
      join(process.cwd(), "docs/runtime-backup-and-recovery.md")
    ].find((path) => existsSync(path));
    assert.ok(restoreDoc, "runtime-backup-and-recovery.md must exist");
  });

  it("documents provider 429/5xx/timeout failover expectations in operations runbook", () => {
    const runbookCandidates = [
      join(process.cwd(), "../docs/bots-ai-operations-runbook.md"),
      join(process.cwd(), "docs/bots-ai-operations-runbook.md")
    ];
    const runbook = runbookCandidates.map((path) => (existsSync(path) ? readFileSync(path, "utf8") : "")).find(Boolean) ?? "";
    assert.match(runbook, /provider outage|Provider outage/i);
    assert.match(runbook, /quota|429|rate/i);
    assert.match(runbook, /dead-letter|dead letter/i);
    assert.match(runbook, /Kill switch/i);
  });
});
