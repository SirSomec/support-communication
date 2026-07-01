import { createHash } from "node:crypto";
import { redactExportedDescriptor } from "@support-communication/envelope";

export interface ReportCsvColumn {
  id: string;
  label: string;
}

export interface ReportCsvSerializationInput {
  columns: ReportCsvColumn[];
  rows: Array<Record<string, unknown>>;
}

export interface ReportObjectStoragePutInput {
  body: string;
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

export interface ReportObjectStorageWriter {
  putObject(input: ReportObjectStoragePutInput): Promise<ReportObjectStoragePutResult>;
}

export type ReportObjectStorageAdapter = Partial<ReportObjectStorageWriter>;

export interface DeterministicReportObjectStorageObject extends ReportObjectStoragePutInput, ReportObjectStoragePutResult {}

export interface DeterministicReportObjectStorageAdapter extends ReportObjectStorageWriter {
  listObjects(): DeterministicReportObjectStorageObject[];
  readObject(objectKey: string): DeterministicReportObjectStorageObject | undefined;
}

export interface DeterministicReportObjectStorageAdapterOptions {
  now?: () => Date;
}

export interface ReportExportObjectWriteInput {
  body: string;
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

export function serializeReportRowsAsCsv(input: ReportCsvSerializationInput): string {
  const header = input.columns.map((column) => escapeCsvCell(column.label)).join(",");
  const rows = input.rows.map((row) =>
    input.columns.map((column) => escapeCsvCell(row[column.id])).join(",")
  );

  return [header, ...rows].join("\r\n");
}

export function createReportObjectStoragePort(adapter: ReportObjectStorageAdapter): ReportObjectStorageWriter {
  if (typeof adapter.putObject !== "function") {
    throw new Error("report_object_storage_put_required");
  }

  return {
    putObject(input) {
      return adapter.putObject!(input);
    }
  };
}

export function createDeterministicReportObjectStorageAdapter(
  options: DeterministicReportObjectStorageAdapterOptions = {}
): DeterministicReportObjectStorageAdapter {
  const objects = new Map<string, DeterministicReportObjectStorageObject>();
  const now = options.now ?? (() => new Date("2026-06-30T10:00:00.000Z"));

  return {
    listObjects() {
      return [...objects.values()].map(clone);
    },

    async putObject(input) {
      const stored: DeterministicReportObjectStorageObject = {
        body: input.body,
        checksum: `sha256:${createHash("sha256").update(input.body).digest("hex")}`,
        contentType: input.contentType,
        metadata: {
          format: input.metadata.format,
          jobId: input.metadata.jobId,
          metricDefinitionVersion: input.metadata.metricDefinitionVersion
        },
        objectKey: input.objectKey,
        sizeBytes: Buffer.byteLength(input.body),
        writtenAt: now().toISOString()
      };
      objects.set(stored.objectKey, stored);

      return {
        checksum: stored.checksum,
        sizeBytes: stored.sizeBytes,
        writtenAt: stored.writtenAt
      };
    },

    readObject(objectKey) {
      return clone(objects.get(objectKey));
    }
  };
}

export function serializeReportRowsAsJson(input: ReportCsvSerializationInput): string {
  return JSON.stringify(
    {
      columns: input.columns.map((column) => ({
        id: column.id,
        label: column.label
      })),
      rows: input.rows.map((row) =>
        Object.fromEntries(input.columns.map((column) => [column.id, row[column.id] ?? null]))
      )
    },
    null,
    2
  );
}

export async function writeReportExportObject(input: ReportExportObjectWriteInput): Promise<ReportExportObjectDescriptor> {
  const written = await input.storage.putObject({
    body: input.body,
    contentType: input.contentType,
    metadata: {
      format: input.format,
      jobId: input.jobId,
      metricDefinitionVersion: input.metricDefinitionVersion
    },
    objectKey: input.objectKey
  });

  return {
    checksum: written.checksum,
    contentType: input.contentType,
    objectKey: input.objectKey,
    sizeBytes: written.sizeBytes,
    writtenAt: written.writtenAt
  };
}

export async function createReportExportFileDescriptor(input: ReportExportFileDescriptorInput): Promise<ReportExportFileDescriptor> {
  const signedDownload = await input.signDownload({
    contentType: input.contentType,
    fileName: input.fileName,
    jobId: input.jobId,
    objectKey: input.objectKey
  });

  return redactExportedDescriptor({
    checksum: input.checksum,
    contentType: input.contentType,
    downloadUrl: signedDownload.downloadUrl,
    expiresAt: signedDownload.expiresAt,
    fileName: input.fileName,
    jobId: input.jobId,
    metricDefinitionVersion: input.metricDefinitionVersion,
    objectKeyExposed: false as const,
    permissionRequired: input.permissionRequired,
    sizeBytes: input.sizeBytes,
    writtenAt: input.writtenAt
  });
}

export async function executeCsvReportExport(input: CsvReportExportExecutionInput): Promise<ReportExportObjectDescriptor> {
  return writeReportExportObject({
    body: serializeReportRowsAsCsv({
      columns: input.columns,
      rows: input.rows
    }),
    contentType: "text/csv",
    format: "csv",
    jobId: input.jobId,
    metricDefinitionVersion: input.metricDefinitionVersion,
    objectKey: input.objectKey,
    storage: input.storage
  });
}

export async function executeJsonReportExport(input: JsonReportExportExecutionInput): Promise<ReportExportObjectDescriptor> {
  return writeReportExportObject({
    body: serializeReportRowsAsJson({
      columns: input.columns,
      rows: input.rows
    }),
    contentType: "application/json",
    format: "json",
    jobId: input.jobId,
    metricDefinitionVersion: input.metricDefinitionVersion,
    objectKey: input.objectKey,
    storage: input.storage
  });
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
