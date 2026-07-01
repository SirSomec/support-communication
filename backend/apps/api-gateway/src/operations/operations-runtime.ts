import { createRequestTraceId } from "@support-communication/observability";
import {
  createUnavailableDeadLetterReplayBackendStore,
  executeDeadLetterReplayWorker,
  type DeadLetterReplayWorkerResult
} from "./dead-letter-replay.worker.js";
import { getOperationsDeadLetterBackendRegistry } from "./operations-dead-letter-backend.registry.js";
import { getLoadTestRunnerRuntimeConfig } from "./bootstrap.js";
import { type BackupDrill, type DeadLetterMessage, type LoadTestScenario, type MigrationCandidate } from "./operations.fixtures.js";
import { type OperationsRepository } from "./operations.repository.js";
import {
  buildLoadTestRunErrorSummary,
  buildLoadTestRunMetrics,
  claimQueuedLoadTestRuns,
  createDeterministicHttpLoadTestRunnerAdapter,
  createDeterministicRealtimeLoadTestRunnerAdapter,
  executeLoadTestOperation,
  persistLoadTestRunErrorSummary,
  persistLoadTestRunMetrics,
  seedLoadTestRunExecution,
  transitionLoadTestRunStatus,
  type LoadTestWorkflow,
  type LoadTestRunnerRuntimeConfig
} from "./load-test-runner.worker.js";
import {
  executeMigrationRollbackCheck,
  migrationMetadataFromCandidate,
  REQUIRED_ENVELOPE_CONTRACT_FIELDS,
  type ApiContractSnapshot
} from "./migration-rollback-check.worker.js";
import {
  createDeterministicObjectStorageRestoreCheckAdapters,
  OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
  verifyObjectStorageRestoreCheckChecksum,
  verifyObjectStorageRestoreCheckExistence,
  verifyObjectStorageRestoreCheckMetadata,
  type ObjectStorageRestoreCheckArtifact
} from "./object-storage-restore-check.worker.js";
import {
  createPostgresRestoreCheckCommandPort,
  executePostgresRestoreCheck,
  type PostgresRestoreCheckCommandPort
} from "./postgres-restore-check.worker.js";

export const BASELINE_API_CONTRACT_SNAPSHOT: ApiContractSnapshot = {
  envelopeFields: [...REQUIRED_ENVELOPE_CONTRACT_FIELDS],
  migrationId: "baseline",
  openapiPaths: [
    "/api/v1/dialogs",
    "/api/v1/operations/dead-letter",
    "/api/v1/operations/load-tests",
    "/api/v1/operations/readiness",
    "/api/v1/reports/exports"
  ],
  responseFieldsByPath: {
    "/api/v1/dialogs": ["data", "error", "meta", "operation", "service", "status"],
    "/api/v1/operations/dead-letter": ["data", "error", "meta", "operation", "service", "status"],
    "/api/v1/operations/load-tests": ["data", "error", "meta", "operation", "service", "status"],
    "/api/v1/operations/readiness": ["data", "error", "meta", "operation", "service", "status"],
    "/api/v1/reports/exports": ["data", "error", "meta", "operation", "service", "status"]
  },
  schemaVersion: "api-contract-snapshot/v1"
};

export function buildMigrationApiContractSnapshot(migrationId: string): ApiContractSnapshot {
  return {
    ...BASELINE_API_CONTRACT_SNAPSHOT,
    migrationId,
    openapiPaths: [...BASELINE_API_CONTRACT_SNAPSHOT.openapiPaths, "/api/v1/operations/migrations"].sort()
  };
}

export function resolveMigrationRollbackSql(migration: MigrationCandidate): string | undefined {
  if (migration.id === "mig-add-message-search-index") {
    return 'CREATE INDEX "messages_search_idx" ON "conversation_messages" ("tenant_id", "body");';
  }

  if (migration.id === "mig-drop-legacy-channel") {
    return 'DROP TABLE "legacy_channel_bridge";';
  }

  return undefined;
}

export async function runDeadLetterReplayWorker(input: {
  idempotencyKey?: string;
  message: DeadLetterMessage;
  operationsRepository: OperationsRepository;
  reason: string;
}): Promise<DeadLetterReplayWorkerResult> {
  const backendStore = getOperationsDeadLetterBackendRegistry().resolveForQueueName(input.message.queueName)
    ?? createUnavailableDeadLetterReplayBackendStore();

  return executeDeadLetterReplayWorker({
    backendStore,
    idempotencyKey: input.idempotencyKey,
    message: input.message,
    operationsRepository: input.operationsRepository,
    reason: input.reason
  });
}

export async function runQueuedLoadTestExecution(input: {
  config?: LoadTestRunnerRuntimeConfig;
  operationsRepository: OperationsRepository;
  runId: string;
  scenario: LoadTestScenario;
  traceId?: string;
}): Promise<Record<string, unknown>> {
  const config = input.config ?? getLoadTestRunnerRuntimeConfig();
  const traceId = input.traceId ?? createRequestTraceId("operationsReadinessService", "queueLoadTestRun");
  seedLoadTestRunExecution({
    operationsRepository: input.operationsRepository,
    runId: input.runId,
    scenarioId: input.scenario.id,
    targetRps: input.scenario.targetRps,
    tenantId: config.tenantId,
    traceId,
    workflows: input.scenario.workflows.slice(0, config.maxOperationsPerRun)
  });

  if (!config.enabled) {
    return {
      enabled: false,
      runId: input.runId,
      status: "queued"
    };
  }

  claimQueuedLoadTestRuns({
    limit: 1,
    operationsRepository: input.operationsRepository
  });

  const execution = input.operationsRepository.findLoadTestRunExecution(input.runId);
  if (!execution) {
    throw new Error(`load_test_run_not_found:${input.runId}`);
  }

  const httpRunner = createDeterministicHttpLoadTestRunnerAdapter();
  const realtimeRunner = createDeterministicRealtimeLoadTestRunnerAdapter();
  const operationResults = [];

  for (const operation of execution.operations.slice(0, config.maxOperationsPerRun)) {
    const descriptor = operation as {
      id?: string;
      method: "GET" | "POST";
      path: string;
      summary: Record<string, unknown>;
      tenantId: string;
      traceId: string;
      transport: "http" | "realtime";
      workflow: string;
    };
    operationResults.push(await executeLoadTestOperation({
      baseUrl: config.baseUrl,
      descriptor: {
        id: String(descriptor.id ?? `${input.runId}:${descriptor.workflow}`),
        method: descriptor.method,
        path: descriptor.path,
        runId: input.runId,
        schemaVersion: "load-test-operation/v1",
        status: "queued",
        summary: descriptor.summary ?? {},
        tenantId: descriptor.tenantId,
        traceId: descriptor.traceId,
        transport: descriptor.transport,
        workflow: descriptor.workflow as LoadTestWorkflow
      },
      httpRunner,
      realtimeRunner
    }));
  }

  const metrics = persistLoadTestRunMetrics(
    input.operationsRepository,
    buildLoadTestRunMetrics({
      operationResults,
      runId: input.runId,
      targetRps: input.scenario.targetRps
    })
  );
  const errorSummary = persistLoadTestRunErrorSummary(
    input.operationsRepository,
    buildLoadTestRunErrorSummary({
      operationResults,
      runId: input.runId
    })
  );
  const finalStatus = metrics.failedOperations > 0 ? "failed" : "completed";
  transitionLoadTestRunStatus(input.operationsRepository, input.runId, finalStatus);

  return {
    enabled: true,
    errorSummary,
    metrics,
    operationResults: operationResults.map((result) => ({
      durationMs: result.durationMs,
      ok: result.ok,
      workflow: result.descriptor.workflow
    })),
    runId: input.runId,
    status: finalStatus
  };
}

export async function runRestoreDrillWorkers(input: {
  drill: BackupDrill;
  objectStorageAdapters?: ReturnType<typeof createDeterministicObjectStorageRestoreCheckAdapters>;
  objectStorageArtifact?: ObjectStorageRestoreCheckArtifact;
  operationsRepository: OperationsRepository;
  postgresCommandPort?: PostgresRestoreCheckCommandPort;
  reason: string;
  restoreCheckId: string;
}): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  if (input.drill.targets.includes("postgres")) {
    const postgres = await executePostgresRestoreCheck({
      auditReason: input.reason,
      commandPort: input.postgresCommandPort ?? createUnconfiguredPostgresRestoreCheckCommandAdapter(),
      drillId: input.drill.id,
      operationsRepository: input.operationsRepository,
      restoreCheckId: input.restoreCheckId,
      targets: input.drill.targets,
      timeoutMs: 5_000
    });
    results.postgres = {
      audit: postgres.audit,
      envelope: postgres.envelope,
      result: postgres.result
    };
  }

  if (input.drill.targets.includes("object-storage-metadata")) {
    const artifact = input.objectStorageArtifact ?? buildRestoreCheckArtifact(input.drill.id, input.restoreCheckId);
    const adapters = input.objectStorageAdapters ?? createFailClosedObjectStorageRestoreCheckAdapters(artifact);
    const request = {
      artifact,
      drillId: input.drill.id,
      restoreCheckId: input.restoreCheckId
    };
    const [existence, checksum, metadata] = await Promise.all([
      verifyObjectStorageRestoreCheckExistence({
        existencePort: adapters.existencePort,
        operationsRepository: input.operationsRepository,
        request
      }),
      verifyObjectStorageRestoreCheckChecksum({
        checksumPort: adapters.checksumPort,
        operationsRepository: input.operationsRepository,
        request
      }),
      verifyObjectStorageRestoreCheckMetadata({
        metadataPort: adapters.metadataPort,
        operationsRepository: input.operationsRepository,
        request
      })
    ]);
    results.objectStorage = { checksum, existence, metadata };
  }

  return results;
}

export function runMigrationRollbackTooling(input: {
  migration: MigrationCandidate;
  migrationSql?: string;
  operationsRepository: OperationsRepository;
  reason: string;
}): ReturnType<typeof executeMigrationRollbackCheck> {
  return executeMigrationRollbackCheck({
    afterSnapshot: buildMigrationApiContractSnapshot(input.migration.id),
    beforeSnapshot: BASELINE_API_CONTRACT_SNAPSHOT,
    metadata: migrationMetadataFromCandidate(input.migration),
    migrationSql: input.migrationSql ?? resolveMigrationRollbackSql(input.migration),
    operationsRepository: input.operationsRepository,
    reason: input.reason
  });
}

function buildRestoreCheckArtifact(drillId: string, restoreCheckId: string): ObjectStorageRestoreCheckArtifact {
  const artifactId = `artifact-${drillId}`;
  return {
    artifactId,
    expectedChecksum: `sha256:${artifactId}`,
    expectedMetadata: {
      backupLabel: drillId,
      contentType: "application/json",
      schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
      sizeBytes: 4096
    },
    signedUrl: `https://storage.example.test/restore/${restoreCheckId}/${artifactId}?X-Amz-Signature=redacted`
  };
}

function createUnconfiguredPostgresRestoreCheckCommandAdapter(): PostgresRestoreCheckCommandPort {
  return createPostgresRestoreCheckCommandPort(async (request) => ({
    command: "postgres_restore_check_unconfigured",
    durationMs: 0,
    ok: false,
    outputSummary: `postgres restore check command is not configured for ${request.drillId}`,
    status: "failed"
  }));
}

function createFailClosedObjectStorageRestoreCheckAdapters(
  artifact: ObjectStorageRestoreCheckArtifact
): ReturnType<typeof createDeterministicObjectStorageRestoreCheckAdapters> {
  return createDeterministicObjectStorageRestoreCheckAdapters({
    artifacts: new Map([
      [artifact.artifactId, {
        checksum: "sha256:object-storage-restore-check-unconfigured",
        exists: false,
        metadata: {
          backupLabel: "object-storage-restore-check-unconfigured",
          contentType: "application/octet-stream",
          schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
          sizeBytes: 0
        }
      }]
    ])
  });
}
