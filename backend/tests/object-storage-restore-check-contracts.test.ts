import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createChecksumMismatchDenialEnvelope,
  createDeterministicObjectStorageRestoreCheckAdapters,
  createMetadataMismatchDenialEnvelope,
  createMissingArtifactDenialEnvelope,
  createObjectStorageRestoreCheckChecksumPort,
  createObjectStorageRestoreCheckExistencePort,
  createObjectStorageRestoreCheckMetadataPort,
  fingerprintObjectStorageRestoreCheckArtifact,
  OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
  persistObjectStorageRestoreCheckChecksumResult,
  persistObjectStorageRestoreCheckExistenceResult,
  persistObjectStorageRestoreCheckMetadataResult,
  verifyObjectStorageRestoreCheckChecksum,
  verifyObjectStorageRestoreCheckExistence,
  verifyObjectStorageRestoreCheckMetadata
} from "../apps/api-gateway/src/operations/object-storage-restore-check.worker.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";

const baseArtifact = {
  artifactId: "artifact-backup-postgres-nightly",
  expectedChecksum: "sha256:artifact-backup-postgres-nightly",
  expectedMetadata: {
    backupLabel: "backup-postgres-nightly",
    contentType: "application/json",
    schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
    sizeBytes: 4096
  },
  signedUrl: "https://storage.example.test/restore/artifact-backup-postgres-nightly?X-Amz-Signature=super-secret"
};

const baseRequest = {
  artifact: baseArtifact,
  drillId: "backup-postgres-nightly",
  restoreCheckId: "restore_check_object_storage_001"
};

describe("object-storage restore-check worker contracts", () => {
  it("defines object-storage restore-check artifact existence contracts", async () => {
    const repository = OperationsRepository.inMemory();
    const { existencePort } = createDeterministicObjectStorageRestoreCheckAdapters();
    const verification = await verifyObjectStorageRestoreCheckExistence({
      existencePort,
      now: new Date("2026-07-01T11:00:00.000Z"),
      operationsRepository: repository,
      request: baseRequest
    });

    assert.equal(verification.result.status, "passed");
    assert.equal(verification.result.exists, true);
    assert.equal(verification.denial, null);
    assert.equal(repository.listObjectStorageRestoreCheckExistenceResults({ artifactId: baseArtifact.artifactId }).length, 1);
  });

  it("defines object-storage restore-check artifact checksum contracts", async () => {
    const repository = OperationsRepository.inMemory();
    const { checksumPort } = createDeterministicObjectStorageRestoreCheckAdapters();
    const verification = await verifyObjectStorageRestoreCheckChecksum({
      checksumPort,
      operationsRepository: repository,
      request: baseRequest
    });

    assert.equal(verification.result.status, "passed");
    assert.equal(verification.result.expectedChecksum, baseArtifact.expectedChecksum);
    assert.equal(verification.result.actualChecksum, baseArtifact.expectedChecksum);
    assert.equal(verification.denial, null);
  });

  it("defines object-storage restore-check metadata shape contracts", async () => {
    const repository = OperationsRepository.inMemory();
    const { metadataPort } = createDeterministicObjectStorageRestoreCheckAdapters();
    const verification = await verifyObjectStorageRestoreCheckMetadata({
      metadataPort,
      operationsRepository: repository,
      request: baseRequest
    });

    assert.equal(verification.result.status, "passed");
    assert.equal(verification.result.expectedMetadata.backupLabel, "backup-postgres-nightly");
    assert.equal(verification.result.expectedMetadata.schemaVersion, OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION);
    assert.equal(verification.denial, null);
  });

  it("implements signed artifact existence verification adapter", async () => {
    const port = createObjectStorageRestoreCheckExistencePort(async () => ({
      exists: true,
      ok: true,
      status: "passed"
    }));

    const result = await port.verify(baseRequest);
    assert.equal(result.exists, true);
    assert.equal(result.status, "passed");
  });

  it("implements signed artifact checksum verification adapter", async () => {
    const port = createObjectStorageRestoreCheckChecksumPort(async () => ({
      actualChecksum: "sha256:expected",
      expectedChecksum: "sha256:expected",
      ok: true,
      status: "passed"
    }));

    const result = await port.verify(baseRequest);
    assert.equal(result.actualChecksum, "sha256:expected");
    assert.equal(result.status, "passed");
  });

  it("implements signed artifact metadata verification adapter", async () => {
    const port = createObjectStorageRestoreCheckMetadataPort(async () => ({
      actualMetadata: baseArtifact.expectedMetadata!,
      expectedMetadata: baseArtifact.expectedMetadata!,
      ok: true,
      status: "passed"
    }));

    const result = await port.verify(baseRequest);
    assert.equal(result.actualMetadata?.backupLabel, "backup-postgres-nightly");
    assert.equal(result.status, "passed");
  });

  it("persists object-storage restore-check existence results", () => {
    const repository = OperationsRepository.inMemory();
    const saved = persistObjectStorageRestoreCheckExistenceResult(repository, {
      artifactId: baseArtifact.artifactId,
      drillId: baseRequest.drillId,
      exists: true,
      id: "object_storage_existence_result_001",
      restoreCheckId: baseRequest.restoreCheckId,
      status: "passed",
      verifiedAt: "2026-07-01T11:00:00.000Z"
    });
    saved.exists = false;

    const listed = repository.listObjectStorageRestoreCheckExistenceResults({ drillId: baseRequest.drillId });
    assert.equal(listed[0].exists, true);
    assert.equal(listed[0].status, "passed");
  });

  it("persists object-storage restore-check checksum results", () => {
    const repository = OperationsRepository.inMemory();
    const saved = persistObjectStorageRestoreCheckChecksumResult(repository, {
      actualChecksum: "sha256:actual",
      artifactId: baseArtifact.artifactId,
      drillId: baseRequest.drillId,
      expectedChecksum: "sha256:expected",
      id: "object_storage_checksum_result_001",
      restoreCheckId: baseRequest.restoreCheckId,
      status: "mismatch",
      verifiedAt: "2026-07-01T11:00:00.000Z"
    });
    saved.actualChecksum = "mutated";

    const listed = repository.listObjectStorageRestoreCheckChecksumResults({ artifactId: baseArtifact.artifactId });
    assert.equal(listed[0].actualChecksum, "sha256:actual");
    assert.equal(listed[0].status, "mismatch");
  });

  it("persists object-storage restore-check metadata results", () => {
    const repository = OperationsRepository.inMemory();
    const saved = persistObjectStorageRestoreCheckMetadataResult(repository, {
      actualMetadata: {
        backupLabel: "backup-audit-ledger",
        contentType: "application/json",
        schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
        sizeBytes: 2048
      },
      artifactId: baseArtifact.artifactId,
      drillId: baseRequest.drillId,
      expectedMetadata: baseArtifact.expectedMetadata!,
      id: "object_storage_metadata_result_001",
      restoreCheckId: baseRequest.restoreCheckId,
      status: "mismatch",
      verifiedAt: "2026-07-01T11:00:00.000Z"
    });
    saved.actualMetadata = null;

    const listed = repository.listObjectStorageRestoreCheckMetadataResults({ restoreCheckId: baseRequest.restoreCheckId });
    assert.equal(listed[0].actualMetadata?.backupLabel, "backup-audit-ledger");
    assert.equal(listed[0].status, "mismatch");
  });

  it("adds denial envelopes for missing restore-check artifacts", async () => {
    const repository = OperationsRepository.inMemory();
    const { existencePort } = createDeterministicObjectStorageRestoreCheckAdapters({
      artifacts: new Map([
        [baseArtifact.artifactId, { exists: false }]
      ])
    });
    const verification = await verifyObjectStorageRestoreCheckExistence({
      existencePort,
      operationsRepository: repository,
      request: baseRequest
    });
    const denial = createMissingArtifactDenialEnvelope({
      artifactId: baseArtifact.artifactId,
      drillId: baseRequest.drillId,
      restoreCheckId: baseRequest.restoreCheckId,
      signedUrl: baseArtifact.signedUrl
    });

    assert.equal(verification.result.status, "missing");
    assert.equal(verification.denial?.code, "object_storage_restore_check_artifact_missing");
    assert.equal(verification.denial?.sanitized, true);
    assert.match(verification.denial?.message ?? "", /\[REDACTED:secret\]/);
    assert.doesNotMatch(verification.denial?.message ?? "", /super-secret/);
    assert.equal(denial.sanitized, true);
  });

  it("adds denial envelopes for mismatched restore-check artifact checksums", async () => {
    const repository = OperationsRepository.inMemory();
    const { checksumPort } = createDeterministicObjectStorageRestoreCheckAdapters({
      artifacts: new Map([
        [baseArtifact.artifactId, { checksum: "sha256:actual-mismatch" }]
      ])
    });
    const verification = await verifyObjectStorageRestoreCheckChecksum({
      checksumPort,
      operationsRepository: repository,
      request: baseRequest
    });
    const denial = createChecksumMismatchDenialEnvelope({
      actualChecksum: "sha256:actual-mismatch",
      artifactId: baseArtifact.artifactId,
      drillId: baseRequest.drillId,
      expectedChecksum: baseArtifact.expectedChecksum!,
      restoreCheckId: baseRequest.restoreCheckId
    });

    assert.equal(verification.result.status, "mismatch");
    assert.equal(verification.denial?.code, "object_storage_restore_check_checksum_mismatch");
    assert.match(verification.denial?.message ?? "", /sha256:actual-mismatch/);
    assert.equal(denial.code, "object_storage_restore_check_checksum_mismatch");
  });

  it("adds denial envelopes for mismatched restore-check artifact metadata", async () => {
    const repository = OperationsRepository.inMemory();
    const { metadataPort } = createDeterministicObjectStorageRestoreCheckAdapters({
      artifacts: new Map([
        [baseArtifact.artifactId, {
          metadata: {
            backupLabel: "backup-audit-ledger",
            contentType: "application/json",
            schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
            sizeBytes: 4096
          }
        }]
      ])
    });
    const verification = await verifyObjectStorageRestoreCheckMetadata({
      metadataPort,
      operationsRepository: repository,
      request: baseRequest
    });
    const denial = createMetadataMismatchDenialEnvelope({
      actualMetadata: {
        backupLabel: "backup-audit-ledger",
        contentType: "application/json",
        schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
        sizeBytes: 4096
      },
      artifactId: baseArtifact.artifactId,
      drillId: baseRequest.drillId,
      expectedMetadata: baseArtifact.expectedMetadata!,
      restoreCheckId: baseRequest.restoreCheckId
    });

    assert.equal(verification.result.status, "mismatch");
    assert.equal(verification.denial?.code, "object_storage_restore_check_metadata_mismatch");
    assert.match(verification.denial?.message ?? "", /backup-audit-ledger/);
    assert.equal(denial.sanitized, true);
  });

  it("documents Prisma object-storage restore-check schema, migration and ownership coverage", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(
      new URL("../prisma/migrations/202607010008_operations_object_storage_restore_check_results/migration.sql", import.meta.url),
      "utf8"
    );
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model OperationsObjectStorageRestoreCheckResult/);
    assert.match(migration, /operations_object_storage_restore_check_results/);
    assert.match(ownershipMap, /operations_object_storage_restore_check_results/);
    assert.match(ownershipMap, /`api-gateway`/);
  });

  it("fingerprints restore-check artifacts without embedding signed query secrets", () => {
    const fingerprint = fingerprintObjectStorageRestoreCheckArtifact(baseArtifact);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(fingerprint, /super-secret/);
  });
});
