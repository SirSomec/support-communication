import type { ReportExportJob } from "./report.types.js";
export interface ReportIdempotencyRecord {
    fingerprint: string;
    jobId: string;
    key: string;
    tenantId: string;
}
export type ReportExportJobIdempotencyWriteResult = {
    idempotencyKey: ReportIdempotencyRecord;
    job: ReportExportJob;
    status: "created" | "duplicate";
} | {
    idempotencyKey: ReportIdempotencyRecord;
    status: "conflict";
};
export interface ClaimQueuedReportExportJobsInput {
    leaseMs?: number;
    limit?: number;
    now?: Date;
    queue?: string;
}
export interface ClaimScheduledDigestDescriptorsInput {
    leaseMs?: number;
    limit?: number;
    now: Date;
    tenantId?: string;
}
export interface MetricDefinitionRecord {
    createdAt: string;
    description: string;
    id: string;
    key: string;
    name: string;
    source: string;
    tenantId: string;
    unit: string;
    updatedAt: string;
}
export interface MetricDefinitionFilters {
    key?: string;
    tenantId?: string;
}
export type MetricVersionStatus = "active" | "draft" | "retired";
export interface MetricVersionRecord {
    createdAt: string;
    definitionId: string;
    id: string;
    queryKey: string;
    status: MetricVersionStatus;
    tenantId: string;
    updatedAt: string;
    version: string;
}
export interface MetricVersionFilters {
    definitionId?: string;
    tenantId?: string;
}
export interface MetricTenantOverrideRecord {
    createdAt: string;
    definitionId: string;
    id: string;
    metricVersionId: string;
    reason: string;
    tenantId: string;
    updatedAt: string;
}
export interface MetricTenantOverrideFilters {
    definitionId?: string;
    tenantId?: string;
}
export type ReportQueryExecutionStatus = "completed" | "failed" | "running";
export interface ReportQueryExecutionRecord {
    failureEnvelope?: {
        code: string;
        message: string;
    };
    id: string;
    metricKey: string;
    parameters?: Record<string, unknown>;
    status: ReportQueryExecutionStatus;
}
export interface ReportFileDescriptorRecord {
    checksum: string;
    contentType: string;
    createdAt: string;
    fileName: string;
    format: string;
    id: string;
    jobId: string;
    metricDefinitionVersion: string;
    objectKey: string;
    sizeBytes: number;
    tenantId: string;
    writtenAt: string;
}
export interface ReportNotificationDescriptorRecord {
    createdAt: string;
    eventType: "export.ready";
    exportJobId: string;
    id: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    status: "queued";
    tenantId: string;
}
export interface SavedReportTemplateRecord {
    columns: string[];
    createdAt: string;
    filters: Record<string, unknown>;
    id: string;
    name: string;
    ownerUserId: string;
    reportType: string;
    tenantId: string;
    updatedAt: string;
    visibility: SavedReportTemplateVisibility;
}
export type SavedReportTemplateVisibilityScope = "private" | "roles" | "permissions";
export interface SavedReportTemplateVisibility {
    permissions?: string[];
    roles?: string[];
    scope: SavedReportTemplateVisibilityScope;
}
export interface SavedReportTemplateFilters {
    requesterPermissions?: string[];
    requesterRoles?: string[];
    requesterUserId?: string;
    tenantId?: string;
}
export type ScheduledDigestStatus = "due" | "running" | "completed" | "failed";
export interface ScheduledDigestDescriptorRecord {
    createdAt: string;
    dueAt: string;
    id: string;
    periodKey: string;
    reportType: string;
    scheduleId: string;
    status: ScheduledDigestStatus;
    tenantId: string;
    updatedAt: string;
}
export interface ScheduledDigestDescriptorFilters {
    dueBefore?: string;
    status?: ScheduledDigestStatus;
    tenantId?: string;
}
export interface ExportRetryAuditEvent {
    action: "report.export.retry";
    at: string;
    auditId: string;
    backendQueueId: string;
    format: string;
    immutable: true;
    jobId: string;
    metricDefinitionVersion: string;
    nextStatusKey: string;
    previousStatusKey: string;
    queue: string;
    reasonCode: "operator_requested";
}
export interface ReportWorkspaceCatalog {
    metricDefinitionVersion: string;
    reportBars: unknown[];
    reportChartBlocks: unknown[];
    reportColumnOptions: unknown[];
    reportRows: unknown[];
    rescueOutcomeSummary: unknown[];
    rescueReportRows: unknown[];
}
export interface ConversationTranscriptSourceRow {
    channel: string;
    clientName: string;
    createdAt: string;
    id: string;
    messages: Array<{
        author?: string;
        createdAt: string;
        id: string;
        side?: string;
        text: string;
        time: string;
        type?: string;
    }>;
    operatorId?: string;
    operatorName?: string;
    rating?: {
        createdAt: string;
        scale: string;
        score: number | null;
    };
    resolutionOutcome?: string;
    status: string;
    topic: string;
    updatedAt: string;
}
export interface ConversationFacetSourceRow {
    id: string;
    operatorId?: string;
    operatorName?: string;
    status: string;
    topic: string;
}
export interface ConversationReportSourceRow {
    channel: string;
    createdAt: string;
    id: string;
    lifecycleEvents?: Array<{
        data?: Record<string, unknown>;
        eventType: string;
        id?: string;
        ingestedAt?: string;
        occurredAt: string;
        source?: string;
    }>;
    messages: Array<{
        createdAt: string;
        id: string;
        side?: string;
        text: string;
        time: string;
        type?: string;
    }>;
    operatorId?: string;
    operatorName?: string;
    queueId?: string;
    slaTone: string;
    status: string;
    teamId?: string;
    topic: string;
    updatedAt: string;
}
export type RoutingActivityEventType = "assignment" | "transfer";
export interface RoutingActivityReportSourceRow {
    channel: string;
    conversationId: string;
    eventKind: RoutingActivityEventType;
    fromOperatorId?: string | null;
    id: string;
    occurredAt: string;
    source: string;
    tenantId: string;
    toOperatorId?: string | null;
}
export interface RoutingActivityReportSourceFilters {
    channel?: string;
    eventType?: RoutingActivityEventType;
    from: Date;
    operatorId?: string;
    tenantId: string;
    to: Date;
}
export interface ReportState {
    exportRetryAuditEvents: ExportRetryAuditEvent[];
    exportJobs: ReportExportJob[];
    idempotencyKeys: ReportIdempotencyRecord[];
    metricDefinitions: MetricDefinitionRecord[];
    metricTenantOverrides: MetricTenantOverrideRecord[];
    metricVersions: MetricVersionRecord[];
    reportFileDescriptors: ReportFileDescriptorRecord[];
    reportNotificationDescriptors: ReportNotificationDescriptorRecord[];
    reportQueryExecutions: ReportQueryExecutionRecord[];
    savedReportTemplates: SavedReportTemplateRecord[];
    scheduledDigestDescriptors: ScheduledDigestDescriptorRecord[];
    workspace: ReportWorkspaceCatalog;
}
export interface PrismaReportRepositoryOptions {
    client: PrismaReportClient;
}
type MaybePromise<T> = T | Promise<T>;
interface PrismaReportDataClient {
    conversationLifecycleEvent?: {
        findMany(input: {
            orderBy: {
                occurredAt: "asc";
            };
            select: {
                conversation: {
                    select: {
                        channel: true;
                        operatorId: true;
                        operatorName: true;
                        queueId: true;
                        status: true;
                        teamId: true;
                        topic: true;
                    };
                };
                conversationId: true;
                data: true;
                eventType: true;
                id: true;
                ingestedAt: true;
                occurredAt: true;
                source: true;
            };
            where: {
                occurredAt: {
                    gte: Date;
                    lt: Date;
                };
                tenantId: string;
            };
        }): Promise<PrismaConversationLifecycleReportRow[]>;
    };
    conversation?: {
        findMany(input: {
            include: {
                messages: {
                    orderBy: {
                        createdAt: "asc";
                    };
                };
            };
            orderBy: {
                createdAt: "asc";
            };
            where: {
                createdAt: {
                    gte: Date;
                    lt: Date;
                };
                tenantId: string;
            };
        }): Promise<PrismaConversationReportRow[]>;
        findMany(input: {
            orderBy: {
                createdAt: "asc";
            };
            select: {
                id: true;
                operatorId: true;
                operatorName: true;
                status: true;
                topic: true;
            };
            where: {
                createdAt: {
                    gte: Date;
                    lt: Date;
                };
                tenantId: string;
            };
        }): Promise<PrismaConversationFacetRow[]>;
    };
    routingAnalyticsRow?: {
        findMany(input: {
            orderBy: {
                occurredAt: "asc";
            };
            where: PrismaRoutingActivityReportWhereInput;
        }): Promise<PrismaRoutingActivityReportRow[]>;
    };
    qualityRating?: {
        findMany(input: {
            orderBy: {
                createdAt: "asc";
            };
            where: {
                conversationId: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaQualityRatingReportRow[]>;
    };
    metricDefinition: {
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaMetricDefinitionWhereInput;
        }): Promise<PrismaMetricDefinitionRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaMetricDefinitionRow | null>;
        upsert(input: {
            create: PrismaMetricDefinitionCreateInput;
            update: PrismaMetricDefinitionUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaMetricDefinitionRow>;
    };
    metricVersion: {
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaMetricVersionWhereInput;
        }): Promise<PrismaMetricVersionRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaMetricVersionRow | null>;
        upsert(input: {
            create: PrismaMetricVersionCreateInput;
            update: PrismaMetricVersionUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaMetricVersionRow>;
    };
    metricTenantOverride: {
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaMetricTenantOverrideWhereInput;
        }): Promise<PrismaMetricTenantOverrideRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaMetricTenantOverrideRow | null>;
        upsert(input: {
            create: PrismaMetricTenantOverrideCreateInput;
            update: PrismaMetricTenantOverrideUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaMetricTenantOverrideRow>;
    };
    reportIdempotencyKey: {
        create(input: {
            data: PrismaReportIdempotencyKeyCreateInput;
        }): Promise<PrismaReportIdempotencyKeyRow>;
        findUnique(input: {
            where: PrismaReportIdempotencyKeyWhereUniqueInput;
        }): Promise<PrismaReportIdempotencyKeyRow | null>;
        upsert(input: {
            create: PrismaReportIdempotencyKeyCreateInput;
            update: PrismaReportIdempotencyKeyUpdateInput;
            where: PrismaReportIdempotencyKeyWhereUniqueInput;
        }): Promise<PrismaReportIdempotencyKeyRow>;
    };
    reportExportJob: {
        findMany(input: {
            orderBy: {
                createdAt: "asc" | "desc";
            };
            take?: number;
            where?: PrismaReportExportJobWhereInput;
        }): Promise<PrismaReportExportJobRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaReportExportJobRow | null>;
        updateMany(input: {
            data: Partial<PrismaReportExportJobUpdateInput> & {
                updatedAt?: Date;
            };
            where: PrismaReportExportJobWhereInput;
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaReportExportJobCreateInput;
            update: PrismaReportExportJobUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaReportExportJobRow>;
    };
    savedReportTemplate: {
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaSavedReportTemplateWhereInput;
        }): Promise<PrismaSavedReportTemplateRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaSavedReportTemplateRow | null>;
        upsert(input: {
            create: PrismaSavedReportTemplateCreateInput;
            update: PrismaSavedReportTemplateUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaSavedReportTemplateRow>;
    };
    reportQueryExecution: {
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
        }): Promise<PrismaReportQueryExecutionRow[]>;
        upsert(input: {
            create: PrismaReportQueryExecutionCreateInput;
            update: PrismaReportQueryExecutionUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaReportQueryExecutionRow>;
    };
    reportFileDescriptor: {
        deleteMany(input: {
            where: {
                jobId: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
        }): Promise<PrismaReportFileDescriptorRow[]>;
        findUnique(input: {
            where: {
                jobId: string;
            };
        }): Promise<PrismaReportFileDescriptorRow | null>;
        upsert(input: {
            create: PrismaReportFileDescriptorCreateInput;
            update: PrismaReportFileDescriptorUpdateInput;
            where: {
                jobId: string;
            };
        }): Promise<PrismaReportFileDescriptorRow>;
    };
    reportNotificationDescriptor: {
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
        }): Promise<PrismaReportNotificationDescriptorRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaReportNotificationDescriptorRow | null>;
        upsert(input: {
            create: PrismaReportNotificationDescriptorCreateInput;
            update: PrismaReportNotificationDescriptorUpdateInput;
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaReportNotificationDescriptorRow>;
    };
    scheduledDigestDescriptor: {
        findMany(input: {
            orderBy: {
                dueAt: "asc";
            };
            where?: PrismaScheduledDigestDescriptorWhereInput;
        }): Promise<PrismaScheduledDigestDescriptorRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaScheduledDigestDescriptorRow | null>;
        updateMany(input: {
            data: {
                status: string;
                updatedAt: Date;
            };
            where: PrismaScheduledDigestDescriptorWhereInput;
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaScheduledDigestDescriptorCreateInput;
            update: PrismaScheduledDigestDescriptorUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaScheduledDigestDescriptorRow>;
    };
    reportExportRetryAuditEvent: {
        findMany(input: {
            orderBy: {
                at: "desc";
            };
        }): Promise<PrismaReportExportRetryAuditEventRow[]>;
        upsert(input: {
            create: PrismaReportExportRetryAuditEventCreateInput;
            update: PrismaReportExportRetryAuditEventUpdateInput;
            where: {
                auditId: string;
            };
        }): Promise<PrismaReportExportRetryAuditEventRow>;
    };
}
export interface PrismaReportClient extends PrismaReportDataClient {
    $transaction<T>(callback: (transaction: PrismaReportDataClient) => Promise<T>, options?: {
        isolationLevel?: "Serializable";
    }): Promise<T>;
}
interface PrismaMetricDefinitionWhereInput {
    key?: string;
    tenantId?: string;
}
interface PrismaConversationReportRow {
    channel: string;
    createdAt: Date;
    id: string;
    name?: string;
    operatorId: string | null;
    operatorName: string | null;
    queueId: string | null;
    resolutionOutcome?: string | null;
    messages: Array<{
        author?: string | null;
        createdAt: Date;
        id: string;
        side: string | null;
        text: string;
        time: string;
        type: string | null;
    }>;
    slaTone: string;
    status: string;
    teamId: string | null;
    topic: string;
    updatedAt: Date;
}
interface PrismaQualityRatingReportRow {
    conversationId: string;
    createdAt: Date;
    scale: string;
    score: number | null;
}
interface PrismaConversationFacetRow {
    id: string;
    operatorId: string | null;
    operatorName: string | null;
    status: string;
    topic: string;
}
interface PrismaConversationLifecycleReportRow {
    conversation: {
        channel: string;
        operatorId: string | null;
        operatorName: string | null;
        queueId: string | null;
        status: string;
        teamId: string | null;
        topic: string;
    };
    conversationId: string;
    data: unknown;
    eventType: string;
    id: string;
    ingestedAt: Date;
    occurredAt: Date;
    source: string;
}
interface PrismaRoutingActivityReportWhereInput {
    channel?: string;
    eventKind: string | {
        in: string[];
    };
    occurredAt: {
        gte: Date;
        lt: Date;
    };
    OR?: Array<{
        fromOperatorId?: string;
        toOperatorId?: string;
    }>;
    tenantId: string;
}
interface PrismaRoutingActivityReportRow {
    channel: string;
    conversationId: string;
    eventKind: string;
    fromOperatorId: string | null;
    id: string;
    occurredAt: Date;
    source: string;
    tenantId: string;
    toOperatorId: string | null;
}
interface PrismaMetricDefinitionRow {
    createdAt: Date;
    description: string;
    id: string;
    key: string;
    name: string;
    source: string;
    tenantId: string;
    unit: string;
    updatedAt: Date;
}
interface PrismaMetricDefinitionCreateInput extends PrismaMetricDefinitionRow {
}
type PrismaMetricDefinitionUpdateInput = Omit<PrismaMetricDefinitionCreateInput, "createdAt" | "id">;
interface PrismaMetricVersionWhereInput {
    definitionId?: string;
    tenantId?: string;
}
interface PrismaMetricVersionRow {
    createdAt: Date;
    definitionId: string;
    id: string;
    queryKey: string;
    status: string;
    tenantId: string;
    updatedAt: Date;
    version: string;
}
interface PrismaMetricVersionCreateInput extends PrismaMetricVersionRow {
}
type PrismaMetricVersionUpdateInput = Omit<PrismaMetricVersionCreateInput, "createdAt" | "id">;
interface PrismaMetricTenantOverrideWhereInput {
    definitionId?: string;
    tenantId?: string;
}
interface PrismaMetricTenantOverrideRow {
    createdAt: Date;
    definitionId: string;
    id: string;
    metricVersionId: string;
    reason: string;
    tenantId: string;
    updatedAt: Date;
}
interface PrismaMetricTenantOverrideCreateInput extends PrismaMetricTenantOverrideRow {
}
type PrismaMetricTenantOverrideUpdateInput = Omit<PrismaMetricTenantOverrideCreateInput, "createdAt" | "id">;
interface PrismaReportIdempotencyKeyRow {
    fingerprint: string;
    jobId: string;
    key: string;
    tenantId: string;
}
interface PrismaReportIdempotencyKeyCreateInput extends PrismaReportIdempotencyKeyRow {
}
type PrismaReportIdempotencyKeyUpdateInput = Omit<PrismaReportIdempotencyKeyCreateInput, "key" | "tenantId">;
interface PrismaReportIdempotencyKeyWhereUniqueInput {
    tenantId_key: {
        key: string;
        tenantId: string;
    };
}
interface PrismaReportExportJobRow {
    auditId: string;
    backendQueueId: string | null;
    columns: string[];
    createdAt: Date;
    deadLetteredAt: Date | null;
    failureCode: string | null;
    failureMessage: string | null;
    fileName: string | null;
    filters: Record<string, unknown>;
    format: string;
    id: string;
    metricDefinitionVersion: string | null;
    name: string;
    period: string;
    progress: number;
    queue: string | null;
    requestedBy: string;
    rows: number;
    status: string;
    statusKey: string;
    tenantId: string;
    updatedAt: Date;
}
interface PrismaReportExportJobWhereInput {
    id?: string;
    queue?: string;
    statusKey?: string | {
        in: string[];
    };
    tenantId?: string;
    updatedAt?: Date;
}
interface PrismaReportExportJobCreateInput extends Omit<PrismaReportExportJobRow, "updatedAt"> {
    updatedAt?: Date;
}
type PrismaReportExportJobUpdateInput = Omit<PrismaReportExportJobCreateInput, "createdAt" | "id">;
interface PrismaSavedReportTemplateWhereInput {
    tenantId?: string;
}
interface PrismaSavedReportTemplateRow {
    columns: string[];
    createdAt: Date;
    filters: Record<string, unknown>;
    id: string;
    name: string;
    ownerUserId: string;
    reportType: string;
    tenantId: string;
    updatedAt: Date;
    visibilityPermissions: string[];
    visibilityRoles: string[];
    visibilityScope: string;
}
interface PrismaSavedReportTemplateCreateInput extends PrismaSavedReportTemplateRow {
}
type PrismaSavedReportTemplateUpdateInput = Omit<PrismaSavedReportTemplateCreateInput, "createdAt" | "id">;
interface PrismaReportQueryExecutionRow {
    createdAt: Date;
    failureCode: string | null;
    failureMessage: string | null;
    id: string;
    metricKey: string;
    parameters: Record<string, unknown> | null;
    status: string;
    updatedAt: Date;
}
interface PrismaReportQueryExecutionCreateInput extends PrismaReportQueryExecutionRow {
}
type PrismaReportQueryExecutionUpdateInput = Omit<PrismaReportQueryExecutionCreateInput, "createdAt" | "id">;
interface PrismaReportFileDescriptorRow {
    checksum: string;
    contentType: string;
    createdAt: Date;
    fileName: string;
    format: string;
    id: string;
    jobId: string;
    metricDefinitionVersion: string;
    objectKey: string;
    sizeBytes: number;
    tenantId: string;
    updatedAt: Date;
    writtenAt: Date;
}
interface PrismaReportFileDescriptorCreateInput extends PrismaReportFileDescriptorRow {
}
type PrismaReportFileDescriptorUpdateInput = Omit<PrismaReportFileDescriptorCreateInput, "createdAt" | "id">;
interface PrismaReportNotificationDescriptorRow {
    createdAt: Date;
    eventType: string;
    exportJobId: string;
    id: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    status: string;
    tenantId: string;
    updatedAt: Date;
}
interface PrismaReportNotificationDescriptorCreateInput extends PrismaReportNotificationDescriptorRow {
}
type PrismaReportNotificationDescriptorUpdateInput = Omit<PrismaReportNotificationDescriptorCreateInput, "createdAt" | "id">;
interface PrismaScheduledDigestDescriptorWhereInput {
    dueAt?: {
        lte: Date;
    };
    id?: string;
    status?: string;
    tenantId?: string;
    updatedAt?: Date;
}
interface PrismaScheduledDigestDescriptorRow {
    createdAt: Date;
    dueAt: Date;
    id: string;
    periodKey: string;
    reportType: string;
    scheduleId: string;
    status: string;
    tenantId: string;
    updatedAt: Date;
}
interface PrismaScheduledDigestDescriptorCreateInput extends PrismaScheduledDigestDescriptorRow {
}
type PrismaScheduledDigestDescriptorUpdateInput = Omit<PrismaScheduledDigestDescriptorCreateInput, "createdAt" | "id">;
interface PrismaReportExportRetryAuditEventRow {
    action: string;
    at: Date;
    auditId: string;
    backendQueueId: string;
    createdAt: Date;
    format: string;
    immutable: boolean;
    jobId: string;
    metricDefinitionVersion: string;
    nextStatusKey: string;
    previousStatusKey: string;
    queue: string;
    reasonCode: string;
}
interface PrismaReportExportRetryAuditEventCreateInput extends PrismaReportExportRetryAuditEventRow {
}
type PrismaReportExportRetryAuditEventUpdateInput = Omit<PrismaReportExportRetryAuditEventCreateInput, "auditId" | "createdAt">;
export declare class ReportRepository {
    private readonly store;
    private readonly prismaClient?;
    private constructor();
    static default(): ReportRepository;
    static useDefault(repository: ReportRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: ReportState): ReportRepository;
    static prisma({ client }: PrismaReportRepositoryOptions): ReportRepository;
    readState(): ReportState;
    readWorkspaceCatalog(): ReportWorkspaceCatalog;
    listConversationReportSourceRowsAsync(input: {
        from: Date;
        tenantId: string;
        to: Date;
    }): Promise<ConversationReportSourceRow[]>;
    listConversationFacetRowsAsync(input: {
        from: Date;
        tenantId: string;
        to: Date;
    }): Promise<ConversationFacetSourceRow[]>;
    listConversationTranscriptSourceRowsAsync(input: {
        from: Date;
        tenantId: string;
        to: Date;
    }): Promise<ConversationTranscriptSourceRow[]>;
    listRoutingActivityReportSourceRowsAsync(input: RoutingActivityReportSourceFilters): Promise<RoutingActivityReportSourceRow[]>;
    saveState(state: ReportState): ReportState;
    listExportJobs(): ReportExportJob[];
    listExportJobsAsync(filters?: {
        tenantId?: string;
    }): Promise<ReportExportJob[]>;
    claimQueuedExportJobsAsync(input?: ClaimQueuedReportExportJobsInput): Promise<ReportExportJob[]>;
    listMetricDefinitions(filters?: MetricDefinitionFilters): MaybePromise<MetricDefinitionRecord[]>;
    findMetricDefinition(metricId: string, filters?: MetricDefinitionFilters): MaybePromise<MetricDefinitionRecord | undefined>;
    listMetricVersions(filters?: MetricVersionFilters): MaybePromise<MetricVersionRecord[]>;
    findMetricVersion(versionId: string, filters?: MetricVersionFilters): MaybePromise<MetricVersionRecord | undefined>;
    findActiveMetricVersion(tenantId: string, definitionId: string): MaybePromise<MetricVersionRecord | undefined>;
    resolveMetricVersion(tenantId: string, definitionId: string): Promise<MetricVersionRecord | undefined>;
    listMetricTenantOverrides(filters?: MetricTenantOverrideFilters): MaybePromise<MetricTenantOverrideRecord[]>;
    listReportQueryExecutions(): ReportQueryExecutionRecord[];
    listReportQueryExecutionsAsync(): Promise<ReportQueryExecutionRecord[]>;
    listReportFileDescriptors(): ReportFileDescriptorRecord[];
    listReportFileDescriptorsAsync(): Promise<ReportFileDescriptorRecord[]>;
    listReportNotificationDescriptors(): ReportNotificationDescriptorRecord[];
    listReportNotificationDescriptorsAsync(): Promise<ReportNotificationDescriptorRecord[]>;
    findReportFileDescriptor(jobId: string): ReportFileDescriptorRecord | undefined;
    findReportFileDescriptorAsync(jobId: string): Promise<ReportFileDescriptorRecord | undefined>;
    listSavedReportTemplates(filters?: SavedReportTemplateFilters): MaybePromise<SavedReportTemplateRecord[]>;
    findSavedReportTemplate(templateId: string, filters?: SavedReportTemplateFilters): MaybePromise<SavedReportTemplateRecord | undefined>;
    listScheduledDigestDescriptors(filters?: ScheduledDigestDescriptorFilters): ScheduledDigestDescriptorRecord[];
    listScheduledDigestDescriptorsAsync(filters?: ScheduledDigestDescriptorFilters): Promise<ScheduledDigestDescriptorRecord[]>;
    claimScheduledDigestDescriptors(input: ClaimScheduledDigestDescriptorsInput): ScheduledDigestDescriptorRecord[];
    claimScheduledDigestDescriptorsAsync(input: ClaimScheduledDigestDescriptorsInput): Promise<ScheduledDigestDescriptorRecord[]>;
    findScheduledDigestDescriptor(descriptorId: string, filters?: ScheduledDigestDescriptorFilters): ScheduledDigestDescriptorRecord | undefined;
    findScheduledDigestDescriptorAsync(descriptorId: string, filters?: ScheduledDigestDescriptorFilters): Promise<ScheduledDigestDescriptorRecord | undefined>;
    deleteReportFileDescriptor(jobId: string): void;
    deleteReportFileDescriptorAsync(jobId: string): Promise<void>;
    findMetricTenantOverride(overrideId: string, filters?: MetricTenantOverrideFilters): MaybePromise<MetricTenantOverrideRecord | undefined>;
    saveExportJob(job: ReportExportJob): ReportExportJob;
    saveExportJobAsync(job: ReportExportJob): Promise<ReportExportJob>;
    saveExportJobWithIdempotency(job: ReportExportJob, idempotencyKey: ReportIdempotencyRecord): MaybePromise<ReportExportJobIdempotencyWriteResult>;
    saveRetriedExportJob(job: ReportExportJob, auditEvent: ExportRetryAuditEvent): {
        auditEvent: ExportRetryAuditEvent;
        job: ReportExportJob;
    };
    saveRetriedExportJobAsync(job: ReportExportJob, auditEvent: ExportRetryAuditEvent): Promise<{
        auditEvent: ExportRetryAuditEvent;
        job: ReportExportJob;
    }>;
    listExportRetryAuditEventsAsync(): Promise<ExportRetryAuditEvent[]>;
    findIdempotencyKey(tenantId: string, key: string): MaybePromise<ReportIdempotencyRecord | undefined>;
    saveIdempotencyKey(record: ReportIdempotencyRecord): MaybePromise<ReportIdempotencyRecord>;
    saveMetricDefinition(metric: MetricDefinitionRecord): MaybePromise<MetricDefinitionRecord>;
    saveMetricVersion(version: MetricVersionRecord): MaybePromise<MetricVersionRecord>;
    saveMetricTenantOverride(override: MetricTenantOverrideRecord): MaybePromise<MetricTenantOverrideRecord>;
    saveReportQueryExecution(execution: ReportQueryExecutionRecord): ReportQueryExecutionRecord;
    saveReportQueryExecutionAsync(execution: ReportQueryExecutionRecord): Promise<ReportQueryExecutionRecord>;
    saveReportFileDescriptor(descriptor: ReportFileDescriptorRecord): ReportFileDescriptorRecord;
    saveReportFileDescriptorAsync(descriptor: ReportFileDescriptorRecord): Promise<ReportFileDescriptorRecord>;
    saveSavedReportTemplate(template: SavedReportTemplateRecord): MaybePromise<SavedReportTemplateRecord>;
    saveReportNotificationDescriptor(descriptor: ReportNotificationDescriptorRecord): ReportNotificationDescriptorRecord;
    saveReportNotificationDescriptorAsync(descriptor: ReportNotificationDescriptorRecord): Promise<ReportNotificationDescriptorRecord>;
    saveScheduledDigestDescriptor(descriptor: ScheduledDigestDescriptorRecord): ScheduledDigestDescriptorRecord;
    saveScheduledDigestDescriptorAsync(descriptor: ScheduledDigestDescriptorRecord): Promise<ScheduledDigestDescriptorRecord>;
    private savePrismaExportJobWithIdempotency;
}
export declare function createEmptyReportState(): ReportState;
export {};
