import { randomUUID } from "node:crypto";
import {
  createPrismaBillingSyncQueueSummaryStore,
  createPrismaClient,
  createPrismaOutboxQueueSummaryStore,
  type BillingSyncQueueSummary,
  type BillingSyncQueueSummaryStore,
  type PrismaBillingSyncJobClient,
  type PrismaOutboxClient,
  type OutboxQueueSummary,
  type OutboxQueueSummaryStore,
  type StoredBillingSyncJob
} from "@support-communication/database";
import { createEnvelope, redactExportedDescriptor, type BackendEnvelope } from "@support-communication/envelope";
import type { StoredOutboxEvent } from "@support-communication/events";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  AutomationRepository,
  type AutomationProactiveDeliveryAttempt
} from "../automation/automation.repository.js";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import {
  IntegrationRepository,
  type PublicDemoRequestNotificationDescriptor,
  type PublicDemoRequestNotificationDescriptorSummary,
  type WebhookDeliveryJournalEntry
} from "../integrations/integration.repository.js";
import {
  NotificationRepository,
  type NotificationDeliveryDescriptor
} from "../notifications/notification.repository.js";
import { ReportRepository, type ScheduledDigestDescriptorRecord } from "../reports/report.repository.js";
import type { ReportExportJob } from "../reports/report.types.js";
import {
  OperationsRepository,
  type OperationsDeadLetterReplayRecord,
  type OperationsLoadTestRunRecord,
  type OperationsMigrationRollbackCheckRecord,
  type OperationsRestoreCheckRecord
} from "./operations.repository.js";
import type { WorkerObservability } from "./operations.types.js";
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

interface WorkerQueueObservabilitySource extends BillingSyncQueueSummaryStore, OutboxQueueSummaryStore {}

export class OperationsReadinessService {
  private readonly loadTestIdempotency: Map<string, IdempotencyEntry>;
  private readonly restoreCheckIdempotency: Map<string, IdempotencyEntry>;
  private readonly deadLetterIdempotency: Map<string, IdempotencyEntry>;

  constructor(
    private readonly operationsRepository = OperationsRepository.default(),
    private readonly integrationRepository = IntegrationRepository.default(),
    private readonly notificationRepository = NotificationRepository.default(),
    private readonly reportRepository = ReportRepository.default(),
    private readonly queueObservabilitySource = createDefaultQueueObservabilitySource(),
    private readonly automationRepository = AutomationRepository.default()
  ) {
    const state = readInitialOperationsState(this.operationsRepository);
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
    const loadTests = filterByDomain(this.operationsRepository.listLoadTestScenarios(), filters.domain);
    const drills = filterByDomain(this.operationsRepository.listBackupDrills(), filters.domain);
    const queues = filterByDomain(this.operationsRepository.listDeadLetterQueues(), filters.domain);
    const workerObservability = await buildWorkerObservability(
      this.integrationRepository,
      this.notificationRepository,
      this.reportRepository,
      this.queueObservabilitySource,
      this.automationRepository
    );
    const blockers = [
      ...loadTests.flatMap((scenario) => scenario.blockers),
      ...drills.flatMap((drill) => drill.blockers),
      ...queues.filter((queue) => queue.status === "blocked").map((queue) => `${queue.name} dead-letter queue is blocked`),
      ...workerObservability.filter((worker) => worker.health.status === "blocked").map((worker) => `${worker.queue} worker has dead-lettered deliveries`),
      ...this.operationsRepository.listSecurityControls().filter((control) => control.status === "blocked").map((control) => `${control.title} is blocked`)
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
        migrationCandidates: clone(this.operationsRepository.listMigrationCandidates()),
        migrationPolicy: {
          compatibilityChecksRequired: true,
          requiresRollbackPlan: true,
          smokeRequiredBeforeDeploy: true
        },
        securityControls: clone(this.operationsRepository.listSecurityControls()),
        workerObservability: clone(workerObservability),
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
    const scenario = this.operationsRepository.listLoadTestScenarios().find((item) => item.id === request.scenarioId);

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
    const persistedCached = idempotencyKey ? await this.operationsRepository.findLoadTestIdempotencyKeyAsync(idempotencyKey) : undefined;
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
    const persistedResult = await this.operationsRepository.saveLoadTestRunAsync(result as OperationsLoadTestRunRecord);

    if (idempotencyKey) {
      const saved = await this.operationsRepository.saveLoadTestIdempotencyKeyAsync({ key: idempotencyKey, fingerprint, result: { ...clone(persistedResult) } });
      this.loadTestIdempotency.set(idempotencyKey, {
        fingerprint: saved.fingerprint,
        result: clone(saved.result)
      });
    }

    return okEnvelope("queueLoadTestRun", { ...persistedResult }, { idempotencyKey: idempotencyKey ?? null, scenarioId: scenario.id });
  }

  async queueRestoreCheck(payload: RestoreCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const drill = this.operationsRepository.listBackupDrills().find((item) => item.id === request.drillId);

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
    const persistedCached = idempotencyKey ? await this.operationsRepository.findRestoreCheckIdempotencyKeyAsync(idempotencyKey) : undefined;
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
    const persistedResult = await this.operationsRepository.saveRestoreCheckAsync(result as OperationsRestoreCheckRecord);

    if (idempotencyKey) {
      const saved = await this.operationsRepository.saveRestoreCheckIdempotencyKeyAsync({ key: idempotencyKey, fingerprint, result: { ...clone(persistedResult) } });
      this.restoreCheckIdempotency.set(idempotencyKey, {
        fingerprint: saved.fingerprint,
        result: clone(saved.result)
      });
    }

    return okEnvelope("queueRestoreCheck", { ...persistedResult }, { drillId: drill.id, idempotencyKey: idempotencyKey ?? null });
  }

  async checkMigrationRollback(payload: RollbackCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const migration = this.operationsRepository.listMigrationCandidates().find((item) => item.id === request.migrationId);

    if (!migration) {
      return notFoundEnvelope("checkMigrationRollback", "migration_not_found", `Migration ${request.migrationId ?? "(empty)"} was not found.`, {
        migrationId: request.migrationId ?? null
      });
    }

    const validation = validatePrivilegedOperation("checkMigrationRollback", request.reason, request.confirmed, { migrationId: migration.id });
    if (validation) {
      return validation;
    }

    const toolingExecution = await runMigrationRollbackTooling({
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
    const persistedResult = await this.operationsRepository.saveMigrationRollbackCheckAsync({
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
    const queues = this.operationsRepository.listDeadLetterQueues().filter((queue) => !filters.queue || filters.queue === "all" || queue.name === filters.queue || queue.id === filters.queue);
    const queueIds = new Set(queues.map((queue) => queue.id));
    const messages = this.operationsRepository.listDeadLetterMessages().filter((message) => queueIds.has(message.queueId));

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
    const message = this.operationsRepository.listDeadLetterMessages().find((item) => item.id === request.messageId);

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

    const persistedReplay = await findPersistedDeadLetterReplay(this.operationsRepository, workerResult.replay.id);
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

    const controls = this.operationsRepository.listSecurityControls().filter((control) => !filters.area || filters.area === "all" || control.area === filters.area);

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

async function findPersistedDeadLetterReplay(
  operationsRepository: OperationsRepository,
  replayId: string
): Promise<OperationsDeadLetterReplayRecord | undefined> {
  return operationsRepository.findDeadLetterReplayAsync(replayId);
}

function readInitialOperationsState(operationsRepository: OperationsRepository) {
  try {
    return operationsRepository.readState();
  } catch (error) {
    if (error instanceof Error && error.message === "prisma_operations_async_required") {
      return {
        deadLetterReplayIdempotencyKeys: [],
        loadTestIdempotencyKeys: [],
        restoreCheckIdempotencyKeys: []
      };
    }
    throw error;
  }
}

let cachedDefaultQueueObservabilitySource: WorkerQueueObservabilitySource | null = null;

function createDefaultQueueObservabilitySource(): WorkerQueueObservabilitySource {
  if (cachedDefaultQueueObservabilitySource) {
    return cachedDefaultQueueObservabilitySource;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    cachedDefaultQueueObservabilitySource = emptyQueueObservabilitySource();
    return cachedDefaultQueueObservabilitySource;
  }

  const client = createPrismaClient({ datasourceUrl: databaseUrl }) as PrismaBillingSyncJobClient & PrismaOutboxClient;
  const outboxSummaryStore = createPrismaOutboxQueueSummaryStore(client);
  const billingSyncSummaryStore = createPrismaBillingSyncQueueSummaryStore(client);
  cachedDefaultQueueObservabilitySource = {
    summarizeBillingSyncQueue: billingSyncSummaryStore.summarizeBillingSyncQueue,
    summarizeOutboxQueue: outboxSummaryStore.summarizeOutboxQueue
  };

  return cachedDefaultQueueObservabilitySource;
}

function emptyQueueObservabilitySource(): WorkerQueueObservabilitySource {
  return {
    async summarizeBillingSyncQueue({ queue }: { queue: string }): Promise<BillingSyncQueueSummary> {
      return {
        deadLetterCount: 0,
        latestJob: null,
        queue,
        queueDepth: 0
      };
    },
    async summarizeOutboxQueue({ queue }: { queue: string }): Promise<OutboxQueueSummary> {
      return {
        deadLetterCount: 0,
        latestEvent: null,
        queue,
        queueDepth: 0
      };
    }
  };
}

async function buildWorkerObservability(
  integrationRepository: IntegrationRepository,
  notificationRepository: NotificationRepository,
  reportRepository: ReportRepository,
  queueObservabilitySource: WorkerQueueObservabilitySource,
  automationRepository: AutomationRepository
): Promise<WorkerObservability[]> {
  const [
    webhookDeliveryJournal,
    leadNotificationSummary,
    browserPushDescriptors,
    reportExportJobs,
    scheduledDigestDescriptors,
    outboxSummary,
    fileScanSummary,
    billingSyncSummary,
    proactiveDeliveryAttempts
  ] = await Promise.all([
    integrationRepository.listWebhookDeliveryJournalAsync(),
    integrationRepository.summarizePublicDemoRequestNotificationDescriptorsAsync({ queue: "lead-notification" }),
    notificationRepository.listNotificationDeliveryDescriptorsAsync({ queue: "browser-push" }),
    reportRepository.listExportJobsAsync(),
    reportRepository.listScheduledDigestDescriptorsAsync(),
    queueObservabilitySource.summarizeOutboxQueue({ queue: "message-delivery" }),
    queueObservabilitySource.summarizeOutboxQueue({ queue: "file-scan" }),
    queueObservabilitySource.summarizeBillingSyncQueue({ queue: "billing-sync" }),
    automationRepository.listProactiveDeliveryAttemptsAsync()
  ]);
  return [
    ...(webhookDeliveryJournal.length ? [buildWebhookDeliveryWorkerObservability(webhookDeliveryJournal)] : []),
    buildLeadNotificationWorkerObservability(leadNotificationSummary),
    buildNotificationDeliveryWorkerObservability(browserPushDescriptors),
    buildReportExportWorkerObservability(reportExportJobs),
    buildReportDigestWorkerObservability(scheduledDigestDescriptors),
    buildProactiveDeliveryWorkerObservability(proactiveDeliveryAttempts),
    buildOutboxWorkerObservability(outboxSummary),
    buildFileScanScannerWorkerObservability(fileScanSummary),
    buildBillingSyncWorkerObservability(billingSyncSummary)
  ];
}

function buildProactiveDeliveryWorkerObservability(
  attempts: AutomationProactiveDeliveryAttempt[]
): WorkerObservability {
  const runningStatuses = new Set(["claimed", "planning", "running"]);
  const failedStatuses = new Set(["dead_lettered", "failed"]);
  const queueDepth = attempts.filter((attempt) => runningStatuses.has(attempt.status)).length;
  const deadLetterCount = attempts.filter((attempt) => failedStatuses.has(attempt.status)).length;
  const latest = [...attempts].sort((left, right) => right.attemptedAt.localeCompare(left.attemptedAt))[0];
  const updatedAt = latest ? normalizeTimestamp(latest.attemptedAt) : new Date(0).toISOString();

  return {
    deadLetterCount,
    evidenceSource: "automation.proactiveDeliveryAttempts",
    health: workerQueueHealth(queueDepth, deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.descriptorId,
      eventType: `proactive.delivery.${latest.status}`,
      status: latest.status,
      traceId: latest.traceId
    } : null,
    queue: "proactive-delivery",
    queueDepth,
    updatedAt,
    workerId: "proactive-delivery-worker"
  };
}

function buildWebhookDeliveryWorkerObservability(journal: WebhookDeliveryJournalEntry[]): WorkerObservability {
  const queueDepth = journal.filter((entry) => ["queued", "retry_scheduled", "publishing"].includes(entry.status)).length;
  const deadLetterCount = journal.filter((entry) => entry.status === "dead_lettered").length;
  const latest = [...journal].sort((left, right) => deliveryJournalTimestamp(right).localeCompare(deliveryJournalTimestamp(left)))[0];
  const updatedAt = latest ? deliveryJournalTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount,
    evidenceSource: "integration.webhookDeliveryJournal",
    health: workerQueueHealth(queueDepth, deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.deliveryId,
      eventType: latest.eventType,
      status: latest.status,
      traceId: latest.traceId
    } : null,
    queue: "webhook-delivery",
    queueDepth,
    updatedAt,
    workerId: "webhook-delivery-worker"
  };
}

function deliveryJournalTimestamp(entry: WebhookDeliveryJournalEntry): string {
  return entry.lastAttemptAt ?? entry.lockedAt ?? entry.nextAttemptAt ?? entry.createdAt;
}

function buildLeadNotificationWorkerObservability(summary: PublicDemoRequestNotificationDescriptorSummary): WorkerObservability {
  const latest = summary.latestDescriptor;
  const updatedAt = latest ? leadNotificationTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount: summary.deadLetterCount,
    evidenceSource: "integration.publicDemoRequestNotificationDescriptors",
    health: workerQueueHealth(summary.queueDepth, summary.deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.id,
      eventType: latest.type,
      status: latest.status,
      traceId: latest.leadId
    } : null,
    queue: summary.queue,
    queueDepth: summary.queueDepth,
    updatedAt,
    workerId: "lead-notification-worker"
  };
}

function leadNotificationTimestamp(descriptor: PublicDemoRequestNotificationDescriptor): string {
  return descriptor.payload.delivery?.failedAt
    ?? descriptor.payload.delivery?.deliveredAt
    ?? descriptor.createdAt;
}

function buildNotificationDeliveryWorkerObservability(descriptors: NotificationDeliveryDescriptor[]): WorkerObservability {
  const queueDepth = descriptors.filter((descriptor) => descriptor.status === "queued").length;
  const deadLetterCount = descriptors.filter((descriptor) => descriptor.status === "failed").length;
  const latest = [...descriptors].sort((left, right) => notificationDeliveryTimestamp(right).localeCompare(notificationDeliveryTimestamp(left)))[0];
  const updatedAt = latest ? notificationDeliveryTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount,
    evidenceSource: "notifications.deliveryDescriptors",
    health: workerQueueHealth(queueDepth, deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.id,
      eventType: latest.type,
      status: latest.status,
      traceId: latest.traceId
    } : null,
    queue: "browser-push",
    queueDepth,
    updatedAt,
    workerId: "notification-delivery-worker"
  };
}

function notificationDeliveryTimestamp(descriptor: NotificationDeliveryDescriptor): string {
  return descriptor.deliveredAt
    ?? descriptor.failedAt
    ?? descriptor.updatedAt
    ?? descriptor.nextAttemptAt
    ?? descriptor.createdAt;
}

function buildReportExportWorkerObservability(jobs: ReportExportJob[]): WorkerObservability {
  const queueJobs = jobs.filter((job) => reportExportQueue(job) === "report-export");
  const deadLetterJobs = queueJobs.filter(isReportExportDeadLettered);
  const queueDepth = queueJobs.filter((job) => job.statusKey === "queued" || job.statusKey === "running").length;
  const deadLetterCount = deadLetterJobs.length;
  const evidenceJobs = deadLetterJobs.length ? deadLetterJobs : queueJobs;
  const latest = [...evidenceJobs].sort((left, right) => compareReportExportTimestamps(right, left))[0];
  const updatedAt = latest ? reportExportTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount,
    evidenceSource: "reports.exportJobs",
    health: workerQueueHealth(queueDepth, deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.id,
      eventType: "report.export",
      status: latest.statusKey,
      traceId: latest.backendQueueId ?? latest.auditId
    } : null,
    queue: "report-export",
    queueDepth,
    updatedAt,
    workerId: "report-export-worker"
  };
}

function buildReportDigestWorkerObservability(descriptors: ScheduledDigestDescriptorRecord[]): WorkerObservability {
  const queueDepth = descriptors.filter((descriptor) => descriptor.status === "due" || descriptor.status === "running").length;
  const deadLetterDescriptors = descriptors.filter((descriptor) => descriptor.status === "failed");
  const deadLetterCount = deadLetterDescriptors.length;
  const evidenceDescriptors = deadLetterDescriptors.length ? deadLetterDescriptors : descriptors;
  const latest = [...evidenceDescriptors].sort((left, right) => compareScheduledDigestTimestamps(right, left))[0];
  const updatedAt = latest ? scheduledDigestTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount,
    evidenceSource: "reports.scheduledDigestDescriptors",
    health: workerQueueHealth(queueDepth, deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.id,
      eventType: "report.digest",
      status: latest.status,
      traceId: `${latest.scheduleId}:${latest.periodKey}`
    } : null,
    queue: "report-digest",
    queueDepth,
    updatedAt,
    workerId: "report-digest-worker"
  };
}

function buildOutboxWorkerObservability(summary: OutboxQueueSummary): WorkerObservability {
  return buildOutboxQueueWorkerObservability(summary, "outbox-worker");
}

function buildFileScanScannerWorkerObservability(summary: OutboxQueueSummary): WorkerObservability {
  return buildOutboxQueueWorkerObservability(summary, "file-scan-scanner-worker");
}

function buildOutboxQueueWorkerObservability(summary: OutboxQueueSummary, workerId: string): WorkerObservability {
  const latest = summary.latestEvent;
  const updatedAt = latest ? outboxQueueTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount: summary.deadLetterCount,
    evidenceSource: "database.outboxEvents",
    health: workerQueueHealth(summary.queueDepth, summary.deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.id,
      eventType: latest.type,
      status: latest.status,
      traceId: latest.traceId
    } : null,
    queue: summary.queue,
    queueDepth: summary.queueDepth,
    updatedAt,
    workerId
  };
}

function buildBillingSyncWorkerObservability(summary: BillingSyncQueueSummary): WorkerObservability {
  const latest = summary.latestJob;
  const updatedAt = latest ? billingSyncQueueTimestamp(latest) : new Date(0).toISOString();

  return {
    deadLetterCount: summary.deadLetterCount,
    evidenceSource: "database.billingSyncJobs",
    health: workerQueueHealth(summary.queueDepth, summary.deadLetterCount),
    lastDelivery: latest ? {
      attemptedAt: updatedAt,
      deliveryId: latest.id,
      eventType: billingSyncEventType(latest),
      status: latest.status,
      traceId: latest.traceId
    } : null,
    queue: summary.queue,
    queueDepth: summary.queueDepth,
    updatedAt,
    workerId: "billing-sync-worker"
  };
}

function reportExportQueue(job: ReportExportJob): string {
  return typeof job.queue === "string" && job.queue.trim() ? job.queue.trim() : "report-export";
}

function reportExportTimestamp(job: ReportExportJob): string {
  return normalizeTimestamp(job.deadLetteredAt ?? job.createdAt);
}

function isReportExportDeadLettered(job: ReportExportJob): boolean {
  return job.statusKey === "error" || job.statusKey === "expired";
}

function compareReportExportTimestamps(left: ReportExportJob, right: ReportExportJob): number {
  return compareTimestampStrings(reportExportTimestamp(left), reportExportTimestamp(right));
}

function scheduledDigestTimestamp(descriptor: ScheduledDigestDescriptorRecord): string {
  return normalizeTimestamp(descriptor.updatedAt ?? descriptor.dueAt ?? descriptor.createdAt);
}

function compareScheduledDigestTimestamps(left: ScheduledDigestDescriptorRecord, right: ScheduledDigestDescriptorRecord): number {
  return compareTimestampStrings(scheduledDigestTimestamp(left), scheduledDigestTimestamp(right));
}

function outboxQueueTimestamp(event: StoredOutboxEvent): string {
  return event.publishedAt
    ?? event.deadLetteredAt
    ?? event.lockedAt
    ?? event.nextAttemptAt
    ?? event.occurredAt;
}

function billingSyncQueueTimestamp(job: StoredBillingSyncJob): string {
  return job.publishedAt
    ?? job.deadLetteredAt
    ?? job.lockedAt
    ?? job.nextAttemptAt
    ?? job.createdAt;
}

function billingSyncEventType(job: StoredBillingSyncJob): string {
  const eventType = typeof job.payload.eventType === "string" ? job.payload.eventType.trim() : "";
  return eventType || "billing.sync";
}

function compareTimestampStrings(leftTimestamp: string, rightTimestamp: string): number {
  const leftTime = Date.parse(leftTimestamp);
  const rightTime = Date.parse(rightTimestamp);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return leftTimestamp.localeCompare(rightTimestamp);
}

function normalizeTimestamp(value: string | null | undefined): string {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString();
}

function workerQueueHealth(queueDepth: number, deadLetterCount: number): WorkerObservability["health"] {
  if (deadLetterCount > 0) {
    return {
      reason: "dead_lettered_deliveries_present",
      status: "blocked"
    };
  }

  if (queueDepth > 0) {
    return {
      reason: "pending_deliveries_present",
      status: "degraded"
    };
  }

  return {
    reason: "no_pending_deliveries",
    status: "healthy"
  };
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
