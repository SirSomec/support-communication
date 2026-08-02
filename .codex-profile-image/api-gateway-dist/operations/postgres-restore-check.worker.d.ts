import { type OperationsRepository, type OperationsPostgresRestoreCheckResultRecord } from "./operations.repository.js";
export interface PostgresRestoreCheckCommandRequest {
    drillId: string;
    restoreCheckId: string;
    targets: string[];
    timeoutMs: number;
}
export interface PostgresRestoreCheckCommandResult {
    command: string;
    durationMs: number;
    ok: boolean;
    outputSummary: string;
    status: OperationsPostgresRestoreCheckResultRecord["status"];
}
export interface PostgresRestoreCheckCommandPort {
    execute(request: PostgresRestoreCheckCommandRequest): Promise<PostgresRestoreCheckCommandResult>;
}
export interface PostgresRestoreCheckFailureEnvelope {
    code: string;
    drillId: string;
    message: string;
    restoreCheckId: string;
    sanitized: true;
    status: "failed" | "timed_out";
}
export interface PostgresRestoreCheckAuditDescriptor {
    action: string;
    drillId: string;
    id: string;
    immutable: true;
    reason: string;
    restoreCheckId: string;
    resultId: string;
    status: OperationsPostgresRestoreCheckResultRecord["status"];
    target: string;
}
export interface ExecutePostgresRestoreCheckInput {
    auditReason: string;
    commandPort: PostgresRestoreCheckCommandPort;
    drillId: string;
    now?: Date;
    operationsRepository: OperationsRepository;
    restoreCheckId: string;
    targets: string[];
    timeoutMs: number;
}
export interface ExecutePostgresRestoreCheckResult {
    audit: PostgresRestoreCheckAuditDescriptor;
    envelope: PostgresRestoreCheckFailureEnvelope | null;
    result: OperationsPostgresRestoreCheckResultRecord;
}
export declare function createPostgresRestoreCheckCommandPort(executor: (request: PostgresRestoreCheckCommandRequest) => Promise<PostgresRestoreCheckCommandResult>): PostgresRestoreCheckCommandPort;
export interface DeterministicPostgresRestoreCheckCommandAdapterOptions {
    outcomes?: Map<string, PostgresRestoreCheckCommandResult>;
}
export declare function createDeterministicPostgresRestoreCheckCommandAdapter(options?: DeterministicPostgresRestoreCheckCommandAdapterOptions): PostgresRestoreCheckCommandPort;
export declare function executePostgresRestoreCheck(input: ExecutePostgresRestoreCheckInput): Promise<ExecutePostgresRestoreCheckResult>;
export declare function persistPostgresRestoreCheckResult(operationsRepository: OperationsRepository, record: OperationsPostgresRestoreCheckResultRecord): OperationsPostgresRestoreCheckResultRecord;
export declare function findPostgresRestoreCheckResult(operationsRepository: OperationsRepository, resultId: string): OperationsPostgresRestoreCheckResultRecord | undefined;
export declare function createPostgresRestoreCheckFailureEnvelope(input: {
    drillId: string;
    message: string;
    restoreCheckId: string;
    status: "failed" | "timed_out";
}): PostgresRestoreCheckFailureEnvelope;
export declare function createPostgresRestoreCheckAuditDescriptor(input: {
    drillId: string;
    reason: string;
    restoreCheckId: string;
    resultId: string;
    status: OperationsPostgresRestoreCheckResultRecord["status"];
}): PostgresRestoreCheckAuditDescriptor;
