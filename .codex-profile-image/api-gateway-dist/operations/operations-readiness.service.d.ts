import { type BillingSyncQueueSummaryStore, type OutboxQueueSummaryStore } from "@support-communication/database";
import { type BackendEnvelope } from "@support-communication/envelope";
import { AutomationRepository } from "../automation/automation.repository.js";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
import { NotificationRepository } from "../notifications/notification.repository.js";
import { ReportRepository } from "../reports/report.repository.js";
import { OperationsRepository } from "./operations.repository.js";
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
interface WorkerQueueObservabilitySource extends BillingSyncQueueSummaryStore, OutboxQueueSummaryStore {
}
export declare class OperationsReadinessService {
    private readonly operationsRepository;
    private readonly integrationRepository;
    private readonly notificationRepository;
    private readonly reportRepository;
    private readonly queueObservabilitySource;
    private readonly automationRepository;
    private readonly loadTestIdempotency;
    private readonly restoreCheckIdempotency;
    private readonly deadLetterIdempotency;
    constructor(operationsRepository?: OperationsRepository, integrationRepository?: IntegrationRepository, notificationRepository?: NotificationRepository, reportRepository?: ReportRepository, queueObservabilitySource?: WorkerQueueObservabilitySource, automationRepository?: AutomationRepository);
    fetchReadinessDashboard(filters?: ReadinessFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    queueLoadTestRun(payload: LoadTestRunPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    queueRestoreCheck(payload: RestoreCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    checkMigrationRollback(payload: RollbackCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchDeadLetterDashboard(filters?: DeadLetterFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    replayDeadLetterMessage(payload: DeadLetterReplayPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchSecurityReview(filters?: SecurityReviewFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
}
export {};
