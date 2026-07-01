import { createHash, randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import { type OperationsRepository } from "./operations.repository.js";
import {
  type OperationsLoadTestRunExecutionRecord,
  type OperationsLoadTestRunMetricsRecord,
  type OperationsLoadTestRunErrorSummaryRecord
} from "./operations.repository.js";

export const LOAD_TEST_OPERATION_SCHEMA_VERSION = "load-test-operation/v1" as const;

export type LoadTestWorkflow =
  | "dead-letter-replay"
  | "dialogs"
  | "message-send"
  | "webhook-delivery"
  | "report-export"
  | "realtime-fanout";

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

const WORKFLOW_OPERATION_SPECS: Record<LoadTestWorkflow, {
  method: "GET" | "POST";
  path: string;
  summary: Record<string, unknown>;
  transport: "http" | "realtime";
}> = {
  "dead-letter-replay": {
    method: "POST",
    path: "/api/v1/operations/dead-letter/replay",
    summary: { operation: "dead_letter.replay" },
    transport: "http"
  },
  dialogs: {
    method: "POST",
    path: "/api/v1/dialogs",
    summary: { channel: "SDK", operation: "dialog.create" },
    transport: "http"
  },
  "message-send": {
    method: "POST",
    path: "/api/v1/dialogs/{conversationId}/messages",
    summary: { operation: "message.send" },
    transport: "http"
  },
  "webhook-delivery": {
    method: "POST",
    path: "/api/v1/integrations/webhooks/deliveries",
    summary: { operation: "webhook.delivery" },
    transport: "http"
  },
  "report-export": {
    method: "POST",
    path: "/api/v1/reports/exports",
    summary: { operation: "report.export" },
    transport: "http"
  },
  "realtime-fanout": {
    method: "GET",
    path: "/api/v1/realtime/events/stream",
    summary: { operation: "realtime.fanout" },
    transport: "realtime"
  }
};

const SUPPORTED_LOAD_TEST_WORKFLOWS = new Set<string>(Object.keys(WORKFLOW_OPERATION_SPECS));

export function parseLoadTestRunnerRuntimeConfig(
  source: Record<string, string | undefined> = process.env
): LoadTestRunnerRuntimeConfig {
  const enabled = parseBoolean(source.LOAD_TEST_RUNNER_ENABLED, false);
  const baseUrl = source.LOAD_TEST_RUNNER_BASE_URL?.trim() || "http://127.0.0.1:4100";
  const tenantId = source.LOAD_TEST_RUNNER_TENANT_ID?.trim() || "tenant-load-test";
  const timeoutMs = positiveInteger(source.LOAD_TEST_RUNNER_TIMEOUT_MS) ?? 5_000;
  const maxOperationsPerRun = positiveInteger(source.LOAD_TEST_RUNNER_MAX_OPERATIONS) ?? 25;

  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw new Error("load_test_runner_base_url_invalid");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    enabled,
    maxOperationsPerRun,
    tenantId,
    timeoutMs
  };
}

export function planLoadTestOperationDescriptor(input: {
  runId: string;
  tenantId: string;
  traceId: string;
  workflow: string;
}): LoadTestOperationDescriptor {
  if (!SUPPORTED_LOAD_TEST_WORKFLOWS.has(input.workflow)) {
    throw new Error(`load_test_workflow_unsupported:${input.workflow}`);
  }

  const workflow = input.workflow as LoadTestWorkflow;
  const spec = WORKFLOW_OPERATION_SPECS[workflow];

  return {
    id: makeOperationId(input.runId, workflow),
    method: spec.method,
    path: spec.path,
    runId: input.runId,
    schemaVersion: LOAD_TEST_OPERATION_SCHEMA_VERSION,
    status: "queued",
    summary: { ...spec.summary },
    tenantId: input.tenantId,
    traceId: input.traceId,
    transport: spec.transport,
    workflow
  };
}

export function planLoadTestOperationDescriptors(input: PlanLoadTestOperationDescriptorsInput): LoadTestOperationDescriptor[] {
  return input.workflows.map((workflow) => planLoadTestOperationDescriptor({
    runId: input.runId,
    tenantId: input.tenantId,
    traceId: input.traceId,
    workflow
  }));
}

export function claimQueuedLoadTestRuns(input: ClaimQueuedLoadTestRunsInput): ClaimQueuedLoadTestRunsResult {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("load_test_claim_limit_invalid");
  }

  const now = (input.now ?? new Date()).toISOString();
  const queued = input.operationsRepository.listLoadTestRunExecutions({ status: "queued" }).slice(0, limit);
  const claimed = queued.map((execution) => input.operationsRepository.saveLoadTestRunExecution({
    ...execution,
    startedAt: execution.startedAt ?? now,
    status: "running",
    updatedAt: now
  }));

  return { claimed };
}

export async function executeLoadTestOperation(input: ExecuteLoadTestOperationInput): Promise<ExecuteLoadTestOperationResult> {
  const runningDescriptor: LoadTestOperationDescriptor = {
    ...input.descriptor,
    status: "running"
  };

  if (runningDescriptor.transport === "realtime") {
    const result = await input.realtimeRunner.execute({ descriptor: runningDescriptor });
    return {
      descriptor: {
        ...runningDescriptor,
        status: result.ok ? "completed" : "failed"
      },
      durationMs: result.durationMs,
      errorCode: result.ok ? null : "realtime_fanout_failed",
      ok: result.ok
    };
  }

  const result = await input.httpRunner.execute({
    baseUrl: input.baseUrl,
    descriptor: runningDescriptor
  });

  return {
    descriptor: {
      ...runningDescriptor,
      status: result.ok ? "completed" : "failed"
    },
    durationMs: result.durationMs,
    errorCode: result.ok ? null : `http_status_${result.statusCode}`,
    ok: result.ok
  };
}

export function transitionLoadTestRunStatus(
  operationsRepository: OperationsRepository,
  runId: string,
  status: OperationsLoadTestRunExecutionRecord["status"],
  now: Date = new Date()
): OperationsLoadTestRunExecutionRecord {
  const existing = operationsRepository.findLoadTestRunExecution(runId);
  if (!existing) {
    throw new Error(`load_test_run_not_found:${runId}`);
  }

  return operationsRepository.saveLoadTestRunExecution({
    ...existing,
    completedAt: status === "completed" || status === "failed" ? now.toISOString() : existing.completedAt ?? null,
    status,
    updatedAt: now.toISOString()
  });
}

export function persistLoadTestRunMetrics(
  operationsRepository: OperationsRepository,
  metrics: OperationsLoadTestRunMetricsRecord
): OperationsLoadTestRunMetricsRecord {
  return operationsRepository.saveLoadTestRunMetrics(metrics);
}

export function persistLoadTestRunErrorSummary(
  operationsRepository: OperationsRepository,
  errorSummary: OperationsLoadTestRunErrorSummaryRecord
): OperationsLoadTestRunErrorSummaryRecord {
  return operationsRepository.saveLoadTestRunErrorSummary(errorSummary);
}

export function getLoadTestRunStatus(
  operationsRepository: OperationsRepository,
  runId: string
): OperationsLoadTestRunExecutionRecord | undefined {
  return operationsRepository.findLoadTestRunExecution(runId);
}

export function getLoadTestRunMetrics(
  operationsRepository: OperationsRepository,
  runId: string
): OperationsLoadTestRunMetricsRecord | undefined {
  return operationsRepository.findLoadTestRunMetrics(runId);
}

export function getLoadTestRunErrorSummary(
  operationsRepository: OperationsRepository,
  runId: string
): OperationsLoadTestRunErrorSummaryRecord | undefined {
  return operationsRepository.findLoadTestRunErrorSummary(runId);
}

export function createLoadTestRunnerFailureEnvelope(
  operation: string,
  error: Error | string,
  traceId: string
): LoadTestRunnerFailureEnvelope {
  const rawMessage = error instanceof Error ? error.message : error;

  return {
    code: "load_test_runner_failed",
    message: redactSensitiveText(rawMessage),
    operation,
    sanitized: true,
    traceId
  };
}

export function buildLoadTestRunMetrics(input: {
  operationResults: ExecuteLoadTestOperationResult[];
  runId: string;
  targetRps: number;
}): OperationsLoadTestRunMetricsRecord {
  const durations = input.operationResults.map((result) => result.durationMs).sort((left, right) => left - right);
  const completedOperations = input.operationResults.filter((result) => result.ok).length;
  const failedOperations = input.operationResults.length - completedOperations;
  const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
  const observedRps = totalDurationMs > 0
    ? Number(((completedOperations * 1000) / totalDurationMs).toFixed(2))
    : 0;

  const workflowBreakdown: Record<string, { completed: number; failed: number; latencyP95Ms: number }> = {};
  for (const workflow of new Set(input.operationResults.map((result) => result.descriptor.workflow))) {
    const workflowResults = input.operationResults.filter((result) => result.descriptor.workflow === workflow);
    const workflowDurations = workflowResults.map((result) => result.durationMs).sort((left, right) => left - right);
    workflowBreakdown[workflow] = {
      completed: workflowResults.filter((result) => result.ok).length,
      failed: workflowResults.filter((result) => !result.ok).length,
      latencyP95Ms: percentile(workflowDurations, 0.95)
    };
  }

  return {
    completedOperations,
    failedOperations,
    latencyP50Ms: percentile(durations, 0.5),
    latencyP95Ms: percentile(durations, 0.95),
    latencyP99Ms: percentile(durations, 0.99),
    observedRps,
    runId: input.runId,
    targetRps: input.targetRps,
    totalOperations: input.operationResults.length,
    workflowBreakdown
  };
}

export function buildLoadTestRunErrorSummary(input: {
  operationResults: ExecuteLoadTestOperationResult[];
  runId: string;
}): OperationsLoadTestRunErrorSummaryRecord {
  const failures = input.operationResults.filter((result) => !result.ok && result.errorCode);
  const counts = new Map<string, { code: string; count: number; workflow: string }>();

  for (const failure of failures) {
    const key = `${failure.descriptor.workflow}:${failure.errorCode}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      continue;
    }

    counts.set(key, {
      code: failure.errorCode ?? "unknown_failure",
      count: 1,
      workflow: failure.descriptor.workflow
    });
  }

  const topFailures = [...counts.values()]
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
    .slice(0, 5);

  return {
    runId: input.runId,
    sanitized: true,
    topFailures,
    totalFailures: failures.length
  };
}

export interface DeterministicHttpLoadTestRunnerAdapterOptions {
  fetch?: typeof fetch;
  responses?: Map<string, { durationMs: number; statusCode: number }>;
}

export function createDeterministicHttpLoadTestRunnerAdapter(
  options: DeterministicHttpLoadTestRunnerAdapterOptions = {}
): LoadTestHttpRunnerPort {
  const responses = options.responses ?? new Map<string, { durationMs: number; statusCode: number }>();

  return {
    async execute(request) {
      const url = `${request.baseUrl.replace(/\/+$/, "")}${request.descriptor.path}`;
      const configured = responses.get(request.descriptor.workflow) ?? responses.get(url);
      if (configured) {
        return {
          durationMs: configured.durationMs,
          ok: configured.statusCode >= 200 && configured.statusCode < 400,
          statusCode: configured.statusCode
        };
      }

      if (options.fetch) {
        const startedAt = Date.now();
        const response = await options.fetch(url, {
          method: request.descriptor.method,
          headers: {
            "trace-id": request.descriptor.traceId,
            "x-tenant-id": request.descriptor.tenantId
          }
        });
        return {
          durationMs: Date.now() - startedAt,
          ok: response.ok,
          statusCode: response.status
        };
      }

      return {
        durationMs: deterministicDuration(request.descriptor),
        ok: true,
        statusCode: 200
      };
    }
  };
}

export interface DeterministicRealtimeLoadTestRunnerAdapterOptions {
  deliveredEvents?: number;
  durationMs?: number;
  ok?: boolean;
}

export function createDeterministicRealtimeLoadTestRunnerAdapter(
  options: DeterministicRealtimeLoadTestRunnerAdapterOptions = {}
): LoadTestRealtimeRunnerPort {
  return {
    async execute(request) {
      if (request.descriptor.transport !== "realtime") {
        throw new Error("load_test_realtime_adapter_transport_mismatch");
      }

      return {
        deliveredEvents: options.deliveredEvents ?? 3,
        durationMs: options.durationMs ?? deterministicDuration(request.descriptor),
        ok: options.ok ?? true
      };
    }
  };
}

function deterministicDuration(descriptor: LoadTestOperationDescriptor): number {
  const hash = createHash("sha256").update(`${descriptor.runId}:${descriptor.workflow}:${descriptor.path}`).digest("hex");
  return 40 + Number.parseInt(hash.slice(0, 4), 16) % 160;
}

function makeOperationId(runId: string, workflow: string): string {
  return `load-op-${workflow}-${createHash("sha256").update(`${runId}:${workflow}`).digest("hex").slice(0, 12)}`;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  return fallback;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index] ?? 0;
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function seedLoadTestRunExecution(input: {
  operationsRepository: OperationsRepository;
  runId: string;
  scenarioId: string;
  targetRps: number;
  tenantId: string;
  traceId: string;
  workflows: string[];
}): OperationsLoadTestRunExecutionRecord {
  const now = new Date().toISOString();
  const operations = planLoadTestOperationDescriptors({
    runId: input.runId,
    tenantId: input.tenantId,
    traceId: input.traceId,
    workflows: input.workflows
  });

  return input.operationsRepository.saveLoadTestRunExecution({
    completedAt: null,
    operations: operations as unknown as Array<Record<string, unknown>>,
    runId: input.runId,
    scenarioId: input.scenarioId,
    startedAt: null,
    status: "queued",
    targetRps: input.targetRps,
    traceId: input.traceId,
    updatedAt: now
  });
}

export function makeLoadTestRunId(scope = "load_test"): string {
  return `${scope}_${randomUUID()}`;
}
