import type { BackupDrill, DeadLetterMessage, DeadLetterQueue, LoadTestScenario, MigrationCandidate, SecurityControl } from "./operations.types.js";
export interface OperationsIdempotencyRecord {
    fingerprint: string;
    key: string;
    result: Record<string, unknown>;
}
export interface OperationsLoadTestRunRecord {
    auditEvent: Record<string, unknown>;
    reason: string | null;
    run: Record<string, unknown>;
}
export interface OperationsRestoreCheckRecord {
    auditEvent: Record<string, unknown>;
    reason: string | null;
    restoreCheck: Record<string, unknown>;
}
export interface OperationsDeadLetterReplayRecord {
    auditEvent: Record<string, unknown>;
    reason: string | null;
    replay: Record<string, unknown>;
}
export interface OperationsDeadLetterReplayValidationDenialRecord {
    auditEvent: Record<string, unknown>;
    code: string;
    messageId: string;
    queueName: string;
    reason: string | null;
}
export interface OperationsDeadLetterReplayRequeueAuditRecord {
    auditEvent: Record<string, unknown>;
    messageId: string;
    queueName: string;
    reason: string | null;
    replay: Record<string, unknown>;
}
export interface OperationsMigrationRollbackCheckRecord {
    auditEvent: Record<string, unknown>;
    compatibilityChecks: Array<Record<string, unknown>>;
    migrationId: string;
    policy: Record<string, unknown>;
    reason: string | null;
    rollbackPlan: Record<string, unknown>;
}
export interface OperationsMigrationRollbackCheckResultRecord {
    afterSnapshot: {
        envelopeFields: string[];
        migrationId: string;
        openapiPaths: string[];
        responseFieldsByPath: Record<string, string[]>;
        schemaVersion: string;
    };
    auditEvent: Record<string, unknown>;
    beforeSnapshot: {
        envelopeFields: string[];
        migrationId: string;
        openapiPaths: string[];
        responseFieldsByPath: Record<string, string[]>;
        schemaVersion: string;
    };
    checkedAt: string;
    id: string;
    metadata: {
        applyCommand: string;
        id: string;
        name: string;
        rollbackCommand: string;
        schemaVersion: string;
        service: string;
        status: string;
    };
    migrationId: string;
    reason: string;
    status: "failed" | "passed" | "warn";
    toolingResults: Array<{
        checks: Array<{
            detail: string;
            id: string;
            name: string;
            status: string;
        }>;
        status: string;
        tooling: string;
    }>;
}
export interface OperationsLoadTestRunExecutionRecord {
    completedAt: string | null;
    operations: Array<Record<string, unknown>>;
    runId: string;
    scenarioId: string;
    startedAt: string | null;
    status: "queued" | "running" | "completed" | "failed";
    targetRps: number;
    traceId: string;
    updatedAt: string;
}
export interface OperationsLoadTestRunMetricsRecord {
    completedOperations: number;
    failedOperations: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
    latencyP99Ms: number;
    observedRps: number;
    runId: string;
    targetRps: number;
    totalOperations: number;
    workflowBreakdown: Record<string, {
        completed: number;
        failed: number;
        latencyP95Ms: number;
    }>;
}
export interface OperationsLoadTestRunErrorSummaryRecord {
    runId: string;
    sanitized: true;
    topFailures: Array<{
        code: string;
        count: number;
        workflow: string;
    }>;
    totalFailures: number;
}
export interface OperationsPostgresRestoreCheckResultRecord {
    command: string;
    drillId: string;
    durationMs: number;
    executedAt: string;
    id: string;
    outputSummary: string;
    restoreCheckId: string;
    status: "passed" | "failed" | "timed_out";
}
export interface OperationsObjectStorageRestoreCheckExistenceResultRecord {
    artifactId: string;
    drillId: string;
    exists: boolean;
    id: string;
    restoreCheckId: string;
    status: "missing" | "passed";
    verifiedAt: string;
}
export interface OperationsObjectStorageRestoreCheckChecksumResultRecord {
    actualChecksum: string;
    artifactId: string;
    drillId: string;
    expectedChecksum: string;
    id: string;
    restoreCheckId: string;
    status: "mismatch" | "passed";
    verifiedAt: string;
}
export interface OperationsObjectStorageRestoreCheckMetadataResultRecord {
    actualMetadata: {
        backupLabel: string;
        contentType: string;
        schemaVersion: string;
        sizeBytes: number;
    } | null;
    artifactId: string;
    drillId: string;
    expectedMetadata: {
        backupLabel: string;
        contentType: string;
        schemaVersion: string;
        sizeBytes: number;
    };
    id: string;
    restoreCheckId: string;
    status: "mismatch" | "passed";
    verifiedAt: string;
}
export interface OperationsState {
    backupDrills: BackupDrill[];
    deadLetterMessages: DeadLetterMessage[];
    deadLetterQueues: DeadLetterQueue[];
    deadLetterReplayIdempotencyKeys: OperationsIdempotencyRecord[];
    deadLetterReplayRequeueAudits: OperationsDeadLetterReplayRequeueAuditRecord[];
    deadLetterReplayValidationDenials: OperationsDeadLetterReplayValidationDenialRecord[];
    deadLetterReplays: OperationsDeadLetterReplayRecord[];
    loadTestIdempotencyKeys: OperationsIdempotencyRecord[];
    loadTestRunErrorSummaries: OperationsLoadTestRunErrorSummaryRecord[];
    loadTestRunExecutions: OperationsLoadTestRunExecutionRecord[];
    loadTestRunMetrics: OperationsLoadTestRunMetricsRecord[];
    loadTestRuns: OperationsLoadTestRunRecord[];
    loadTestScenarios: LoadTestScenario[];
    migrationCandidates: MigrationCandidate[];
    migrationRollbackCheckResults: OperationsMigrationRollbackCheckResultRecord[];
    migrationRollbackChecks: OperationsMigrationRollbackCheckRecord[];
    objectStorageRestoreCheckChecksumResults: OperationsObjectStorageRestoreCheckChecksumResultRecord[];
    objectStorageRestoreCheckExistenceResults: OperationsObjectStorageRestoreCheckExistenceResultRecord[];
    objectStorageRestoreCheckMetadataResults: OperationsObjectStorageRestoreCheckMetadataResultRecord[];
    postgresRestoreCheckResults: OperationsPostgresRestoreCheckResultRecord[];
    restoreCheckIdempotencyKeys: OperationsIdempotencyRecord[];
    restoreChecks: OperationsRestoreCheckRecord[];
    securityControls: SecurityControl[];
}
export interface PrismaOperationsClient {
    operationsObjectStorageRestoreCheckResult: PrismaOperationsObjectStorageRestoreCheckResultDelegate;
    operationsPostgresRestoreCheckResult: PrismaOperationsPostgresRestoreCheckResultDelegate;
    operationsRuntimeRecord: PrismaOperationsRuntimeRecordDelegate;
}
interface PrismaOperationsRuntimeRecordDelegate {
    findMany(input?: PrismaOperationsRuntimeRecordFindManyInput): Promise<PrismaOperationsRuntimeRecordRow[]>;
    findUnique(input: PrismaOperationsRuntimeRecordFindUniqueInput): Promise<PrismaOperationsRuntimeRecordRow | null>;
    upsert(input: PrismaOperationsRuntimeRecordUpsertInput): Promise<PrismaOperationsRuntimeRecordRow>;
}
interface PrismaOperationsPostgresRestoreCheckResultDelegate {
    findMany(input?: PrismaOperationsPostgresRestoreCheckResultFindManyInput): Promise<PrismaOperationsPostgresRestoreCheckResultRow[]>;
    findUnique(input: {
        where: {
            id: string;
        };
    }): Promise<PrismaOperationsPostgresRestoreCheckResultRow | null>;
    upsert(input: PrismaOperationsPostgresRestoreCheckResultUpsertInput): Promise<PrismaOperationsPostgresRestoreCheckResultRow>;
}
interface PrismaOperationsObjectStorageRestoreCheckResultDelegate {
    findMany(input?: PrismaOperationsObjectStorageRestoreCheckResultFindManyInput): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow[]>;
    findUnique(input: {
        where: {
            id: string;
        };
    }): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow | null>;
    upsert(input: PrismaOperationsObjectStorageRestoreCheckResultUpsertInput): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow>;
}
interface PrismaOperationsRuntimeRecordFindManyInput {
    orderBy?: {
        updatedAt: "desc";
    };
    where?: {
        collection?: string;
        entityKey?: string;
        filterKey?: string;
    };
}
interface PrismaOperationsRuntimeRecordFindUniqueInput {
    where: {
        collection_entityKey: {
            collection: string;
            entityKey: string;
        };
    };
}
interface PrismaOperationsRuntimeRecordUpsertInput extends PrismaOperationsRuntimeRecordFindUniqueInput {
    create: PrismaOperationsRuntimeRecordCreateInput;
    update: PrismaOperationsRuntimeRecordUpdateInput;
}
interface PrismaOperationsRuntimeRecordCreateInput {
    collection: string;
    createdAt: Date;
    entityKey: string;
    filterKey: string | null;
    id: string;
    record: unknown;
    updatedAt: Date;
}
type PrismaOperationsRuntimeRecordUpdateInput = Partial<Omit<PrismaOperationsRuntimeRecordCreateInput, "collection" | "createdAt" | "entityKey" | "id">>;
interface PrismaOperationsRuntimeRecordRow extends PrismaOperationsRuntimeRecordCreateInput {
}
interface PrismaOperationsPostgresRestoreCheckResultFindManyInput {
    orderBy?: {
        executedAt: "desc";
    };
    where?: {
        drillId?: string;
        restoreCheckId?: string;
    };
}
interface PrismaOperationsPostgresRestoreCheckResultUpsertInput {
    create: PrismaOperationsPostgresRestoreCheckResultCreateInput;
    update: PrismaOperationsPostgresRestoreCheckResultUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaOperationsPostgresRestoreCheckResultCreateInput {
    command: string;
    createdAt?: Date;
    drillId: string;
    durationMs: number;
    executedAt: Date;
    id: string;
    outputSummary: string;
    restoreCheckId: string;
    status: string;
}
type PrismaOperationsPostgresRestoreCheckResultUpdateInput = Partial<Omit<PrismaOperationsPostgresRestoreCheckResultCreateInput, "createdAt" | "id">>;
interface PrismaOperationsPostgresRestoreCheckResultRow extends Omit<PrismaOperationsPostgresRestoreCheckResultCreateInput, "createdAt" | "executedAt"> {
    createdAt: Date | string;
    executedAt: Date | string;
}
interface PrismaOperationsObjectStorageRestoreCheckResultFindManyInput {
    orderBy?: {
        verifiedAt: "desc";
    };
    where?: {
        artifactId?: string;
        checkKind?: string;
        drillId?: string;
        restoreCheckId?: string;
    };
}
interface PrismaOperationsObjectStorageRestoreCheckResultUpsertInput {
    create: PrismaOperationsObjectStorageRestoreCheckResultCreateInput;
    update: PrismaOperationsObjectStorageRestoreCheckResultUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaOperationsObjectStorageRestoreCheckResultCreateInput {
    artifactId: string;
    checkKind: string;
    createdAt?: Date;
    detail: unknown;
    drillId: string;
    id: string;
    restoreCheckId: string;
    status: string;
    verifiedAt: Date;
}
type PrismaOperationsObjectStorageRestoreCheckResultUpdateInput = Partial<Omit<PrismaOperationsObjectStorageRestoreCheckResultCreateInput, "createdAt" | "id">>;
interface PrismaOperationsObjectStorageRestoreCheckResultRow extends Omit<PrismaOperationsObjectStorageRestoreCheckResultCreateInput, "createdAt" | "verifiedAt"> {
    createdAt: Date | string;
    verifiedAt: Date | string;
}
export declare class OperationsRepository {
    private readonly store;
    private readonly prismaClient?;
    private constructor();
    static default(): OperationsRepository;
    static useDefault(repository: OperationsRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: OperationsState): OperationsRepository;
    static prisma({ client, seed }: {
        client: PrismaOperationsClient;
        seed?: OperationsState;
    }): OperationsRepository;
    readState(): OperationsState;
    readStateAsync(): Promise<OperationsState>;
    listLoadTestScenarios(): LoadTestScenario[];
    listBackupDrills(): BackupDrill[];
    listDeadLetterQueues(): DeadLetterQueue[];
    listDeadLetterMessages(): DeadLetterMessage[];
    listMigrationCandidates(): MigrationCandidate[];
    listSecurityControls(): SecurityControl[];
    findLoadTestIdempotencyKeyAsync(key: string): Promise<OperationsIdempotencyRecord | undefined>;
    saveLoadTestIdempotencyKeyAsync(record: OperationsIdempotencyRecord): Promise<OperationsIdempotencyRecord>;
    saveLoadTestRunAsync(record: OperationsLoadTestRunRecord): Promise<OperationsLoadTestRunRecord>;
    findRestoreCheckIdempotencyKeyAsync(key: string): Promise<OperationsIdempotencyRecord | undefined>;
    saveRestoreCheckIdempotencyKeyAsync(record: OperationsIdempotencyRecord): Promise<OperationsIdempotencyRecord>;
    saveRestoreCheckAsync(record: OperationsRestoreCheckRecord): Promise<OperationsRestoreCheckRecord>;
    findDeadLetterReplayIdempotencyKeyAsync(key: string): Promise<OperationsIdempotencyRecord | undefined>;
    saveDeadLetterReplayIdempotencyKeyAsync(record: OperationsIdempotencyRecord): Promise<OperationsIdempotencyRecord>;
    findDeadLetterReplayAsync(replayId: string): Promise<OperationsDeadLetterReplayRecord | undefined>;
    saveDeadLetterReplayAsync(record: OperationsDeadLetterReplayRecord): Promise<OperationsDeadLetterReplayRecord>;
    saveDeadLetterReplayValidationDenialAsync(record: OperationsDeadLetterReplayValidationDenialRecord): Promise<OperationsDeadLetterReplayValidationDenialRecord>;
    listDeadLetterReplayValidationDenialsAsync(filters?: {
        messageId?: string;
    }): Promise<OperationsDeadLetterReplayValidationDenialRecord[]>;
    saveDeadLetterReplayRequeueAuditAsync(record: OperationsDeadLetterReplayRequeueAuditRecord): Promise<OperationsDeadLetterReplayRequeueAuditRecord>;
    listDeadLetterReplayRequeueAuditsAsync(filters?: {
        messageId?: string;
    }): Promise<OperationsDeadLetterReplayRequeueAuditRecord[]>;
    saveMigrationRollbackCheckAsync(record: OperationsMigrationRollbackCheckRecord): Promise<OperationsMigrationRollbackCheckRecord>;
    findMigrationRollbackCheckResultAsync(resultId: string): Promise<OperationsMigrationRollbackCheckResultRecord | undefined>;
    listMigrationRollbackCheckResultsAsync(filters?: {
        migrationId?: string;
    }): Promise<OperationsMigrationRollbackCheckResultRecord[]>;
    saveMigrationRollbackCheckResultAsync(record: OperationsMigrationRollbackCheckResultRecord): Promise<OperationsMigrationRollbackCheckResultRecord>;
    listLoadTestRunExecutionsAsync(filters?: {
        status?: OperationsLoadTestRunExecutionRecord["status"];
    }): Promise<OperationsLoadTestRunExecutionRecord[]>;
    findLoadTestRunExecutionAsync(runId: string): Promise<OperationsLoadTestRunExecutionRecord | undefined>;
    saveLoadTestRunExecutionAsync(record: OperationsLoadTestRunExecutionRecord): Promise<OperationsLoadTestRunExecutionRecord>;
    findLoadTestRunMetricsAsync(runId: string): Promise<OperationsLoadTestRunMetricsRecord | undefined>;
    saveLoadTestRunMetricsAsync(record: OperationsLoadTestRunMetricsRecord): Promise<OperationsLoadTestRunMetricsRecord>;
    findLoadTestRunErrorSummaryAsync(runId: string): Promise<OperationsLoadTestRunErrorSummaryRecord | undefined>;
    saveLoadTestRunErrorSummaryAsync(record: OperationsLoadTestRunErrorSummaryRecord): Promise<OperationsLoadTestRunErrorSummaryRecord>;
    findPostgresRestoreCheckResultAsync(resultId: string): Promise<OperationsPostgresRestoreCheckResultRecord | undefined>;
    listPostgresRestoreCheckResultsAsync(filters?: {
        drillId?: string;
        restoreCheckId?: string;
    }): Promise<OperationsPostgresRestoreCheckResultRecord[]>;
    savePostgresRestoreCheckResultAsync(record: OperationsPostgresRestoreCheckResultRecord): Promise<OperationsPostgresRestoreCheckResultRecord>;
    listObjectStorageRestoreCheckExistenceResultsAsync(filters?: {
        artifactId?: string;
        drillId?: string;
    }): Promise<OperationsObjectStorageRestoreCheckExistenceResultRecord[]>;
    saveObjectStorageRestoreCheckExistenceResultAsync(record: OperationsObjectStorageRestoreCheckExistenceResultRecord): Promise<OperationsObjectStorageRestoreCheckExistenceResultRecord>;
    listObjectStorageRestoreCheckChecksumResultsAsync(filters?: {
        artifactId?: string;
        drillId?: string;
    }): Promise<OperationsObjectStorageRestoreCheckChecksumResultRecord[]>;
    saveObjectStorageRestoreCheckChecksumResultAsync(record: OperationsObjectStorageRestoreCheckChecksumResultRecord): Promise<OperationsObjectStorageRestoreCheckChecksumResultRecord>;
    listObjectStorageRestoreCheckMetadataResultsAsync(filters?: {
        artifactId?: string;
        drillId?: string;
    }): Promise<OperationsObjectStorageRestoreCheckMetadataResultRecord[]>;
    saveObjectStorageRestoreCheckMetadataResultAsync(record: OperationsObjectStorageRestoreCheckMetadataResultRecord): Promise<OperationsObjectStorageRestoreCheckMetadataResultRecord>;
    findLoadTestIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined;
    saveLoadTestIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord;
    saveLoadTestRun(record: OperationsLoadTestRunRecord): OperationsLoadTestRunRecord;
    findRestoreCheckIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined;
    saveRestoreCheckIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord;
    saveRestoreCheck(record: OperationsRestoreCheckRecord): OperationsRestoreCheckRecord;
    findDeadLetterReplayIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined;
    saveDeadLetterReplayIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord;
    saveDeadLetterReplay(record: OperationsDeadLetterReplayRecord): OperationsDeadLetterReplayRecord;
    saveDeadLetterReplayValidationDenial(record: OperationsDeadLetterReplayValidationDenialRecord): OperationsDeadLetterReplayValidationDenialRecord;
    listDeadLetterReplayValidationDenials(filters?: {
        messageId?: string;
    }): OperationsDeadLetterReplayValidationDenialRecord[];
    saveDeadLetterReplayRequeueAudit(record: OperationsDeadLetterReplayRequeueAuditRecord): OperationsDeadLetterReplayRequeueAuditRecord;
    listDeadLetterReplayRequeueAudits(filters?: {
        messageId?: string;
    }): OperationsDeadLetterReplayRequeueAuditRecord[];
    saveMigrationRollbackCheck(record: OperationsMigrationRollbackCheckRecord): OperationsMigrationRollbackCheckRecord;
    findMigrationRollbackCheckResult(resultId: string): OperationsMigrationRollbackCheckResultRecord | undefined;
    listMigrationRollbackCheckResults(filters?: {
        migrationId?: string;
    }): OperationsMigrationRollbackCheckResultRecord[];
    saveMigrationRollbackCheckResult(record: OperationsMigrationRollbackCheckResultRecord): OperationsMigrationRollbackCheckResultRecord;
    listLoadTestRunExecutions(filters?: {
        status?: OperationsLoadTestRunExecutionRecord["status"];
    }): OperationsLoadTestRunExecutionRecord[];
    findLoadTestRunExecution(runId: string): OperationsLoadTestRunExecutionRecord | undefined;
    saveLoadTestRunExecution(record: OperationsLoadTestRunExecutionRecord): OperationsLoadTestRunExecutionRecord;
    findLoadTestRunMetrics(runId: string): OperationsLoadTestRunMetricsRecord | undefined;
    saveLoadTestRunMetrics(record: OperationsLoadTestRunMetricsRecord): OperationsLoadTestRunMetricsRecord;
    findLoadTestRunErrorSummary(runId: string): OperationsLoadTestRunErrorSummaryRecord | undefined;
    saveLoadTestRunErrorSummary(record: OperationsLoadTestRunErrorSummaryRecord): OperationsLoadTestRunErrorSummaryRecord;
    findPostgresRestoreCheckResult(resultId: string): OperationsPostgresRestoreCheckResultRecord | undefined;
    listPostgresRestoreCheckResults(filters?: {
        drillId?: string;
        restoreCheckId?: string;
    }): OperationsPostgresRestoreCheckResultRecord[];
    savePostgresRestoreCheckResult(record: OperationsPostgresRestoreCheckResultRecord): OperationsPostgresRestoreCheckResultRecord;
    listObjectStorageRestoreCheckExistenceResults(filters?: {
        artifactId?: string;
        drillId?: string;
    }): OperationsObjectStorageRestoreCheckExistenceResultRecord[];
    saveObjectStorageRestoreCheckExistenceResult(record: OperationsObjectStorageRestoreCheckExistenceResultRecord): OperationsObjectStorageRestoreCheckExistenceResultRecord;
    listObjectStorageRestoreCheckChecksumResults(filters?: {
        artifactId?: string;
        drillId?: string;
    }): OperationsObjectStorageRestoreCheckChecksumResultRecord[];
    saveObjectStorageRestoreCheckChecksumResult(record: OperationsObjectStorageRestoreCheckChecksumResultRecord): OperationsObjectStorageRestoreCheckChecksumResultRecord;
    listObjectStorageRestoreCheckMetadataResults(filters?: {
        artifactId?: string;
        drillId?: string;
    }): OperationsObjectStorageRestoreCheckMetadataResultRecord[];
    saveObjectStorageRestoreCheckMetadataResult(record: OperationsObjectStorageRestoreCheckMetadataResultRecord): OperationsObjectStorageRestoreCheckMetadataResultRecord;
    private readCatalogState;
    private assertSyncRuntimeAvailable;
    private findRuntimeRecord;
    private listRuntimeRecords;
    private saveRuntimeRecord;
    private saveRuntimeRecordSynchronously;
    private saveIdempotencyKeyAsync;
    private listObjectStorageRestoreCheckRows;
    private saveObjectStorageRestoreCheckRow;
    private saveObjectStorageRestoreCheckResult;
    private saveIdempotencyKey;
}
export declare function createEmptyOperationsState(): OperationsState;
export {};
