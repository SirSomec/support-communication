import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createDeterministicPostgresRestoreCheckCommandAdapter,
  createPostgresRestoreCheckAuditDescriptor,
  createPostgresRestoreCheckCommandPort,
  createPostgresRestoreCheckFailureEnvelope,
  executePostgresRestoreCheck,
  findPostgresRestoreCheckResult,
  persistPostgresRestoreCheckResult
} from "../apps/api-gateway/src/operations/postgres-restore-check.worker.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";

describe("postgres restore-check worker contracts", () => {
  it("defines PostgreSQL restore-check result repository contracts", () => {
    const repository = OperationsRepository.inMemory();
    const saved = persistPostgresRestoreCheckResult(repository, {
      command: "pg_restore --verify --targets=postgres",
      drillId: "backup-postgres-nightly",
      durationMs: 420,
      executedAt: "2026-07-01T10:00:00.000Z",
      id: "postgres_restore_result_repo_001",
      outputSummary: "postgres restore verification passed",
      restoreCheckId: "restore_check_repo_001",
      status: "passed"
    });
    saved.outputSummary = "mutated";
    const listed = repository.listPostgresRestoreCheckResults({ drillId: "backup-postgres-nightly" });

    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "postgres_restore_result_repo_001");
    assert.equal(listed[0].status, "passed");
    assert.equal(findPostgresRestoreCheckResult(repository, "postgres_restore_result_repo_001")?.outputSummary, "postgres restore verification passed");
  });

  it("documents Prisma restore-check result schema, migration and ownership coverage", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(
      new URL("../prisma/migrations/202607010007_operations_postgres_restore_check_results/migration.sql", import.meta.url),
      "utf8"
    );
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model OperationsPostgresRestoreCheckResult/);
    assert.match(migration, /operations_postgres_restore_check_results/);
    assert.match(ownershipMap, /operations_postgres_restore_check_results/);
    assert.match(ownershipMap, /`api-gateway`/);
  });

  it("implements restore-check command adapter boundary", async () => {
    const port = createPostgresRestoreCheckCommandPort(async (request) => ({
      command: `custom-restore ${request.drillId}`,
      durationMs: 100,
      ok: true,
      outputSummary: "custom adapter passed",
      status: "passed"
    }));

    const result = await port.execute({
      drillId: "backup-postgres-nightly",
      restoreCheckId: "restore_check_adapter_001",
      targets: ["postgres"],
      timeoutMs: 5_000
    });

    assert.equal(result.command, "custom-restore backup-postgres-nightly");
    assert.equal(result.status, "passed");
  });

  it("implements deterministic restore-check command adapter for tests", async () => {
    const adapter = createDeterministicPostgresRestoreCheckCommandAdapter({
      outcomes: new Map([
        ["backup-postgres-nightly", {
          command: "pg_restore --verify --targets=postgres,object-storage-metadata",
          durationMs: 512,
          ok: false,
          outputSummary: "checksum mismatch on pg_dump artifact",
          status: "failed"
        }]
      ])
    });

    const failed = await adapter.execute({
      drillId: "backup-postgres-nightly",
      restoreCheckId: "restore_check_deterministic_001",
      targets: ["postgres", "object-storage-metadata"],
      timeoutMs: 5_000
    });
    const passed = await adapter.execute({
      drillId: "backup-audit-ledger",
      restoreCheckId: "restore_check_deterministic_002",
      targets: ["postgres", "audit-ledger"],
      timeoutMs: 5_000
    });

    assert.equal(failed.status, "failed");
    assert.equal(passed.status, "passed");
    assert.match(passed.command, /pg_restore --verify/);
  });

  it("executes one PostgreSQL restore-check command through the adapter", async () => {
    const repository = OperationsRepository.inMemory();
    const execution = await executePostgresRestoreCheck({
      auditReason: "Quarterly restore drill execution",
      commandPort: createDeterministicPostgresRestoreCheckCommandAdapter(),
      drillId: "backup-postgres-nightly",
      now: new Date("2026-07-01T10:05:00.000Z"),
      operationsRepository: repository,
      restoreCheckId: "restore_check_execute_001",
      targets: ["postgres", "object-storage-metadata"],
      timeoutMs: 5_000
    });

    assert.equal(execution.result.status, "passed");
    assert.equal(execution.result.drillId, "backup-postgres-nightly");
    assert.equal(execution.envelope, null);
    assert.equal(execution.audit.action, "operations.postgres_restore_check.execute");
    assert.equal(execution.audit.immutable, true);
    assert.equal(findPostgresRestoreCheckResult(repository, execution.result.id)?.restoreCheckId, "restore_check_execute_001");
  });

  it("persists PostgreSQL restore-check result rows", async () => {
    const repository = OperationsRepository.inMemory();
    const execution = await executePostgresRestoreCheck({
      auditReason: "Persist restore result row",
      commandPort: createDeterministicPostgresRestoreCheckCommandAdapter({
        outcomes: new Map([
          ["backup-audit-ledger", {
            command: "pg_restore --verify --targets=postgres,audit-ledger",
            durationMs: 333,
            ok: true,
            outputSummary: "audit ledger restore verification passed",
            status: "passed"
          }]
        ])
      }),
      drillId: "backup-audit-ledger",
      operationsRepository: repository,
      restoreCheckId: "restore_check_persist_001",
      targets: ["postgres", "audit-ledger"],
      timeoutMs: 5_000
    });
    const persisted = repository.readState().postgresRestoreCheckResults[0];

    assert.equal(persisted.id, execution.result.id);
    assert.equal(persisted.durationMs, 333);
    assert.equal(persisted.status, "passed");
  });

  it("wires restore-check failure envelopes", async () => {
    const repository = OperationsRepository.inMemory();
    const execution = await executePostgresRestoreCheck({
      auditReason: "Failure envelope drill",
      commandPort: createDeterministicPostgresRestoreCheckCommandAdapter({
        outcomes: new Map([
          ["backup-postgres-nightly", {
            command: "pg_restore --verify --targets=postgres",
            durationMs: 210,
            ok: false,
            outputSummary: "Bearer sk-live-secret restore auth failed",
            status: "failed"
          }]
        ])
      }),
      drillId: "backup-postgres-nightly",
      operationsRepository: repository,
      restoreCheckId: "restore_check_failure_001",
      targets: ["postgres"],
      timeoutMs: 5_000
    });
    const envelope = createPostgresRestoreCheckFailureEnvelope({
      drillId: "backup-postgres-nightly",
      message: execution.result.outputSummary,
      restoreCheckId: "restore_check_failure_001",
      status: "failed"
    });

    assert.equal(execution.envelope?.code, "postgres_restore_check_failed");
    assert.equal(execution.envelope?.sanitized, true);
    assert.match(execution.envelope?.message ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.doesNotMatch(execution.envelope?.message ?? "", /sk-live-secret/);
    assert.equal(envelope.sanitized, true);
  });

  it("wires restore-check timeout handling", async () => {
    const repository = OperationsRepository.inMemory();
    const execution = await executePostgresRestoreCheck({
      auditReason: "Timeout drill",
      commandPort: createPostgresRestoreCheckCommandPort(async () => new Promise(() => {})),
      drillId: "backup-postgres-nightly",
      operationsRepository: repository,
      restoreCheckId: "restore_check_timeout_001",
      targets: ["postgres"],
      timeoutMs: 25
    });

    assert.equal(execution.result.status, "timed_out");
    assert.equal(execution.envelope?.code, "postgres_restore_check_timed_out");
    assert.equal(execution.envelope?.status, "timed_out");
    assert.match(execution.result.outputSummary, /timed out/i);
  });

  it("wires restore-check audit descriptors", () => {
    const audit = createPostgresRestoreCheckAuditDescriptor({
      drillId: "backup-postgres-nightly",
      reason: "Quarterly restore drill",
      restoreCheckId: "restore_check_audit_001",
      resultId: "postgres_restore_result_audit_001",
      status: "passed"
    });

    assert.equal(audit.action, "operations.postgres_restore_check.execute");
    assert.equal(audit.immutable, true);
    assert.equal(audit.target, "backup-postgres-nightly");
    assert.match(audit.id, /^evt_postgres_restore_/);
    assert.equal(existsSync(new URL("../apps/api-gateway/src/operations/postgres-restore-check.worker.ts", import.meta.url)), true);
  });
});
