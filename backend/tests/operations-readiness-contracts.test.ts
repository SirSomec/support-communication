import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";
import { OperationsReadinessService } from "../apps/api-gateway/src/operations/operations-readiness.service.ts";

describe("phase 10 operations hardening and production readiness backend contracts", () => {
  it("returns production readiness posture across load, backup, dead-letter, migration and security domains", async () => {
    const operations = new OperationsReadinessService();

    const readiness = await operations.fetchReadinessDashboard({ domain: "delivery" });

    assert.equal(readiness.service, "operationsReadinessService");
    assert.equal(readiness.status, "ok");
    assert.equal(readiness.partial, true);
    assert.equal(readiness.data.summary.productionReady, false);
    assert.ok(readiness.data.summary.blockers.some((blocker) => blocker.includes("restore")));
    assert.ok(readiness.data.loadTests.some((scenario) => scenario.id === "lt-webhook-delivery"));
    assert.ok(readiness.data.backupDrills.some((drill) => drill.id === "backup-postgres-nightly"));
    assert.ok(readiness.data.deadLetterQueues.some((queue) => queue.id === "dlq-webhooks"));
    assert.ok(readiness.data.migrationCandidates.some((migration) => migration.id === "mig-add-message-search-index"));
    assert.equal(readiness.data.migrationPolicy.requiresRollbackPlan, true);
    assert.ok(readiness.data.securityControls.some((control) => control.area === "tenant_isolation"));
  });

  it("queues load test runs with target workflow coverage, audit metadata and idempotency", async () => {
    const operations = new OperationsReadinessService();

    const missingReason = await operations.queueLoadTestRun({
      confirmed: true,
      reason: "",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const missingConfirmation = await operations.queueLoadTestRun({
      reason: "Validate critical flow capacity",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error?.code, "confirmation_required");

    const queued = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-critical-flows",
      reason: "Validate critical flow capacity",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(queued.status, "ok");
    assert.equal(queued.data.run.queue, "load-test-runs");
    assert.deepEqual(queued.data.run.workflows, ["dialogs", "message-send", "webhook-delivery", "report-export", "realtime-fanout"]);
    assert.equal(queued.data.auditEvent.action, "operations.load_test.queue");
    assert.equal(queued.data.auditEvent.immutable, true);

    const duplicate = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-critical-flows",
      reason: "Validate critical flow capacity",
      scenarioId: "lt-critical-flows"
    });
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.run.id, queued.data.run.id);

    const conflict = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-critical-flows",
      reason: "Validate webhook capacity",
      scenarioId: "lt-webhook-delivery"
    });
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "idempotency_key_reused");

    const webhookDelivery = await operations.queueLoadTestRun({
      confirmed: true,
      idempotencyKey: "load-webhook-delivery",
      reason: "Validate webhook delivery capacity",
      scenarioId: "lt-webhook-delivery"
    });
    assert.equal(webhookDelivery.status, "ok");
    assert.deepEqual(webhookDelivery.data.run.workflows, ["webhook-delivery", "dead-letter-replay"]);
    assert.equal(webhookDelivery.data.execution.status, "queued");
  });

  it("queues backup restore checks and migration rollback compatibility checks", async () => {
    const operations = new OperationsReadinessService();

    const restore = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      reason: "Quarterly restore drill"
    });
    assert.equal(restore.status, "ok");
    assert.equal(restore.data.restoreCheck.queue, "restore-drills");
    assert.equal(restore.data.restoreCheck.destructiveAllowed, false);
    assert.ok(restore.data.restoreCheck.targets.includes("postgres"));
    assert.ok(restore.data.restoreCheck.targets.includes("object-storage-metadata"));
    assert.equal(restore.data.auditEvent.action, "operations.restore_check.queue");
    assert.equal(restore.data.workerResults.postgres?.result?.status, "failed");
    assert.equal(restore.data.workerResults.postgres?.envelope?.code, "postgres_restore_check_failed");
    assert.equal(restore.data.workerResults.objectStorage?.existence?.result?.status, "missing");
    assert.equal(restore.data.workerResults.objectStorage?.existence?.denial?.code, "object_storage_restore_check_artifact_missing");

    const idempotentRestore = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      idempotencyKey: "restore-postgres-nightly",
      reason: "Quarterly restore drill"
    });
    assert.equal(idempotentRestore.status, "ok");

    const duplicateRestore = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      idempotencyKey: "restore-postgres-nightly",
      reason: "Quarterly restore drill"
    });
    assert.equal(duplicateRestore.status, "ok");
    assert.equal(duplicateRestore.data.duplicate, true);
    assert.equal(duplicateRestore.data.restoreCheck.id, idempotentRestore.data.restoreCheck.id);

    const restoreConflict = await operations.queueRestoreCheck({
      confirmed: true,
      drillId: "backup-audit-ledger",
      idempotencyKey: "restore-postgres-nightly",
      reason: "Audit restore drill"
    });
    assert.equal(restoreConflict.status, "conflict");
    assert.equal(restoreConflict.error?.code, "idempotency_key_reused");

    const rollback = await operations.checkMigrationRollback({
      confirmed: true,
      migrationId: "mig-add-message-search-index",
      reason: "Validate release rollback policy"
    });
    assert.equal(rollback.status, "ok");
    assert.equal(rollback.data.policy.requiresRollbackPlan, true);
    assert.equal(rollback.data.compatibilityChecks.every((check) => check.status !== "failed"), true);
    assert.match(rollback.data.rollbackPlan.applyCommand, /npm run db:migrate/);
    assert.match(rollback.data.rollbackPlan.rollbackCommand, /npm run db:rollback/);
    assert.equal(rollback.data.auditEvent.action, "operations.migration.rollback_check");
    assert.equal(rollback.data.toolingStatus, "passed");
    assert.equal(rollback.data.toolingResults.length, 3);

    const failedRollback = await operations.checkMigrationRollback({
      confirmed: true,
      migrationId: "mig-drop-legacy-channel",
      reason: "Validate failed rollback gate"
    });
    assert.equal(failedRollback.status, "conflict");
    assert.equal(failedRollback.error?.code, "migration_compatibility_failed");
  });

  it("exposes dead-letter replay tooling and security review controls without leaking secrets", async () => {
    const repository = OperationsRepository.inMemory();
    const operations = new OperationsReadinessService(repository);

    const deadLetters = await operations.fetchDeadLetterDashboard({ queue: "webhook-delivery" });
    assert.equal(deadLetters.status, "ok");
    assert.ok(deadLetters.data.queues.every((queue) => queue.name === "webhook-delivery"));
    assert.ok(deadLetters.data.messages.some((message) => message.id === "dlm-webhook-001"));

    const replay = await operations.replayDeadLetterMessage({
      confirmed: true,
      idempotencyKey: "replay-webhook-001",
      messageId: "dlm-webhook-001",
      reason: "Replay after signature fix"
    });
    assert.equal(replay.status, "conflict");
    assert.equal(replay.error?.code, "dead_letter_replay_backend_unavailable");
    assert.equal(repository.readState().deadLetterReplays.length, 0);
    assert.equal(repository.listDeadLetterReplayValidationDenials({ messageId: "dlm-webhook-001" })[0]?.code, "dead_letter_replay_backend_unavailable");

    const disabledReplay = await operations.replayDeadLetterMessage({
      confirmed: true,
      messageId: "dlm-billing-001",
      reason: "Replay disabled queue"
    });
    assert.equal(disabledReplay.status, "conflict");
    assert.equal(disabledReplay.error?.code, "dead_letter_replay_disabled");

    const security = await operations.fetchSecurityReview({ area: "api_keys" });
    assert.equal(security.status, "ok");
    assert.ok(security.data.controls.every((control) => control.area === "api_keys"));
    assert.ok(security.data.controls.every((control) => control.secretMaterialExposed === false));
    assert.ok(security.data.controls.some((control) => control.evidence.some((item) => item.includes("rotation"))));

    const invalidSecurityArea = await operations.fetchSecurityReview({ area: "payments" });
    assert.equal(invalidSecurityArea.status, "invalid");
    assert.equal(invalidSecurityArea.error?.code, "security_area_unsupported");
    assert.ok(invalidSecurityArea.data.supportedAreas.includes("api_keys"));
  });

  it("runs release verification gates from the PostgreSQL smoke entrypoint", () => {
    const smoke = readFileSync(new URL("../scripts/smoke-postgres.mjs", import.meta.url), "utf8");

    assert.match(smoke, /tenant-isolation:verify/);
    assert.match(smoke, /audit-immutability:verify/);
    assert.match(smoke, /redaction:runtime-smoke/);
  });
});
