import { type BackendEnvelope } from "@support-communication/envelope";
import { type ReportObjectStorageReader, type ReportObjectStorageWriter } from "./report-export.worker.js";
import { type ReportObjectStorageDownloadSigner } from "./report-object-storage.js";
import { ReportRepository } from "./report.repository.js";
import { type ConversationReportFilters } from "./report-conversation-filters.js";
interface ReportWorkspaceFilters extends ConversationReportFilters {
    channel?: string;
    period?: string;
    reportType?: string;
    timezoneOffsetMinutes?: number | string;
}
export interface RoutingActivityReportFilters {
    channel?: string;
    eventType?: string;
    operatorId?: string;
    period?: string;
}
interface RequestReportExportPayload {
    channel?: string;
    columns?: string[];
    filters?: Record<string, unknown>;
    format?: string;
    idempotencyKey?: string;
    period?: string;
    reportType?: string;
}
interface SaveSavedReportTemplatePayload {
    columns?: string[];
    filters?: Record<string, unknown>;
    idempotencyKey?: string;
    name?: string;
    reportType?: string;
    visibility?: {
        permissions?: string[];
        roles?: string[];
        scope: "private" | "roles" | "permissions";
    };
}
export interface ReportRequestContext {
    requesterPermissions?: string[];
    requesterRoles?: string[];
    requesterUserId?: string;
    tenantId?: string;
}
interface RetryExportPayload {
    jobId: string;
    reason?: string;
}
interface DeadLetterExportPayload {
    failureCode: string;
    failureMessage: string;
    jobId: string;
}
interface ReportQueryPayload {
    metricKey?: string;
    parameters?: {
        channel?: string;
        period?: string;
        timezoneOffsetMinutes?: number | string;
    };
    tenantId?: string;
}
interface ReportServiceOptions {
    now?: () => Date;
    objectStorage?: ReportObjectStorageReader & Partial<ReportObjectStorageWriter & ReportObjectStorageDownloadSigner>;
}
export declare class ReportService {
    private readonly reportRepository;
    private readonly idempotencyIndex;
    private readonly now;
    private readonly objectStorage;
    constructor(reportRepository?: ReportRepository, options?: ReportServiceOptions);
    private readWorkspaceCatalog;
    private metricDefinitionVersion;
    fetchRoutingActivityReport(filters?: RoutingActivityReportFilters, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchReportWorkspace(filters?: ReportWorkspaceFilters, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private buildTenantConversationWorkspace;
    executeReportQuery(payload: ReportQueryPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveSavedReportTemplate(payload: SaveSavedReportTemplatePayload, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    getSavedReportTemplate(templateId: string, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    requestReportExport(payload: RequestReportExportPayload, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private finalizeDialogTranscriptExport;
    private writeDialogTranscriptExportFile;
    retryReportExport(payload: RetryExportPayload, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    deadLetterReportExport(payload: DeadLetterExportPayload, context?: ReportRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    getExportFileDescriptor(jobId: string, context?: {
        canDownload?: boolean;
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    getExportFileDownload(jobId: string, context?: {
        canDownload?: boolean;
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    private materializeReadyExportFile;
    private findExportJob;
    private findIdempotencyRequest;
    private currentExportJobs;
    private signReportDownload;
}
export {};
