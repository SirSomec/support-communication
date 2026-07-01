import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  checkAdditiveMigrationCompatibility,
  checkEnvelopeContractDiff,
  checkOpenApiContractDiff,
  executeMigrationRollbackCheck,
  findMigrationRollbackCheckResult,
  getMigrationRollbackCheckReleaseChecklistSteps,
  migrationMetadataFromCandidate,
  parseMigrationRollbackCheckRuntimeConfig,
  persistMigrationRollbackCheckResult,
  REQUIRED_ENVELOPE_CONTRACT_FIELDS,
  validateApiContractSnapshot,
  validateMigrationRollbackMetadata
} from "../apps/api-gateway/src/operations/migration-rollback-check.worker.ts";
import { migrationCandidates } from "../apps/api-gateway/src/operations/operations.fixtures.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";

const readyMigration = migrationCandidates.find((item) => item.id === "mig-add-message-search-index")!;
const blockedMigration = migrationCandidates.find((item) => item.id === "mig-drop-legacy-channel")!;

const baseBeforeSnapshot = {
  envelopeFields: [...REQUIRED_ENVELOPE_CONTRACT_FIELDS],
  migrationId: readyMigration.id,
  openapiPaths: ["/api/v1/dialogs", "/api/v1/reports/exports"],
  responseFieldsByPath: {
    "/api/v1/dialogs": ["service", "operation", "status", "data"],
    "/api/v1/reports/exports": ["service", "operation", "status", "data"]
  },
  schemaVersion: "api-contract-snapshot/v1" as const
};

const baseAfterSnapshot = {
  ...baseBeforeSnapshot,
  openapiPaths: [...baseBeforeSnapshot.openapiPaths, "/api/v1/operations/readiness"]
};

describe("migration rollback-check tooling contracts", () => {
  it("adds rollback-check tooling contracts for migration metadata", () => {
    const metadata = validateMigrationRollbackMetadata(migrationMetadataFromCandidate(readyMigration));
    assert.equal(metadata.id, readyMigration.id);
    assert.equal(metadata.service, "conversation");
    assert.match(metadata.rollbackCommand, /rollback/);
    assert.throws(
      () => validateMigrationRollbackMetadata({ ...metadata, rollbackCommand: "" }),
      /migration_metadata_rollback_command_required/
    );
  });

  it("adds rollback-check tooling contracts for API contract snapshots", () => {
    const snapshot = validateApiContractSnapshot(baseBeforeSnapshot);
    assert.deepEqual(snapshot.openapiPaths, ["/api/v1/dialogs", "/api/v1/reports/exports"]);
    assert.equal(snapshot.envelopeFields.length, REQUIRED_ENVELOPE_CONTRACT_FIELDS.length);
    assert.throws(
      () => validateApiContractSnapshot({ ...baseBeforeSnapshot, openapiPaths: [] }),
      /api_contract_snapshot_openapi_paths_required/
    );
  });

  it("implements compatibility checks for additive migrations", () => {
    const metadata = migrationMetadataFromCandidate(readyMigration);
    const passed = checkAdditiveMigrationCompatibility({
      metadata,
      migrationSql: 'CREATE INDEX "messages_search_idx" ON "conversation_messages" ("tenant_id", "body");'
    });
    const failed = checkAdditiveMigrationCompatibility({
      metadata: migrationMetadataFromCandidate(blockedMigration),
      migrationSql: 'DROP TABLE "legacy_channel_bridge";'
    });
    const rollbackSafe = checkAdditiveMigrationCompatibility({
      metadata,
      migrationSql: 'DROP TABLE "legacy_channel_bridge"; -- rollback-safe'
    });
    const tightenedColumn = checkAdditiveMigrationCompatibility({
      metadata,
      migrationSql: 'ALTER TABLE "conversation_messages" ALTER COLUMN "body" SET NOT NULL;'
    });

    assert.equal(passed.status, "passed");
    assert.equal(failed.status, "failed");
    assert.equal(rollbackSafe.status, "passed");
    assert.equal(tightenedColumn.status, "failed");
    assert.ok(failed.checks.some((check) => check.id === "additive-migration" && check.status === "failed"));
    assert.ok(tightenedColumn.checks.some((check) => check.id === "additive-migration" && check.status === "failed"));
  });

  it("implements compatibility checks for envelope contract diffs", () => {
    const before = validateApiContractSnapshot(baseBeforeSnapshot);
    const after = validateApiContractSnapshot(baseAfterSnapshot);
    const passed = checkEnvelopeContractDiff({ after, before });
    const failed = checkEnvelopeContractDiff({
      after: validateApiContractSnapshot({
        ...baseAfterSnapshot,
        envelopeFields: ["service", "operation", "status", "data"]
      }),
      before
    });

    assert.equal(passed.status, "passed");
    assert.equal(failed.status, "failed");
    assert.ok(failed.checks.some((check) => check.id === "envelope-required-fields"));
  });

  it("implements compatibility checks for OpenAPI contract diffs", () => {
    const before = validateApiContractSnapshot(baseBeforeSnapshot);
    const after = validateApiContractSnapshot(baseAfterSnapshot);
    const passed = checkOpenApiContractDiff({ after, before });
    const failed = checkOpenApiContractDiff({
      after: validateApiContractSnapshot({
        ...baseAfterSnapshot,
        openapiPaths: ["/api/v1/reports/exports"],
        responseFieldsByPath: {
          "/api/v1/reports/exports": ["service", "operation"]
        }
      }),
      before
    });

    assert.equal(passed.status, "passed");
    assert.equal(failed.status, "failed");
    assert.ok(failed.checks.some((check) => check.status === "failed"));
  });

  it("wires release checklist integration", () => {
    const config = parseMigrationRollbackCheckRuntimeConfig({
      MIGRATION_ROLLBACK_CHECK_ENABLED: "true",
      MIGRATION_ROLLBACK_CHECK_SCRIPT: "migration-rollback-check:verify"
    });
    const steps = getMigrationRollbackCheckReleaseChecklistSteps(config);
    const releaseChecklist = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    assert.deepEqual(steps, [{
      name: "Migration rollback-check verification",
      script: "migration-rollback-check:verify"
    }]);
    assert.match(releaseChecklist, /migration-rollback-check:verify/);
    assert.match(packageJson.scripts["migration-rollback-check:verify"], /migration-rollback-check-contracts/);
  });

  it("persists rollback-check result rows", () => {
    const repository = OperationsRepository.inMemory();
    const execution = executeMigrationRollbackCheck({
      afterSnapshot: baseAfterSnapshot,
      beforeSnapshot: baseBeforeSnapshot,
      metadata: migrationMetadataFromCandidate(readyMigration),
      migrationSql: 'CREATE INDEX "messages_search_idx" ON "conversation_messages" ("tenant_id");',
      now: new Date("2026-07-01T13:00:00.000Z"),
      operationsRepository: repository,
      reason: "Validate release rollback policy"
    });
    const saved = persistMigrationRollbackCheckResult(repository, execution.result);
    saved.status = "failed";

    const listed = repository.listMigrationRollbackCheckResults({ migrationId: readyMigration.id });
    assert.equal(listed[0].status, "passed");
    assert.equal(listed[0].toolingResults.length, 3);
    assert.equal(findMigrationRollbackCheckResult(repository, execution.result.id)?.auditEvent.immutable, true);
    assert.equal(execution.toolingResults.every((result) => result.checks.length > 0), true);
  });
});
