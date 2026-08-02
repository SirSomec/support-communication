import { type BackendEnvelope } from "@support-communication/envelope";
import { ReportRepository, type ScheduledDigestDescriptorRecord } from "./report.repository.js";
import { ReportService } from "./report.service.js";
export interface ScheduledDigestClaimWorkerInput {
    leaseMs?: number;
    limit?: number;
    now: Date;
    reportRepository: ReportRepository;
    tenantId?: string;
}
export interface ScheduledDigestClaimWorkerResult {
    claimed: ScheduledDigestDescriptorRecord[];
}
export interface ScheduledDigestExportJobWorkerInput {
    descriptor: ScheduledDigestDescriptorRecord;
    now?: Date;
    reportRepository: ReportRepository;
    reportService: ReportService;
}
export interface ScheduledDigestExportJobWorkerResult {
    descriptor: ScheduledDigestDescriptorRecord;
    exportEnvelope: BackendEnvelope<Record<string, unknown>>;
}
export declare function claimDueScheduledDigestDescriptors(input: ScheduledDigestClaimWorkerInput): ScheduledDigestClaimWorkerResult;
export declare function claimDueScheduledDigestDescriptorsAsync(input: ScheduledDigestClaimWorkerInput): Promise<ScheduledDigestClaimWorkerResult>;
export declare function queueScheduledDigestExportJob(input: ScheduledDigestExportJobWorkerInput): Promise<ScheduledDigestExportJobWorkerResult>;
