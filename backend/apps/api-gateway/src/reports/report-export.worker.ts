import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { redactExportedDescriptor } from "@support-communication/envelope";
import { ReportRepository, type ReportFileDescriptorRecord } from "./report.repository.js";
import { buildLiveReportWorkspace, type LiveReportConversation, type LiveReportWorkspaceOptions } from "./report-live-workspace.js";
import { REPORT_COLUMN_OPTIONS, REPORT_METRIC_DEFINITION_VERSION } from "./report-definition.js";
import {
  buildConversationReportEventWatermark,
  filterReportConversations,
  type ConversationReportEventWatermark
} from "./report-conversation-filters.js";
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

export interface DeterministicReportObjectStorageObject extends ReportObjectStoragePutInput, ReportObjectStoragePutResult {}

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
      return [...objects.values()].map(cloneStoredReportObject);
    },

    async getObject(input) {
      const object = objects.get(input.objectKey);
      return object ? cloneStoredReportObject(object) : undefined;
    },

    async putObject(input) {
      const stored: DeterministicReportObjectStorageObject = {
        body: cloneReportObjectBody(input.body),
        checksum: `sha256:${createHash("sha256").update(input.body).digest("hex")}`,
        contentType: input.contentType,
        metadata: {
          format: input.metadata.format,
          jobId: input.metadata.jobId,
          metricDefinitionVersion: input.metadata.metricDefinitionVersion
        },
        objectKey: input.objectKey,
        sizeBytes: reportObjectBodySize(input.body),
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
      const object = objects.get(objectKey);
      return object ? cloneStoredReportObject(object) : undefined;
    }
  };
}

export function createLocalReportObjectStorageAdapter(options: LocalReportObjectStorageAdapterOptions): ReportObjectStorageReader & ReportObjectStorageWriter {
  const rootDir = resolve(requireNonEmptyString(options.rootDir, "report_object_storage_root_required"));
  const now = options.now ?? (() => new Date());

  return {
    async getObject(input) {
      const target = resolveReportObjectPath(rootDir, input.objectKey);
      try {
        const body = await readFile(target);
        return {
          body,
          sizeBytes: body.length
        };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
        if (code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    },

    async putObject(input) {
      const target = resolveReportObjectPath(rootDir, input.objectKey);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, input.body);

      return {
        checksum: `sha256:${createHash("sha256").update(input.body).digest("hex")}`,
        sizeBytes: reportObjectBodySize(input.body),
        writtenAt: now().toISOString()
      };
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

export function serializeReportRowsAsXlsx(input: ReportCsvSerializationInput): Buffer {
  const sheetRows = [
    input.columns.map((column) => column.label),
    ...input.rows.map((row) => input.columns.map((column) => row[column.id] ?? null))
  ];
  const sheetData = sheetRows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => xlsxCell({
      address: `${xlsxColumnName(columnIndex + 1)}${rowNumber}`,
      value
    })).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");

  return createZipArchive([
    {
      body: [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">",
        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>",
        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>",
        "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>",
        "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>",
        "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>",
        "</Types>"
      ].join(""),
      name: "[Content_Types].xml"
    },
    {
      body: [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>",
        "</Relationships>"
      ].join(""),
      name: "_rels/.rels"
    },
    {
      body: [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">",
        "<sheets><sheet name=\"Report\" sheetId=\"1\" r:id=\"rId1\"/></sheets>",
        "</workbook>"
      ].join(""),
      name: "xl/workbook.xml"
    },
    {
      body: [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>",
        "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>",
        "</Relationships>"
      ].join(""),
      name: "xl/_rels/workbook.xml.rels"
    },
    {
      body: [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
        "<fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>",
        "<fills count=\"1\"><fill><patternFill patternType=\"none\"/></fill></fills>",
        "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>",
        "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>",
        "<cellXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/></cellXfs>",
        "</styleSheet>"
      ].join(""),
      name: "xl/styles.xml"
    },
    {
      body: [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
        `<sheetData>${sheetData}</sheetData>`,
        "</worksheet>"
      ].join(""),
      name: "xl/worksheets/sheet1.xml"
    }
  ]);
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

export async function executeXlsxReportExport(input: XlsxReportExportExecutionInput): Promise<ReportExportObjectDescriptor> {
  return writeReportExportObject({
    body: serializeReportRowsAsXlsx({
      columns: input.columns,
      rows: input.rows
    }),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    format: "xlsx",
    jobId: input.jobId,
    metricDefinitionVersion: input.metricDefinitionVersion,
    objectKey: input.objectKey,
    storage: input.storage
  });
}

export async function executeReportExportWorkerOnce(input: ReportExportWorkerOnceInput): Promise<ReportExportWorkerResult> {
  const now = input.now ?? new Date();
  const claimed = await input.reportRepository.claimQueuedExportJobsAsync({
    limit: input.limit,
    now,
    queue: input.queue
  });
  const result: ReportExportWorkerResult = {
    failed: 0,
    ready: 0,
    scanned: claimed.length
  };

  for (const job of claimed) {
    try {
      if (job.format !== "CSV" && job.format !== "XLSX") {
        throw new Error(`report_export_format_not_supported:${job.format}`);
      }

      const tenantId = reportExportTenantId(job);
      const fileName = reportExportFileName(job);
      const objectKey = `reports/${tenantId}/${job.id}/${fileName}`;
      const snapshot = await reportExportSnapshot(input.reportRepository, job);
      const rows = snapshot.rows;
      const exportInput = {
        columns: reportExportColumns(job),
        jobId: job.id,
        metricDefinitionVersion: job.metricDefinitionVersion ?? REPORT_METRIC_DEFINITION_VERSION,
        objectKey,
        rows,
        storage: input.storage
      };
      const object = job.format === "CSV"
        ? await executeCsvReportExport(exportInput)
        : await executeXlsxReportExport(exportInput);
      const descriptor = await input.reportRepository.saveReportFileDescriptorAsync(toReportFileDescriptor({
        descriptor: object,
        fileName,
        job,
        rows: rows.length,
        tenantId
      }));
      await input.reportRepository.saveExportJobAsync({
        ...job,
        fileName: descriptor.fileName,
        filters: {
          ...(job.filters ?? {}),
          eventWatermark: snapshot.eventWatermark
        },
        progress: 100,
        rows: rows.length,
        status: "Ready",
        statusKey: "ready"
      });
      result.ready += 1;
    } catch (error) {
      await input.reportRepository.saveExportJobAsync({
        ...job,
        failureCode: "report_export_worker_failed",
        failureMessage: error instanceof Error ? error.message : String(error),
        progress: 0,
        status: "Error",
        statusKey: "error"
      });
      await input.reportRepository.deleteReportFileDescriptorAsync(job.id);
      result.failed += 1;
    }
  }

  return result;
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

  if (Buffer.isBuffer(value)) {
    return Buffer.from(value) as T;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneReportObjectBody(body: ReportObjectStorageBody): ReportObjectStorageBody {
  return Buffer.isBuffer(body) ? Buffer.from(body) : body;
}

function cloneStoredReportObject(object: DeterministicReportObjectStorageObject): DeterministicReportObjectStorageObject {
  return {
    ...object,
    body: cloneReportObjectBody(object.body),
    metadata: { ...object.metadata }
  };
}

function reportObjectBodySize(body: ReportObjectStorageBody): number {
  return Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
}

function resolveReportObjectPath(rootDir: string, objectKey: string): string {
  const normalized = requireNonEmptyString(objectKey, "report_object_key_required").replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.split("/").some((segment) => segment === ".." || segment === "" || segment.includes("\0"))) {
    throw new Error("report_object_key_invalid");
  }

  const target = resolve(rootDir, ...normalized.split("/"));
  const boundary = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  if (target !== rootDir && !target.startsWith(boundary)) {
    throw new Error("report_object_key_invalid");
  }

  return target;
}

function requireNonEmptyString(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(code);
  }

  return normalized;
}

function reportExportColumns(job: ReportExportJob): ReportCsvColumn[] {
  const requested = job.columns?.length ? job.columns : REPORT_COLUMN_OPTIONS.map((column) => column.id);
  return requested.map((id) => {
    const option = REPORT_COLUMN_OPTIONS.find((column) => column.id === id);
    return {
      id,
      label: option?.label ?? id
    };
  });
}

async function reportExportSnapshot(repository: ReportRepository, job: ReportExportJob): Promise<{
  eventWatermark: ConversationReportEventWatermark | null;
  rows: Array<Record<string, unknown>>;
}> {
  const snapshotAt = reportSnapshotAt(job);
  const options: LiveReportWorkspaceOptions = {
    channel: typeof job.filters?.channel === "string" ? job.filters.channel : undefined,
    now: snapshotAt,
    period: job.period as LiveReportWorkspaceOptions["period"],
    timezoneOffsetMinutes: reportTimezoneOffset(job.filters?.timezoneOffsetMinutes)
  };
  const emptyWorkspace = buildLiveReportWorkspace([], options);
  const conversations = await repository.listConversationReportSourceRowsAsync({
    from: new Date(emptyWorkspace.windows.previous.from),
    tenantId: reportExportTenantId(job),
    to: new Date(Math.min(new Date(emptyWorkspace.windows.current.to).getTime(), snapshotAt.getTime()))
  });
  const snapshotConversations = conversations.map((conversation) => ({
    ...conversation,
    lifecycleEvents: (conversation.lifecycleEvents ?? []).filter((event) => new Date(event.occurredAt).getTime() <= snapshotAt.getTime())
  }));
  const filteredConversations = filterReportConversations(snapshotConversations, {
    operatorId: stringFilter(job.filters?.operatorId),
    outcome: stringFilter(job.filters?.outcome),
    queueId: stringFilter(job.filters?.queueId),
    resolutionOutcome: stringFilter(job.filters?.resolutionOutcome),
    status: stringFilter(job.filters?.status),
    teamId: stringFilter(job.filters?.teamId),
    topic: stringFilter(job.filters?.topic)
  });
  const workspace = buildLiveReportWorkspace(filteredConversations as LiveReportConversation[], options);

  return {
    eventWatermark: buildConversationReportEventWatermark(filteredConversations, snapshotAt),
    rows: workspace.rows.map((row) => ({
      delta: row.delta,
      metric: row.metric,
      previous: row.previous,
      status: row.status,
      today: row.current
    }))
  };
}

function stringFilter(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function reportSnapshotAt(job: ReportExportJob): Date {
  const requested = typeof job.filters?.snapshotAt === "string" ? job.filters.snapshotAt : job.createdAt;
  const parsed = new Date(requested);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(job.createdAt);
}

function reportTimezoneOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 14 * 60 ? parsed : 0;
}

function reportExportTenantId(job: ReportExportJob): string {
  return requireNonEmptyString(job.tenantId ?? "", "report_export_job_tenant_id_required");
}

function reportExportFileName(job: ReportExportJob): string {
  const extension = job.format === "CSV" ? "csv" : job.format.toLowerCase();
  return `${job.id}.${extension}`;
}

function toReportFileDescriptor(input: {
  descriptor: ReportExportObjectDescriptor;
  fileName: string;
  job: ReportExportJob;
  rows: number;
  tenantId: string;
}): ReportFileDescriptorRecord {
  return {
    checksum: input.descriptor.checksum,
    contentType: input.descriptor.contentType,
    createdAt: input.descriptor.writtenAt,
    fileName: input.fileName,
    format: input.job.format,
    id: `file_${input.job.id}`,
    jobId: input.job.id,
    metricDefinitionVersion: input.job.metricDefinitionVersion ?? REPORT_METRIC_DEFINITION_VERSION,
    objectKey: input.descriptor.objectKey,
    sizeBytes: input.descriptor.sizeBytes,
    tenantId: input.tenantId,
    writtenAt: input.descriptor.writtenAt
  };
}

interface XlsxCellInput {
  address: string;
  value: unknown;
}

interface ZipArchiveEntry {
  body: ReportObjectStorageBody;
  name: string;
}

function xlsxCell(input: XlsxCellInput): string {
  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    return `<c r="${input.address}"><v>${input.value}</v></c>`;
  }

  if (typeof input.value === "boolean") {
    return `<c r="${input.address}" t="b"><v>${input.value ? 1 : 0}</v></c>`;
  }

  return `<c r="${input.address}" t="inlineStr"><is><t>${escapeXml(String(input.value ?? ""))}</t></is></c>`;
}

function xlsxColumnName(index: number): string {
  let current = index;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createZipArchive(entries: ZipArchiveEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body, "utf8");
    const crc = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(body.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(body.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, name, body);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + body.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

function crc32(body: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of body) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
