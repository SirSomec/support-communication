import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
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

export function createPostgresRestoreCheckCommandPort(
  executor: (request: PostgresRestoreCheckCommandRequest) => Promise<PostgresRestoreCheckCommandResult>
): PostgresRestoreCheckCommandPort {
  return { execute: executor };
}

export interface DeterministicPostgresRestoreCheckCommandAdapterOptions {
  outcomes?: Map<string, PostgresRestoreCheckCommandResult>;
}

export function createDeterministicPostgresRestoreCheckCommandAdapter(
  options: DeterministicPostgresRestoreCheckCommandAdapterOptions = {}
): PostgresRestoreCheckCommandPort {
  const outcomes = options.outcomes ?? new Map<string, PostgresRestoreCheckCommandResult>();

  return createPostgresRestoreCheckCommandPort(async (request) => {
    const configured = outcomes.get(request.drillId) ?? outcomes.get(request.restoreCheckId);
    if (configured) {
      return { ...configured };
    }

    return {
      command: `pg_restore --verify --targets=${request.targets.join(",")}`,
      durationMs: 420,
      ok: true,
      outputSummary: "postgres restore verification passed",
      status: "passed"
    };
  });
}

export async function executePostgresRestoreCheck(
  input: ExecutePostgresRestoreCheckInput
): Promise<ExecutePostgresRestoreCheckResult> {
  const now = input.now ?? new Date();
  let commandResult: PostgresRestoreCheckCommandResult;

  try {
    commandResult = await runWithTimeout(
      input.commandPort.execute({
        drillId: input.drillId,
        restoreCheckId: input.restoreCheckId,
        targets: input.targets,
        timeoutMs: input.timeoutMs
      }),
      input.timeoutMs
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "postgres_restore_check_timed_out";
    commandResult = {
      command: `pg_restore --verify --targets=${input.targets.join(",")}`,
      durationMs: input.timeoutMs,
      ok: false,
      outputSummary: timedOut ? "postgres restore verification timed out" : sanitizeRestoreCheckMessage(error),
      status: timedOut ? "timed_out" : "failed"
    };
  }

  const result = await input.operationsRepository.savePostgresRestoreCheckResultAsync({
    command: commandResult.command,
    drillId: input.drillId,
    durationMs: commandResult.durationMs,
    executedAt: now.toISOString(),
    id: makeRestoreCheckResultId(),
    outputSummary: sanitizeRestoreCheckMessage(commandResult.outputSummary),
    restoreCheckId: input.restoreCheckId,
    status: commandResult.status
  });

  const audit = createPostgresRestoreCheckAuditDescriptor({
    drillId: input.drillId,
    reason: input.auditReason,
    restoreCheckId: input.restoreCheckId,
    resultId: result.id,
    status: result.status
  });

  const envelope = commandResult.ok || result.status === "passed"
    ? null
    : createPostgresRestoreCheckFailureEnvelope({
      drillId: input.drillId,
      message: result.outputSummary,
      restoreCheckId: input.restoreCheckId,
      status: result.status === "timed_out" ? "timed_out" : "failed"
    });

  return { audit, envelope, result };
}

export function persistPostgresRestoreCheckResult(
  operationsRepository: OperationsRepository,
  record: OperationsPostgresRestoreCheckResultRecord
): OperationsPostgresRestoreCheckResultRecord {
  return operationsRepository.savePostgresRestoreCheckResult(record);
}

export function findPostgresRestoreCheckResult(
  operationsRepository: OperationsRepository,
  resultId: string
): OperationsPostgresRestoreCheckResultRecord | undefined {
  return operationsRepository.findPostgresRestoreCheckResult(resultId);
}

export function createPostgresRestoreCheckFailureEnvelope(input: {
  drillId: string;
  message: string;
  restoreCheckId: string;
  status: "failed" | "timed_out";
}): PostgresRestoreCheckFailureEnvelope {
  return {
    code: input.status === "timed_out" ? "postgres_restore_check_timed_out" : "postgres_restore_check_failed",
    drillId: input.drillId,
    message: sanitizeRestoreCheckMessage(input.message),
    restoreCheckId: input.restoreCheckId,
    sanitized: true,
    status: input.status
  };
}

export function createPostgresRestoreCheckAuditDescriptor(input: {
  drillId: string;
  reason: string;
  restoreCheckId: string;
  resultId: string;
  status: OperationsPostgresRestoreCheckResultRecord["status"];
}): PostgresRestoreCheckAuditDescriptor {
  return {
    action: "operations.postgres_restore_check.execute",
    drillId: input.drillId,
    id: `evt_postgres_restore_${randomUUID()}`,
    immutable: true,
    reason: input.reason.trim(),
    restoreCheckId: input.restoreCheckId,
    resultId: input.resultId,
    status: input.status,
    target: input.drillId
  };
}

function makeRestoreCheckResultId(): string {
  return `postgres_restore_result_${randomUUID()}`;
}

function sanitizeRestoreCheckMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return redactSensitiveText(message);
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("postgres_restore_check_timed_out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
