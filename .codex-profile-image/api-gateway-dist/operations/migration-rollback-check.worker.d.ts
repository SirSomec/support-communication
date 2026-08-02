import { type MigrationCandidate } from "./operations.types.js";
import { type OperationsMigrationRollbackCheckResultRecord, type OperationsRepository } from "./operations.repository.js";
export declare const MIGRATION_ROLLBACK_METADATA_SCHEMA_VERSION: "migration-rollback-metadata/v1";
export declare const API_CONTRACT_SNAPSHOT_SCHEMA_VERSION: "api-contract-snapshot/v1";
export declare const REQUIRED_ENVELOPE_CONTRACT_FIELDS: readonly ["data", "error", "meta", "operation", "partial", "service", "states", "status", "traceId", "updatedAt"];
export interface MigrationRollbackMetadata {
    applyCommand: string;
    id: string;
    name: string;
    rollbackCommand: string;
    schemaVersion: typeof MIGRATION_ROLLBACK_METADATA_SCHEMA_VERSION;
    service: string;
    status: MigrationCandidate["status"];
}
export interface ApiContractSnapshot {
    envelopeFields: string[];
    migrationId: string;
    openapiPaths: string[];
    responseFieldsByPath: Record<string, string[]>;
    schemaVersion: typeof API_CONTRACT_SNAPSHOT_SCHEMA_VERSION;
}
export interface MigrationRollbackCompatibilityCheck {
    detail: string;
    id: string;
    name: string;
    status: "failed" | "passed" | "warn";
}
export interface MigrationRollbackCheckToolingResult {
    checks: MigrationRollbackCompatibilityCheck[];
    status: OperationsMigrationRollbackCheckResultRecord["status"];
    tooling: "envelope" | "migration" | "openapi";
}
export interface MigrationRollbackCheckRuntimeConfig {
    enabled: boolean;
    releaseChecklistScript: string;
}
export interface ExecuteMigrationRollbackCheckInput {
    afterSnapshot: ApiContractSnapshot;
    beforeSnapshot: ApiContractSnapshot;
    metadata: MigrationRollbackMetadata;
    migrationSql?: string;
    now?: Date;
    operationsRepository: OperationsRepository;
    reason: string;
}
export interface ExecuteMigrationRollbackCheckResult {
    result: OperationsMigrationRollbackCheckResultRecord;
    toolingResults: MigrationRollbackCheckToolingResult[];
}
export declare function parseMigrationRollbackCheckRuntimeConfig(source?: Record<string, string | undefined>): MigrationRollbackCheckRuntimeConfig;
export declare function getMigrationRollbackCheckReleaseChecklistSteps(config?: MigrationRollbackCheckRuntimeConfig): Array<{
    name: string;
    script: string;
}>;
export declare function validateMigrationRollbackMetadata(metadata: Partial<MigrationRollbackMetadata>): MigrationRollbackMetadata;
export declare function validateApiContractSnapshot(snapshot: Partial<ApiContractSnapshot>): ApiContractSnapshot;
export declare function checkAdditiveMigrationCompatibility(input: {
    metadata: MigrationRollbackMetadata;
    migrationSql?: string;
}): MigrationRollbackCheckToolingResult;
export declare function checkEnvelopeContractDiff(input: {
    after: ApiContractSnapshot;
    before: ApiContractSnapshot;
}): MigrationRollbackCheckToolingResult;
export declare function checkOpenApiContractDiff(input: {
    after: ApiContractSnapshot;
    before: ApiContractSnapshot;
}): MigrationRollbackCheckToolingResult;
export declare function executeMigrationRollbackCheck(input: ExecuteMigrationRollbackCheckInput): ExecuteMigrationRollbackCheckResult;
export declare function executeMigrationRollbackCheckAsync(input: ExecuteMigrationRollbackCheckInput): Promise<ExecuteMigrationRollbackCheckResult>;
export declare function persistMigrationRollbackCheckResult(operationsRepository: OperationsRepository, record: OperationsMigrationRollbackCheckResultRecord): OperationsMigrationRollbackCheckResultRecord;
export declare function persistMigrationRollbackCheckResultAsync(operationsRepository: OperationsRepository, record: OperationsMigrationRollbackCheckResultRecord): Promise<OperationsMigrationRollbackCheckResultRecord>;
export declare function findMigrationRollbackCheckResult(operationsRepository: OperationsRepository, resultId: string): OperationsMigrationRollbackCheckResultRecord | undefined;
export declare function migrationMetadataFromCandidate(candidate: MigrationCandidate): MigrationRollbackMetadata;
