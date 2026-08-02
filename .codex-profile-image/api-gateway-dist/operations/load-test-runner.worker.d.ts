import { type OperationsRepository } from "./operations.repository.js";
import { type OperationsLoadTestRunExecutionRecord, type OperationsLoadTestRunMetricsRecord, type OperationsLoadTestRunErrorSummaryRecord } from "./operations.repository.js";
export declare const LOAD_TEST_OPERATION_SCHEMA_VERSION: "load-test-operation/v1";
export type LoadTestWorkflow = "dead-letter-replay" | "dialogs" | "message-send" | "webhook-delivery" | "report-export" | "realtime-fanout";
export interface LoadTestOperationDescriptor {
    id: string;
    method: "GET" | "POST";
    path: string;
    runId: string;
    schemaVersion: typeof LOAD_TEST_OPERATION_SCHEMA_VERSION;
    status: "queued" | "running" | "completed" | "failed";
    summary: Record<string, unknown>;
    tenantId: string;
    traceId: string;
    transport: "http" | "realtime";
    workflow: LoadTestWorkflow;
}
export interface LoadTestHttpRunnerRequest {
    baseUrl: string;
    descriptor: LoadTestOperationDescriptor;
}
export interface LoadTestHttpRunnerResult {
    durationMs: number;
    ok: boolean;
    statusCode: number;
}
export interface LoadTestHttpRunnerPort {
    execute(request: LoadTestHttpRunnerRequest): Promise<LoadTestHttpRunnerResult>;
}
export interface LoadTestRealtimeRunnerRequest {
    descriptor: LoadTestOperationDescriptor;
}
export interface LoadTestRealtimeRunnerResult {
    deliveredEvents: number;
    durationMs: number;
    ok: boolean;
}
export interface LoadTestRealtimeRunnerPort {
    execute(request: LoadTestRealtimeRunnerRequest): Promise<LoadTestRealtimeRunnerResult>;
}
export interface LoadTestRunnerRuntimeConfig {
    baseUrl: string;
    enabled: boolean;
    maxOperationsPerRun: number;
    tenantId: string;
    timeoutMs: number;
}
export interface LoadTestRunnerFailureEnvelope {
    code: string;
    message: string;
    operation: string;
    sanitized: true;
    traceId: string;
}
export interface PlanLoadTestOperationDescriptorsInput {
    runId: string;
    tenantId: string;
    traceId: string;
    workflows: string[];
}
export interface ExecuteLoadTestOperationInput {
    baseUrl: string;
    descriptor: LoadTestOperationDescriptor;
    httpRunner: LoadTestHttpRunnerPort;
    realtimeRunner: LoadTestRealtimeRunnerPort;
}
export interface ExecuteLoadTestOperationResult {
    descriptor: LoadTestOperationDescriptor;
    durationMs: number;
    errorCode: string | null;
    ok: boolean;
}
export interface ClaimQueuedLoadTestRunsInput {
    limit?: number;
    now?: Date;
    operationsRepository: OperationsRepository;
}
export interface ClaimQueuedLoadTestRunsResult {
    claimed: OperationsLoadTestRunExecutionRecord[];
}
export declare function parseLoadTestRunnerRuntimeConfig(source?: Record<string, string | undefined>): LoadTestRunnerRuntimeConfig;
export declare function planLoadTestOperationDescriptor(input: {
    runId: string;
    tenantId: string;
    traceId: string;
    workflow: string;
}): LoadTestOperationDescriptor;
export declare function planLoadTestOperationDescriptors(input: PlanLoadTestOperationDescriptorsInput): LoadTestOperationDescriptor[];
export declare function claimQueuedLoadTestRuns(input: ClaimQueuedLoadTestRunsInput): ClaimQueuedLoadTestRunsResult;
export declare function claimQueuedLoadTestRunsAsync(input: ClaimQueuedLoadTestRunsInput): Promise<ClaimQueuedLoadTestRunsResult>;
export declare function executeLoadTestOperation(input: ExecuteLoadTestOperationInput): Promise<ExecuteLoadTestOperationResult>;
export declare function transitionLoadTestRunStatus(operationsRepository: OperationsRepository, runId: string, status: OperationsLoadTestRunExecutionRecord["status"], now?: Date): OperationsLoadTestRunExecutionRecord;
export declare function transitionLoadTestRunStatusAsync(operationsRepository: OperationsRepository, runId: string, status: OperationsLoadTestRunExecutionRecord["status"], now?: Date): Promise<OperationsLoadTestRunExecutionRecord>;
export declare function persistLoadTestRunMetrics(operationsRepository: OperationsRepository, metrics: OperationsLoadTestRunMetricsRecord): OperationsLoadTestRunMetricsRecord;
export declare function persistLoadTestRunMetricsAsync(operationsRepository: OperationsRepository, metrics: OperationsLoadTestRunMetricsRecord): Promise<OperationsLoadTestRunMetricsRecord>;
export declare function persistLoadTestRunErrorSummary(operationsRepository: OperationsRepository, errorSummary: OperationsLoadTestRunErrorSummaryRecord): OperationsLoadTestRunErrorSummaryRecord;
export declare function persistLoadTestRunErrorSummaryAsync(operationsRepository: OperationsRepository, errorSummary: OperationsLoadTestRunErrorSummaryRecord): Promise<OperationsLoadTestRunErrorSummaryRecord>;
export declare function getLoadTestRunStatus(operationsRepository: OperationsRepository, runId: string): OperationsLoadTestRunExecutionRecord | undefined;
export declare function getLoadTestRunMetrics(operationsRepository: OperationsRepository, runId: string): OperationsLoadTestRunMetricsRecord | undefined;
export declare function getLoadTestRunErrorSummary(operationsRepository: OperationsRepository, runId: string): OperationsLoadTestRunErrorSummaryRecord | undefined;
export declare function createLoadTestRunnerFailureEnvelope(operation: string, error: Error | string, traceId: string): LoadTestRunnerFailureEnvelope;
export declare function buildLoadTestRunMetrics(input: {
    operationResults: ExecuteLoadTestOperationResult[];
    runId: string;
    targetRps: number;
}): OperationsLoadTestRunMetricsRecord;
export declare function buildLoadTestRunErrorSummary(input: {
    operationResults: ExecuteLoadTestOperationResult[];
    runId: string;
}): OperationsLoadTestRunErrorSummaryRecord;
export interface DeterministicHttpLoadTestRunnerAdapterOptions {
    fetch?: typeof fetch;
    responses?: Map<string, {
        durationMs: number;
        statusCode: number;
    }>;
}
export declare function createDeterministicHttpLoadTestRunnerAdapter(options?: DeterministicHttpLoadTestRunnerAdapterOptions): LoadTestHttpRunnerPort;
export interface DeterministicRealtimeLoadTestRunnerAdapterOptions {
    deliveredEvents?: number;
    durationMs?: number;
    ok?: boolean;
}
export declare function createDeterministicRealtimeLoadTestRunnerAdapter(options?: DeterministicRealtimeLoadTestRunnerAdapterOptions): LoadTestRealtimeRunnerPort;
export declare function seedLoadTestRunExecution(input: {
    operationsRepository: OperationsRepository;
    runId: string;
    scenarioId: string;
    targetRps: number;
    tenantId: string;
    traceId: string;
    workflows: string[];
}): OperationsLoadTestRunExecutionRecord;
export declare function seedLoadTestRunExecutionAsync(input: {
    operationsRepository: OperationsRepository;
    runId: string;
    scenarioId: string;
    targetRps: number;
    tenantId: string;
    traceId: string;
    workflows: string[];
}): Promise<OperationsLoadTestRunExecutionRecord>;
export declare function makeLoadTestRunId(scope?: string): string;
