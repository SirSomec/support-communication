import { StreamableFile } from "@nestjs/common";
import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ReportService } from "./report.service.js";
export declare class ReportController {
    private readonly reportService;
    constructor(reportService: ReportService);
    fetchReportWorkspace(query: {
        channel?: string;
        operatorId?: string;
        outcome?: string;
        period?: string;
        queueId?: string;
        resolutionOutcome?: string;
        reportType?: string;
        status?: string;
        teamId?: string;
        timezoneOffsetMinutes?: string;
        topic?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchRoutingActivityReport(query: {
        channel?: string;
        eventType?: string;
        operatorId?: string;
        period?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    requestReportExport(payload: {
        channel?: string;
        columns?: string[];
        filters?: Record<string, unknown>;
        format?: string;
        idempotencyKey?: string;
        period?: string;
        reportType?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveSavedReportTemplate(payload: {
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
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    getSavedReportTemplate(templateId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    retryReportExport(jobId: string, payload: {
        reason?: string;
    } | undefined, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    getExportFileDescriptor(jobId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    downloadExportFile(jobId: string, request: TenantOperatorRequest & ServiceAdminRequest, response: {
        setHeader(name: string, value: string): void;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>> | StreamableFile>;
}
