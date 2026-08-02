import { ReportRepository } from "./report.repository.js";
import type { ReportExportJob } from "./report.types.js";
export interface ReportCsvColumn {
    id: string;
    label: string;
}
export interface ReportCsvSerializationInput {
    columns: ReportCsvColumn[];
    rows: Array<Record<string, unknown>>;
}
export type ReportObjectStorageBody = string | Buffer;
export interface ReportObjectStoragePutInput {
    body: ReportObjectStorageBody;
    contentType: string;
    metadata: {
        format: string;
        jobId: string;
        metricDefinitionVersion: string;
    };
    objectKey: string;
}
export interface ReportObjectStoragePutResult {
    checksum: string;
    sizeBytes: number;
    writtenAt: string;
}
export interface ReportObjectStorageGetInput {
    objectKey: string;
}
export interface ReportObjectStorageGetResult {
    body: ReportObjectStorageBody;
    contentType?: string;
    sizeBytes: number;
}
export interface ReportObjectStorageWriter {
    putObject(input: ReportObjectStoragePutInput): Promise<ReportObjectStoragePutResult>;
}
export interface ReportObjectStorageReader {
    getObject(input: ReportObjectStorageGetInput): Promise<ReportObjectStorageGetResult | undefined>;
}
export type ReportObjectStorageAdapter = Partial<ReportObjectStorageWriter>;
export interface DeterministicReportObjectStorageObject extends ReportObjectStoragePutInput, ReportObjectStoragePutResult {
}
export interface DeterministicReportObjectStorageAdapter extends ReportObjectStorageReader, ReportObjectStorageWriter {
    listObjects(): DeterministicReportObjectStorageObject[];
    readObject(objectKey: string): DeterministicReportObjectStorageObject | undefined;
}
export interface DeterministicReportObjectStorageAdapterOptions {
    now?: () => Date;
}
export interface LocalReportObjectStorageAdapterOptions {
    now?: () => Date;
    rootDir: string;
}
export interface ReportExportObjectWriteInput {
    body: ReportObjectStorageBody;
    contentType: string;
    format: string;
    jobId: string;
    metricDefinitionVersion: string;
    objectKey: string;
    storage: ReportObjectStorageWriter;
}
export interface ReportExportObjectDescriptor extends ReportObjectStoragePutResult {
    contentType: string;
    objectKey: string;
}
export interface ReportExportDownloadSignInput {
    contentType: string;
    fileName: string;
    jobId: string;
    objectKey: string;
}
export interface ReportExportDownloadSignResult {
    downloadUrl: string;
    expiresAt: string;
}
export interface ReportExportFileDescriptorInput extends ReportExportObjectDescriptor {
    fileName: string;
    jobId: string;
    metricDefinitionVersion: string;
    permissionRequired: string;
    signDownload(input: ReportExportDownloadSignInput): Promise<ReportExportDownloadSignResult>;
}
export interface ReportExportFileDescriptor {
    checksum: string;
    contentType: string;
    downloadUrl: string;
    expiresAt: string;
    fileName: string;
    jobId: string;
    metricDefinitionVersion: string;
    objectKeyExposed: false;
    permissionRequired: string;
    sizeBytes: number;
    writtenAt: string;
}
export interface CsvReportExportExecutionInput extends ReportCsvSerializationInput {
    jobId: string;
    metricDefinitionVersion: string;
    objectKey: string;
    storage: ReportObjectStorageWriter;
}
export interface JsonReportExportExecutionInput extends ReportCsvSerializationInput {
    jobId: string;
    metricDefinitionVersion: string;
    objectKey: string;
    storage: ReportObjectStorageWriter;
}
export interface XlsxReportExportExecutionInput extends ReportCsvSerializationInput {
    jobId: string;
    metricDefinitionVersion: string;
    objectKey: string;
    storage: ReportObjectStorageWriter;
}
export interface ReportExportWorkerOnceInput {
    leaseMs?: number;
    limit?: number;
    now?: Date;
    queue?: string;
    reportRepository: ReportRepository;
    storage: ReportObjectStorageWriter;
}
export interface ReportExportWorkerResult {
    failed: number;
    ready: number;
    scanned: number;
}
export declare function serializeReportRowsAsCsv(input: ReportCsvSerializationInput): string;
export declare function createReportObjectStoragePort(adapter: ReportObjectStorageAdapter): ReportObjectStorageWriter;
export declare function createDeterministicReportObjectStorageAdapter(options?: DeterministicReportObjectStorageAdapterOptions): DeterministicReportObjectStorageAdapter;
export declare function createLocalReportObjectStorageAdapter(options: LocalReportObjectStorageAdapterOptions): ReportObjectStorageReader & ReportObjectStorageWriter;
export declare function serializeReportRowsAsJson(input: ReportCsvSerializationInput): string;
export declare function serializeReportRowsAsXlsx(input: ReportCsvSerializationInput): Buffer;
export declare function writeReportExportObject(input: ReportExportObjectWriteInput): Promise<ReportExportObjectDescriptor>;
export declare function createReportExportFileDescriptor(input: ReportExportFileDescriptorInput): Promise<ReportExportFileDescriptor>;
export declare function executeCsvReportExport(input: CsvReportExportExecutionInput): Promise<ReportExportObjectDescriptor>;
export declare function executeJsonReportExport(input: JsonReportExportExecutionInput): Promise<ReportExportObjectDescriptor>;
export declare function executeXlsxReportExport(input: XlsxReportExportExecutionInput): Promise<ReportExportObjectDescriptor>;
export declare function executeReportExportWorkerOnce(input: ReportExportWorkerOnceInput): Promise<ReportExportWorkerResult>;
export declare function reportSnapshotAt(job: ReportExportJob): Date;
