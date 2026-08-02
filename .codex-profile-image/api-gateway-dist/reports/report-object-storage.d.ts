import { type ObjectStorageSignerSource } from "../workspace/object-storage.js";
import type { ObjectStorageSigner } from "../workspace/workspace.service.js";
import { type ReportObjectStorageReader, type ReportObjectStorageWriter } from "./report-export.worker.js";
export type ReportObjectStorageMode = "local" | "s3";
export interface ReportObjectStorageRuntimeSource extends ObjectStorageSignerSource {
    REPORT_EXPORT_OBJECT_ROOT?: string;
    REPORT_EXPORT_OBJECT_STORAGE_MODE?: string;
    RUNTIME_PROFILE?: string;
}
export interface ReportObjectStorageDownloadSigner {
    signDownload(input: {
        fileName: string;
        jobId: string;
        objectKey: string;
        tenantId: string;
    }): Promise<{
        downloadUrl: string;
        expiresAt: string;
    }>;
}
export type SharedReportObjectStorage = ReportObjectStorageReader & ReportObjectStorageWriter & ReportObjectStorageDownloadSigner;
export interface S3ReportObjectStorageAdapterOptions {
    fetch?: typeof fetch;
    now?: () => Date;
    signer?: ObjectStorageSigner;
}
export declare function createSharedReportObjectStorage(source?: ReportObjectStorageRuntimeSource, options?: S3ReportObjectStorageAdapterOptions): SharedReportObjectStorage;
export declare function resolveReportObjectStorageMode(source?: ReportObjectStorageRuntimeSource): ReportObjectStorageMode;
export declare function createS3ReportObjectStorageAdapter(source: ObjectStorageSignerSource, options?: S3ReportObjectStorageAdapterOptions): SharedReportObjectStorage;
