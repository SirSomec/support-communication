import { type DeadLetterReplayWorkerResult } from "./dead-letter-replay.worker.js";
import { type BackupDrill, type DeadLetterMessage, type LoadTestScenario, type MigrationCandidate } from "./operations.types.js";
import { type OperationsRepository } from "./operations.repository.js";
import { type LoadTestRunnerRuntimeConfig } from "./load-test-runner.worker.js";
import { executeMigrationRollbackCheckAsync, type ApiContractSnapshot } from "./migration-rollback-check.worker.js";
import { createDeterministicObjectStorageRestoreCheckAdapters, type ObjectStorageRestoreCheckArtifact } from "./object-storage-restore-check.worker.js";
import { type PostgresRestoreCheckCommandPort } from "./postgres-restore-check.worker.js";
export declare const BASELINE_API_CONTRACT_SNAPSHOT: ApiContractSnapshot;
export declare function buildMigrationApiContractSnapshot(migrationId: string): ApiContractSnapshot;
export declare function resolveMigrationRollbackSql(migration: MigrationCandidate): string | undefined;
export declare function runDeadLetterReplayWorker(input: {
    idempotencyKey?: string;
    message: DeadLetterMessage;
    operationsRepository: OperationsRepository;
    reason: string;
}): Promise<DeadLetterReplayWorkerResult>;
export declare function runQueuedLoadTestExecution(input: {
    config?: LoadTestRunnerRuntimeConfig;
    operationsRepository: OperationsRepository;
    runId: string;
    scenario: LoadTestScenario;
    traceId?: string;
}): Promise<Record<string, unknown>>;
export declare function runRestoreDrillWorkers(input: {
    drill: BackupDrill;
    objectStorageAdapters?: ReturnType<typeof createDeterministicObjectStorageRestoreCheckAdapters>;
    objectStorageArtifact?: ObjectStorageRestoreCheckArtifact;
    operationsRepository: OperationsRepository;
    postgresCommandPort?: PostgresRestoreCheckCommandPort;
    reason: string;
    restoreCheckId: string;
}): Promise<Record<string, unknown>>;
export declare function runMigrationRollbackTooling(input: {
    migration: MigrationCandidate;
    migrationSql?: string;
    operationsRepository: OperationsRepository;
    reason: string;
}): Promise<Awaited<ReturnType<typeof executeMigrationRollbackCheckAsync>>>;
