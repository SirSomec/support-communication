import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { configureOperationsRepository } from "../apps/api-gateway/src/operations/bootstrap.ts";
import {
  OperationsRepository,
  type PrismaOperationsClient
} from "../apps/api-gateway/src/operations/operations.repository.ts";
import { bootstrapOperationsState } from "../apps/api-gateway/src/operations/seed.ts";

describe("Prisma-backed operations repository contracts", () => {
  it("fails closed when Prisma operations runtime delegates are incomplete", () => {
    const { client } = createFakePrismaOperationsClient();
    delete (client as { operationsRuntimeRecord?: unknown }).operationsRuntimeRecord;

    assert.throws(
      () => OperationsRepository.prisma({ client }),
      /prisma_operations_runtime_record_delegate_required/
    );
  });

  it("bootstraps the default operations repository from a Prisma client factory without touching JSON fallback", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "operations-prisma-bootstrap-"));
    const filePath = join(workspace, "operations-store.json");
    const { client } = createFakePrismaOperationsClient();

    try {
      const repository = configureOperationsRepository({
        DATABASE_URL: "postgresql://support:support@localhost:5432/support_communication",
        NODE_ENV: "staging",
        PORT: "4100",
        SERVICE_NAME: "api-gateway"
      }, {
        prismaClientFactory: () => client
      });

      await repository.saveRestoreCheckIdempotencyKeyAsync({
        fingerprint: "restore-bootstrap-fingerprint",
        key: "restore-bootstrap-key",
        result: { restoreCheck: { id: "restore-bootstrap" } }
      });

      const defaultRepository = OperationsRepository.default();
      const bootstrappedState = await defaultRepository.readStateAsync();

      assert.equal(repository, defaultRepository);
      assert.equal(existsSync(filePath), false);
      assert.equal(bootstrappedState.restoreCheckIdempotencyKeys[0]?.key, "restore-bootstrap-key");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      OperationsRepository.clearDefault();
    }
  });

  it("persists mutable operations runtime state through Prisma delegates without JSON fallback", async () => {
    const { calls, client } = createFakePrismaOperationsClient();
    const first = OperationsRepository.prisma({ client, seed: bootstrapOperationsState() });

    assert.throws(
      () => first.readState(),
      /prisma_operations_async_required/
    );
    assert.ok(first.listBackupDrills().some((drill) => drill.id === "backup-postgres-nightly"));

    const savedLoadKey = await first.saveLoadTestIdempotencyKeyAsync({
      fingerprint: "load-fingerprint",
      key: "load-key",
      result: { run: { id: "load-run-prisma" } }
    });
    const replayedLoadKey = await first.saveLoadTestIdempotencyKeyAsync({
      fingerprint: "changed",
      key: "load-key",
      result: { run: { id: "changed" } }
    });
    await first.saveLoadTestRunAsync({
      auditEvent: { id: "evt_load_prisma", immutable: true },
      reason: "Prisma load test queue",
      run: { id: "load-run-prisma", scenarioId: "lt-critical-flows" }
    });
    await first.saveLoadTestRunExecutionAsync({
      completedAt: null,
      operations: [{ id: "load-op-prisma", status: "queued", workflow: "dialogs" }],
      runId: "load-run-prisma",
      scenarioId: "lt-critical-flows",
      startedAt: null,
      status: "queued",
      targetRps: 30,
      traceId: "trc_load_prisma",
      updatedAt: "2026-07-03T09:00:00.000Z"
    });
    await first.saveLoadTestRunExecutionAsync({
      completedAt: null,
      operations: [{ id: "load-op-prisma", status: "running", workflow: "dialogs" }],
      runId: "load-run-prisma",
      scenarioId: "lt-critical-flows",
      startedAt: "2026-07-03T09:01:00.000Z",
      status: "running",
      targetRps: 30,
      traceId: "trc_load_prisma",
      updatedAt: "2026-07-03T09:01:00.000Z"
    });
    await first.saveLoadTestRunMetricsAsync({
      completedOperations: 1,
      failedOperations: 0,
      latencyP50Ms: 42,
      latencyP95Ms: 42,
      latencyP99Ms: 42,
      observedRps: 12,
      runId: "load-run-prisma",
      targetRps: 30,
      totalOperations: 1,
      workflowBreakdown: { dialogs: { completed: 1, failed: 0, latencyP95Ms: 42 } }
    });
    await first.saveLoadTestRunErrorSummaryAsync({
      runId: "load-run-prisma",
      sanitized: true,
      topFailures: [],
      totalFailures: 0
    });

    await first.saveRestoreCheckIdempotencyKeyAsync({
      fingerprint: "restore-fingerprint",
      key: "restore-key",
      result: { restoreCheck: { id: "restore-check-prisma" } }
    });
    await first.saveRestoreCheckAsync({
      auditEvent: { id: "evt_restore_prisma", immutable: true },
      reason: "Prisma restore check",
      restoreCheck: { drillId: "backup-postgres-nightly", id: "restore-check-prisma" }
    });
    await first.savePostgresRestoreCheckResultAsync({
      command: "pg_restore --verify",
      drillId: "backup-postgres-nightly",
      durationMs: 100,
      executedAt: "2026-07-03T09:02:00.000Z",
      id: "postgres-restore-prisma",
      outputSummary: "postgres restore verification passed",
      restoreCheckId: "restore-check-prisma",
      status: "passed"
    });
    await first.saveObjectStorageRestoreCheckExistenceResultAsync({
      artifactId: "artifact-prisma",
      drillId: "backup-postgres-nightly",
      exists: true,
      id: "object-existence-prisma",
      restoreCheckId: "restore-check-prisma",
      status: "passed",
      verifiedAt: "2026-07-03T09:03:00.000Z"
    });
    await first.saveObjectStorageRestoreCheckChecksumResultAsync({
      actualChecksum: "sha256:ok",
      artifactId: "artifact-prisma",
      drillId: "backup-postgres-nightly",
      expectedChecksum: "sha256:ok",
      id: "object-checksum-prisma",
      restoreCheckId: "restore-check-prisma",
      status: "passed",
      verifiedAt: "2026-07-03T09:03:01.000Z"
    });
    await first.saveObjectStorageRestoreCheckMetadataResultAsync({
      actualMetadata: {
        backupLabel: "backup-postgres-nightly",
        contentType: "application/json",
        schemaVersion: "object-storage-restore-metadata/v1",
        sizeBytes: 4096
      },
      artifactId: "artifact-prisma",
      drillId: "backup-postgres-nightly",
      expectedMetadata: {
        backupLabel: "backup-postgres-nightly",
        contentType: "application/json",
        schemaVersion: "object-storage-restore-metadata/v1",
        sizeBytes: 4096
      },
      id: "object-metadata-prisma",
      restoreCheckId: "restore-check-prisma",
      status: "passed",
      verifiedAt: "2026-07-03T09:03:02.000Z"
    });

    await first.saveDeadLetterReplayIdempotencyKeyAsync({
      fingerprint: "dead-letter-fingerprint",
      key: "dead-letter-key",
      result: { replay: { id: "dead-letter-replay-prisma" } }
    });
    await first.saveDeadLetterReplayAsync({
      auditEvent: { id: "evt_dead_letter_prisma", immutable: true },
      reason: "Prisma dead letter replay",
      replay: { id: "dead-letter-replay-prisma", messageId: "dlm-webhook-001", queue: "dead-letter-replay" }
    });
    await first.saveDeadLetterReplayValidationDenialAsync({
      auditEvent: { id: "evt_dead_letter_denial_prisma", immutable: true },
      code: "dead_letter_queue_unknown",
      messageId: "dlm-missing",
      queueName: "missing-queue",
      reason: "Prisma denial"
    });
    await first.saveDeadLetterReplayRequeueAuditAsync({
      auditEvent: { id: "evt_dead_letter_requeue_prisma", immutable: true },
      messageId: "dlm-webhook-001",
      queueName: "webhook-delivery",
      reason: "Prisma requeue",
      replay: { id: "dead-letter-replay-prisma" }
    });

    await first.saveMigrationRollbackCheckAsync({
      auditEvent: { id: "evt_migration_prisma", immutable: true },
      compatibilityChecks: [{ id: "rollback-plan", status: "passed" }],
      migrationId: "mig-add-message-search-index",
      policy: { compatibilityChecksRequired: true },
      reason: "Prisma rollback check",
      rollbackPlan: { applyCommand: "prisma migrate deploy" }
    });
    await first.saveMigrationRollbackCheckResultAsync({
      afterSnapshot: {
        envelopeFields: ["data"],
        migrationId: "mig-add-message-search-index",
        openapiPaths: ["/api/v1/operations"],
        responseFieldsByPath: { "/api/v1/operations": ["data"] },
        schemaVersion: "api-contract-snapshot/v1"
      },
      auditEvent: { id: "evt_migration_result_prisma", immutable: true },
      beforeSnapshot: {
        envelopeFields: ["data"],
        migrationId: "baseline",
        openapiPaths: ["/api/v1/operations"],
        responseFieldsByPath: { "/api/v1/operations": ["data"] },
        schemaVersion: "api-contract-snapshot/v1"
      },
      checkedAt: "2026-07-03T09:04:00.000Z",
      id: "migration-result-prisma",
      metadata: {
        applyCommand: "prisma migrate deploy",
        id: "mig-add-message-search-index",
        name: "Add message search index",
        rollbackCommand: "prisma migrate rollback",
        schemaVersion: "migration-rollback-metadata/v1",
        service: "conversation-service",
        status: "ready"
      },
      migrationId: "mig-add-message-search-index",
      reason: "Prisma migration result",
      status: "passed",
      toolingResults: []
    });

    const second = OperationsRepository.prisma({ client });
    const state = await second.readStateAsync();

    assert.equal(savedLoadKey.result.run.id, "load-run-prisma");
    assert.equal(replayedLoadKey.result.run.id, "load-run-prisma");
    assert.equal((await second.findLoadTestIdempotencyKeyAsync("load-key"))?.fingerprint, "load-fingerprint");
    assert.equal((await second.findRestoreCheckIdempotencyKeyAsync("restore-key"))?.fingerprint, "restore-fingerprint");
    assert.equal((await second.findDeadLetterReplayIdempotencyKeyAsync("dead-letter-key"))?.fingerprint, "dead-letter-fingerprint");
    assert.equal((await second.findLoadTestRunExecutionAsync("load-run-prisma"))?.status, "running");
    assert.equal((await second.findLoadTestRunMetricsAsync("load-run-prisma"))?.observedRps, 12);
    assert.equal((await second.findLoadTestRunErrorSummaryAsync("load-run-prisma"))?.totalFailures, 0);
    assert.equal((await second.findPostgresRestoreCheckResultAsync("postgres-restore-prisma"))?.status, "passed");
    assert.equal((await second.listPostgresRestoreCheckResultsAsync({ restoreCheckId: "restore-check-prisma" })).length, 1);
    assert.equal((await second.listObjectStorageRestoreCheckExistenceResultsAsync({ drillId: "backup-postgres-nightly" })).length, 1);
    assert.equal((await second.listObjectStorageRestoreCheckChecksumResultsAsync({ artifactId: "artifact-prisma" })).length, 1);
    assert.equal((await second.listObjectStorageRestoreCheckMetadataResultsAsync({ artifactId: "artifact-prisma" })).length, 1);
    assert.equal((await second.listDeadLetterReplayValidationDenialsAsync({ messageId: "dlm-missing" })).length, 1);
    assert.equal((await second.listDeadLetterReplayRequeueAuditsAsync({ messageId: "dlm-webhook-001" })).length, 1);
    assert.equal((await second.findMigrationRollbackCheckResultAsync("migration-result-prisma"))?.status, "passed");
    assert.equal((await second.listMigrationRollbackCheckResultsAsync({ migrationId: "mig-add-message-search-index" })).length, 1);
    assert.equal(state.loadTestRuns.some((item) => item.run.id === "load-run-prisma"), true);
    assert.equal(state.restoreChecks.some((item) => item.restoreCheck.id === "restore-check-prisma"), true);
    assert.equal(state.deadLetterReplays.some((item) => item.replay.id === "dead-letter-replay-prisma"), true);
    assert.equal(state.migrationRollbackChecks.some((item) => item.migrationId === "mig-add-message-search-index"), true);
    assert.equal(calls.runtimeUpserts.length > 12, true);
    assert.equal(calls.postgresUpserts.length, 1);
    assert.equal(calls.objectStorageUpserts.length, 3);
  });
});

function createFakePrismaOperationsClient(): { calls: FakeOperationsCalls; client: PrismaOperationsClient } {
  const runtimeRows = new Map<string, FakeOperationsRuntimeRow>();
  const postgresRows = new Map<string, FakePostgresRestoreRow>();
  const objectStorageRows = new Map<string, FakeObjectStorageRestoreRow>();
  const calls: FakeOperationsCalls = {
    objectStorageUpserts: [],
    postgresUpserts: [],
    runtimeUpserts: []
  };

  return {
    calls,
    client: {
      operationsObjectStorageRestoreCheckResult: {
        findMany(input: { orderBy?: { verifiedAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(objectStorageRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.verifiedAt.getTime() - left.verifiedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(objectStorageRows.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeObjectStorageRestoreRow;
          update: Partial<FakeObjectStorageRestoreRow>;
          where: { id: string };
        }) {
          calls.objectStorageUpserts.push(input);
          const current = objectStorageRows.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
          objectStorageRows.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      operationsPostgresRestoreCheckResult: {
        findMany(input: { orderBy?: { executedAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(postgresRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.executedAt.getTime() - left.executedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(postgresRows.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakePostgresRestoreRow;
          update: Partial<FakePostgresRestoreRow>;
          where: { id: string };
        }) {
          calls.postgresUpserts.push(input);
          const current = postgresRows.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
          postgresRows.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      operationsRuntimeRecord: {
        findMany(input: { orderBy?: { updatedAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(runtimeRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { collection_entityKey: { collection: string; entityKey: string } } }) {
          return Promise.resolve(runtimeRows.get(runtimeKey(input.where.collection_entityKey.collection, input.where.collection_entityKey.entityKey)) ?? null);
        },
        upsert(input: {
          create: FakeOperationsRuntimeRow;
          update: Partial<FakeOperationsRuntimeRow>;
          where: { collection_entityKey: { collection: string; entityKey: string } };
        }) {
          calls.runtimeUpserts.push(input);
          const key = runtimeKey(input.where.collection_entityKey.collection, input.where.collection_entityKey.entityKey);
          const current = runtimeRows.get(key);
          const next = current
            ? { ...current, ...input.update, id: current.id, collection: current.collection, entityKey: current.entityKey, createdAt: current.createdAt, updatedAt: new Date() }
            : input.create;
          runtimeRows.set(key, next);
          return Promise.resolve(next);
        }
      }
    }
  };
}

interface FakeOperationsCalls {
  objectStorageUpserts: unknown[];
  postgresUpserts: unknown[];
  runtimeUpserts: unknown[];
}

interface FakeOperationsRuntimeRow {
  collection: string;
  createdAt: Date;
  entityKey: string;
  filterKey: string | null;
  id: string;
  record: unknown;
  updatedAt: Date;
}

interface FakePostgresRestoreRow {
  command: string;
  createdAt: Date;
  drillId: string;
  durationMs: number;
  executedAt: Date;
  id: string;
  outputSummary: string;
  restoreCheckId: string;
  status: string;
}

interface FakeObjectStorageRestoreRow {
  artifactId: string;
  checkKind: string;
  createdAt: Date;
  detail: unknown;
  drillId: string;
  id: string;
  restoreCheckId: string;
  status: string;
  verifiedAt: Date;
}

function runtimeKey(collection: string, entityKey: string): string {
  return `${collection}:${entityKey}`;
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && !Array.isArray(expected) && "in" in expected) {
      return (expected as { in: unknown[] }).in.includes(row[key]);
    }
    return row[key] === expected;
  });
}
