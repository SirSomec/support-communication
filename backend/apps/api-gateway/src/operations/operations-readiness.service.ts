import { randomUUID } from "node:crypto";
import { createEnvelope, redactExportedDescriptor, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import {
  backupDrills,
  deadLetterMessages,
  deadLetterQueues,
  loadTestScenarios,
  migrationCandidates,
  securityControls
} from "./operations.fixtures.js";
import {
  OperationsRepository,
  type OperationsDeadLetterReplayRecord,
  type OperationsLoadTestRunRecord,
  type OperationsMigrationRollbackCheckRecord,
  type OperationsRestoreCheckRecord
} from "./operations.repository.js";
import {
  runDeadLetterReplayWorker,
  runMigrationRollbackTooling,
  runQueuedLoadTestExecution,
  runRestoreDrillWorkers
} from "./operations-runtime.js";

const OPERATIONS_SERVICE = "operationsReadinessService";

interface ReadinessFilters {
  domain?: string;
}

interface LoadTestRunPayload {
  actor?: ServiceAdminActor;
  confirmed?: boolean;
  idempotencyKey?: string;
  reason?: string;
  scenarioId?: string;
}

interface RestoreCheckPayload {
  actor?: ServiceAdminActor;
  confirmed?: boolean;
  drillId?: string;
  idempotencyKey?: string;
  reason?: string;
}

interface RollbackCheckPayload {
  actor?: ServiceAdminActor;
  confirmed?: boolean;
  migrationId?: string;
  reason?: string;
}

interface DeadLetterFilters {
  queue?: string;
}

interface DeadLetterReplayPayload {
  actor?: ServiceAdminActor;
  confirmed?: boolean;
  idempotencyKey?: string;
  messageId?: string;
  reason?: string;
}

interface SecurityReviewFilters {
  area?: string;
}

interface IdempotencyEntry {
  fingerprint: string;
  result: Record<string, unknown>;
}

export class OperationsReadinessService {
  private readonly loadTestIdempotency: Map<string, IdempotencyEntry>;
  private readonly restoreCheckIdempotency: Map<string, IdempotencyEntry>;
  private readonly deadLetterIdempotency: Map<string, IdempotencyEntry>;

  constructor(private readonly operationsRepository = OperationsRepository.default()) {
    const state = this.operationsRepository.readState();
    this.loadTestIdempotency = new Map(state.loadTestIdempotencyKeys.map((item) => [item.key, {
      fingerprint: item.fingerprint,
      result: clone(item.result)
    }]));
    this.restoreCheckIdempotency = new Map(state.restoreCheckIdempotencyKeys.map((item) => [item.key, {
      fingerprint: item.fingerprint,
      result: clone(item.result)
    }]));
    this.deadLetterIdempotency = new Map(state.deadLetterReplayIdempotencyKeys.map((item) => [item.key, {
      fingerprint: item.fingerprint,
      result: clone(item.result)
    }]));
  }

  async fetchReadinessDashboard(filters: ReadinessFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const loadTests = filterByDomain(loadTestScenarios, filters.domain);
    const drills = filterByDomain(backupDrills, filters.domain);
    const queues = filterByDomain(deadLetterQueues, filters.domain);
    const blockers = [
      ...loadTests.flatMap((scenario) => scenario.blockers),
      ...drills.flatMap((drill) => drill.blockers),
      ...queues.filter((queue) => queue.status === "blocked").map((queue) => `${queue.name} dead-letter queue is blocked`),
      ...securityControls.filter((control) => control.status === "blocked").map((control) => `${control.title} is blocked`)
    ];

    return createEnvelope({
      service: OPERATIONS_SERVICE,
      operation: "fetchReadinessDashboard",
      traceId: operationsTraceId("fetchReadinessDashboard"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        backupDrills: clone(drills),
        deadLetterQueues: clone(queues),
        loadTests: clone(loadTests),
        migrationCandidates: clone(migrationCandidates),
        migrationPolicy: {
          compatibilityChecksRequired: true,
          requiresRollbackPlan: true,
          smokeRequiredBeforeDeploy: true
        },
        securityControls: clone(securityControls),
        summary: {
          blockers,
          productionReady: blockers.length === 0,
          readinessScore: blockers.length === 0 ? 100 : 78
        }
      }
    });
  }

  async queueLoadTestRun(payload: LoadTestRunPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const scenario = loadTestScenarios.find((item) => item.id === request.scenarioId);

    if (!scenario) {
      return notFoundEnvelope("queueLoadTestRun", "load_test_scenario_not_found", `Load test scenario ${request.scenarioId ?? "(empty)"} was not found.`, {
        scenarioId: request.scenarioId ?? null
      });
    }

    const validation = validatePrivilegedOperation("queueLoadTestRun", request.reason, request.confirmed, { scenarioId: scenario.id });
    if (validation) {
      return validation;
    }

    const idempotencyKey = request.idempotencyKey?.trim();
    const fingerprint = JSON.stringify({ reason: normalizeReason(request.reason), scenarioId: scenario.id });
    const persistedCached = idempotencyKey ? this.operationsRepository.findLoadTestIdempotencyKey(idempotencyKey) : undefined;
    const cached = persistedCached ?? (idempotencyKey ? this.loadTestIdempotency.get(idempotencyKey) : undefined);
    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        return conflictEnvelope("queueLoadTestRun", "idempotency_key_reused", "Idempotency key was already used for a different load test request.", {
          idempotencyKey,
          scenarioId: scenario.id
        });
      }

      return okEnvelope("queueLoadTestRun", { ...clone(cached.result), duplicate: true }, { idempotencyKey, scenarioId: scenario.id });
    }

    const runDescriptor = {
      id: makeQueueId("load_test"),
      queue: "load-test-runs",
      scenarioId: scenario.id,
      targetRps: scenario.targetRps,
      durationMinutes: scenario.durationMinutes,
      workflows: clone(scenario.workflows)
    };
    const execution = await runQueuedLoadTestExecution({
      operationsRepository: this.operationsRepository,
      runId: runDescriptor.id,
      scenario,
      traceId: operationsTraceId("queueLoadTestRun")
    });
    const result = {
      auditEvent: auditEvent("operations.load_test.queue", scenario.id, request.reason, request.actor),
      execution,
      reason: normalizeReason(request.reason),
      run: runDescriptor
    };
    const persistedResult = this.operationsRepository.saveLoadTestRun(result as OperationsLoadTestRunRecord);

    if (idempotencyKey) {
      const saved = this.operationsRepository.saveLoadTestIdempotencyKey({ key: idempotencyKey, fingerprint, result: { ...clone(persistedResult) } });
      this.loadTestIdempotency.set(idempotencyKey, {
        fingerprint: saved.fingerprint,
        result: clone(saved.result)
      });
    }

    return okEnvelope("queueLoadTestRun", { ...persistedResult }, { idempotencyKey: idempotencyKey ?? null, scenarioId: scenario.id });
  }

  async queueRestoreCheck(payload: RestoreCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const drill = backupDrills.find((item) => item.id === request.drillId);

    if (!drill) {
      return notFoundEnvelope("queueRestoreCheck", "backup_drill_not_found", `Backup drill ${request.drillId ?? "(empty)"} was not found.`, {
        drillId: request.drillId ?? null
      });
    }

    const validation = validatePrivilegedOperation("queueRestoreCheck", request.reason, request.confirmed, { drillId: drill.id });
    if (validation) {
      return validation;
    }

    const idempotencyKey = request.idempotencyKey?.trim();
    const fingerprint = JSON.stringify({ drillId: drill.id, reason: normalizeReason(request.reason) });
    const persistedCached = idempotencyKey ? this.operationsRepository.findRestoreCheckIdempotencyKey(idempotencyKey) : undefined;
    const cached = persistedCached ?? (idempotencyKey ? this.restoreCheckIdempotency.get(idempotencyKey) : undefined);
    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        return conflictEnvelope("queueRestoreCheck", "idempotency_key_reused", "Idempotency key was already used for a different restore check request.", {
          drillId: drill.id,
          idempotencyKey
        });
      }

      return okEnvelope("queueRestoreCheck", { ...clone(cached.result), duplicate: true }, { drillId: drill.id, idempotencyKey });
    }

    const restoreCheckDescriptor = {
      artifactDescriptor: redactExportedDescriptor({
        artifactUrl: `/operations/restore-checks/${drill.id}/artifact`,
        objectKey: `restore-checks/${drill.id}/artifact.json`,
        objectKeyExposed: false
      }),
      destructiveAllowed: false,
      drillId: drill.id,
      id: makeQueueId("restore_check"),
      queue: "restore-drills",
      targets: clone(drill.targets)
    };
    const workerResults = await runRestoreDrillWorkers({
      drill,
      operationsRepository: this.operationsRepository,
      reason: normalizeReason(request.reason) ?? "",
      restoreCheckId: restoreCheckDescriptor.id
    });
    const result = {
      auditEvent: auditEvent("operations.restore_check.queue", drill.id, request.reason, request.actor),
      reason: normalizeReason(request.reason),
      restoreCheck: restoreCheckDescriptor,
      workerResults
    };
    const persistedResult = this.operationsRepository.saveRestoreCheck(result as OperationsRestoreCheckRecord);

    if (idempotencyKey) {
      const saved = this.operationsRepository.saveRestoreCheckIdempotencyKey({ key: idempotencyKey, fingerprint, result: { ...clone(persistedResult) } });
      this.restoreCheckIdempotency.set(idempotencyKey, {
        fingerprint: saved.fingerprint,
        result: clone(saved.result)
      });
    }

    return okEnvelope("queueRestoreCheck", { ...persistedResult }, { drillId: drill.id, idempotencyKey: idempotencyKey ?? null });
  }

  async checkMigrationRollback(payload: RollbackCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const migration = migrationCandidates.find((item) => item.id === request.migrationId);

    if (!migration) {
      return notFoundEnvelope("checkMigrationRollback", "migration_not_found", `Migration ${request.migrationId ?? "(empty)"} was not found.`, {
        migrationId: request.migrationId ?? null
      });
    }

    const validation = validatePrivilegedOperation("checkMigrationRollback", request.reason, request.confirmed, { migrationId: migration.id });
    if (validation) {
      return validation;
    }

    const toolingExecution = runMigrationRollbackTooling({
      migration,
      operationsRepository: this.operationsRepository,
      reason: normalizeReason(request.reason) ?? ""
    });
    const compatibilityChecks = clone(toolingExecution.toolingResults.flatMap((toolingResult) => toolingResult.checks));
    const result = {
      auditEvent: auditEvent("operations.migration.rollback_check", migration.id, request.reason, request.actor),
      compatibilityChecks,
      migrationId: migration.id,
      policy: {
        compatibilityChecksRequired: true,
        requiresRollbackPlan: true,
        smokeRequiredBeforeDeploy: true
      },
      reason: normalizeReason(request.reason),
      rollbackPlan: {
        applyCommand: migration.applyCommand,
        rollbackCommand: migration.rollbackCommand,
        service: migration.service,
        status: migration.status
      },
      toolingResultId: toolingExecution.result.id,
      toolingResults: clone(toolingExecution.toolingResults),
      toolingStatus: toolingExecution.result.status
    };
    const persistedResult = this.operationsRepository.saveMigrationRollbackCheck({
      ...result,
      compatibilityChecks: compatibilityChecks as unknown as Array<Record<string, unknown>>
    } as OperationsMigrationRollbackCheckRecord);

    if (toolingExecution.result.status === "failed") {
      return conflictEnvelope("checkMigrationRollback", "migration_compatibility_failed", "Migration rollback compatibility checks failed.", {
        ...persistedResult,
        migrationId: migration.id
      });
    }

    return okEnvelope("checkMigrationRollback", { ...persistedResult }, { migrationId: migration.id });
  }

  async fetchDeadLetterDashboard(filters: DeadLetterFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const queues = deadLetterQueues.filter((queue) => !filters.queue || filters.queue === "all" || queue.name === filters.queue || queue.id === filters.queue);
    const queueIds = new Set(queues.map((queue) => queue.id));
    const messages = deadLetterMessages.filter((message) => queueIds.has(message.queueId));

    return createEnvelope({
      service: OPERATIONS_SERVICE,
      operation: "fetchDeadLetterDashboard",
      traceId: operationsTraceId("fetchDeadLetterDashboard"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        filters,
        messages: clone(messages),
        queues: clone(queues),
        summary: {
          oldestMessageAgeMinutes: queues.reduce((max, queue) => Math.max(max, queue.oldestMessageAgeMinutes), 0),
          replayable: queues.filter((queue) => queue.replayEnabled).length,
          totalDepth: queues.reduce((sum, queue) => sum + queue.depth, 0)
        }
      }
    });
  }

  async replayDeadLetterMessage(payload: DeadLetterReplayPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const message = deadLetterMessages.find((item) => item.id === request.messageId);

    if (!message) {
      return notFoundEnvelope("replayDeadLetterMessage", "dead_letter_message_not_found", `Dead-letter message ${request.messageId ?? "(empty)"} was not found.`, {
        messageId: request.messageId ?? null
      });
    }

    const validation = validatePrivilegedOperation("replayDeadLetterMessage", request.reason, request.confirmed, { messageId: message.id });
    if (validation) {
      return validation;
    }

    const workerResult = await runDeadLetterReplayWorker({
      idempotencyKey: request.idempotencyKey,
      message,
      operationsRepository: this.operationsRepository,
      reason: normalizeReason(request.reason) ?? ""
    });

    if (workerResult.status === "denied") {
      const code = workerResult.envelope?.code ?? workerResult.validationDenial?.code ?? "dead_letter_replay_denied";
      return conflictEnvelope(
        "replayDeadLetterMessage",
        code,
        workerResult.envelope?.message ?? "Dead-letter replay was denied.",
        {
          messageId: message.id,
          queueId: message.queueId,
          queueName: message.queueName,
          validationDenial: workerResult.validationDenial ?? null
        }
      );
    }

    const persistedReplay = findPersistedDeadLetterReplay(this.operationsRepository, workerResult.replay.id);
    const result = {
      auditEvent: persistedReplay?.auditEvent ?? auditEvent("operations.dead_letter.replay", message.id, request.reason, request.actor),
      backendItem: workerResult.backendItem,
      duplicate: workerResult.duplicate ?? false,
      reason: normalizeReason(request.reason),
      replay: workerResult.replay,
      requeueAudit: workerResult.audit
    };

    return okEnvelope("replayDeadLetterMessage", { ...result }, {
      duplicate: workerResult.duplicate ?? false,
      idempotencyKey: request.idempotencyKey ?? null,
      messageId: message.id
    });
  }

  async fetchSecurityReview(filters: SecurityReviewFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!isSupportedSecurityArea(filters.area)) {
      return invalidEnvelope("fetchSecurityReview", "security_area_unsupported", "Security review area is not supported.", {
        area: filters.area ?? null,
        supportedAreas: supportedSecurityAreas()
      });
    }

    const controls = securityControls.filter((control) => !filters.area || filters.area === "all" || control.area === filters.area);

    return createEnvelope({
      service: OPERATIONS_SERVICE,
      operation: "fetchSecurityReview",
      traceId: operationsTraceId("fetchSecurityReview"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        controls: clone(controls),
        filters,
        summary: {
          blocked: controls.filter((control) => control.status === "blocked").length,
          passed: controls.filter((control) => control.status === "pass").length,
          warnings: controls.filter((control) => control.status === "warn").length
        }
      }
    });
  }
}

function findPersistedDeadLetterReplay(
  operationsRepository: OperationsRepository,
  replayId: string
): OperationsDeadLetterReplayRecord | undefined {
  return operationsRepository.readState().deadLetterReplays.find((item) => item.replay.id === replayId);
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditEvent(action: string, target: string, reason: string | undefined, actor: ServiceAdminActor | undefined): Record<string, unknown> {
  return {
    id: makeAuditId("operations"),
    action,
    actor: actor?.id ?? "service-admin",
    actorName: actor?.name ?? "Service Admin",
    immutable: true,
    reason: normalizeReason(reason),
    target
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: OPERATIONS_SERVICE,
    operation,
    traceId: operationsTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function filterByDomain<T extends { domain: string }>(items: T[], domain: string | undefined): T[] {
  return items.filter((item) => !domain || domain === "all" || item.domain === domain);
}

function hasAuditReason(reason: unknown): boolean {
  return typeof reason === "string" && reason.trim().length >= 8;
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: OPERATIONS_SERVICE,
    operation,
    traceId: operationsTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function isSupportedSecurityArea(area: string | undefined): boolean {
  return area === undefined || area === "all" || supportedSecurityAreas().includes(area);
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function normalizeReason(reason: string | undefined): string | null {
  return typeof reason === "string" ? reason.trim() : null;
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: OPERATIONS_SERVICE,
    operation,
    traceId: operationsTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function okEnvelope(operation: string, data: Record<string, unknown>, meta: Record<string, unknown> = {}): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: OPERATIONS_SERVICE,
    operation,
    traceId: operationsTraceId(operation),
    meta: apiMeta(meta),
    data
  });
}

function operationsTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(OPERATIONS_SERVICE, operation);
}

function supportedSecurityAreas(): string[] {
  return ["api_keys", "audit_immutability", "auth", "sensitive_exports", "tenant_isolation"];
}

function validatePrivilegedOperation(
  operation: string,
  reason: string | undefined,
  confirmed: boolean | undefined,
  data: Record<string, unknown>
): BackendEnvelope<Record<string, unknown>> | null {
  if (!hasAuditReason(reason)) {
    return invalidEnvelope(operation, "reason_required", "A service-admin reason of at least 8 characters is required.", {
      ...data,
      reason: reason ?? null
    });
  }

  if (!confirmed) {
    return invalidEnvelope(operation, "confirmation_required", "Explicit confirmation is required for production operations.", {
      ...data,
      confirmation: { required: true },
      reason
    });
  }

  return null;
}
