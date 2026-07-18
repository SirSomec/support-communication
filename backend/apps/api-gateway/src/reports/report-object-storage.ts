import { createHash } from "node:crypto";
import {
  createS3CompatibleObjectStorageSigner,
  type ObjectStorageSignerSource
} from "../workspace/object-storage.js";
import type { ObjectStorageSigner } from "../workspace/workspace.service.js";
import {
  createLocalReportObjectStorageAdapter,
  type ReportObjectStorageGetInput,
  type ReportObjectStorageGetResult,
  type ReportObjectStoragePutInput,
  type ReportObjectStoragePutResult,
  type ReportObjectStorageReader,
  type ReportObjectStorageWriter
} from "./report-export.worker.js";

export type ReportObjectStorageMode = "local" | "s3";

export interface ReportObjectStorageRuntimeSource extends ObjectStorageSignerSource {
  REPORT_EXPORT_OBJECT_ROOT?: string;
  REPORT_EXPORT_OBJECT_STORAGE_MODE?: string;
  RUNTIME_PROFILE?: string;
}

export interface ReportObjectStorageDownloadSigner {
  signDownload(input: { fileName: string; jobId: string; objectKey: string; tenantId: string }): Promise<{ downloadUrl: string; expiresAt: string }>;
}

export type SharedReportObjectStorage = ReportObjectStorageReader & ReportObjectStorageWriter & ReportObjectStorageDownloadSigner;

export interface S3ReportObjectStorageAdapterOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  signer?: ObjectStorageSigner;
}

export function createSharedReportObjectStorage(
  source: ReportObjectStorageRuntimeSource = process.env,
  options: S3ReportObjectStorageAdapterOptions = {}
): SharedReportObjectStorage {
  if (resolveReportObjectStorageMode(source) === "local") {
    const local = createLocalReportObjectStorageAdapter({
      now: options.now,
      rootDir: source.REPORT_EXPORT_OBJECT_ROOT?.trim() || ".runtime/report-exports"
    });
    return {
      ...local,
      async signDownload(input) {
        return {
          downloadUrl: `/api/v1/reports/exports/${encodeURIComponent(input.jobId)}/download`,
          expiresAt: new Date((options.now?.() ?? new Date()).getTime() + 15 * 60_000).toISOString()
        };
      }
    };
  }
  return createS3ReportObjectStorageAdapter(source, options);
}

export function resolveReportObjectStorageMode(source: ReportObjectStorageRuntimeSource = process.env): ReportObjectStorageMode {
  const configured = source.REPORT_EXPORT_OBJECT_STORAGE_MODE?.trim().toLowerCase();
  if (configured === "local" || configured === "s3") return configured;
  return source.RUNTIME_PROFILE?.trim() === "production-like" ? "s3" : "local";
}

export function createS3ReportObjectStorageAdapter(
  source: ObjectStorageSignerSource,
  options: S3ReportObjectStorageAdapterOptions = {}
): SharedReportObjectStorage {
  const signer = options.signer ?? createS3CompatibleObjectStorageSigner(requireS3Configuration(source), { now: options.now });
  const request = options.fetch ?? fetch;
  return {
    async getObject(input: ReportObjectStorageGetInput): Promise<ReportObjectStorageGetResult | undefined> {
      assertReportObjectKey(input.objectKey);
      const signed = await signer.signDownload(signerDownloadInput(input.objectKey, "report-export"));
      const response = await request(signed.url, { method: signed.method });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`report_object_storage_get_failed:${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      return { body, contentType: response.headers.get("content-type") ?? undefined, sizeBytes: body.length };
    },
    async putObject(input: ReportObjectStoragePutInput): Promise<ReportObjectStoragePutResult> {
      assertReportObjectKey(input.objectKey);
      const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
      const signed = await signer.signUpload({
        ...signerDownloadInput(input.objectKey, "report-export"),
        contentType: input.contentType,
        sizeBytes: body.length
      });
      const response = await request(signed.url, { body, headers: signed.headers, method: signed.method });
      if (!response.ok) throw new Error(`report_object_storage_put_failed:${response.status}`);
      return {
        checksum: `sha256:${createHash("sha256").update(body).digest("hex")}`,
        sizeBytes: body.length,
        writtenAt: (options.now?.() ?? new Date()).toISOString()
      };
    },
    async signDownload(input) {
      assertReportObjectKey(input.objectKey, input.tenantId);
      const signed = await signer.signDownload(signerDownloadInput(input.objectKey, input.fileName));
      return { downloadUrl: signed.url, expiresAt: signed.expiresAt };
    }
  };
}

function signerDownloadInput(objectKey: string, fileName: string) {
  return { fileId: objectKey, fileName, objectKey, tenantId: reportTenantFromObjectKey(objectKey) };
}

function requireS3Configuration(source: ObjectStorageSignerSource): Required<Pick<ObjectStorageSignerSource, "S3_ACCESS_KEY" | "S3_BUCKET" | "S3_ENDPOINT" | "S3_SECRET_KEY">> & ObjectStorageSignerSource {
  if (!source.S3_ACCESS_KEY?.trim() || !source.S3_BUCKET?.trim() || !source.S3_ENDPOINT?.trim() || !source.S3_SECRET_KEY?.trim()) {
    throw new Error("report_object_storage_s3_configuration_required");
  }
  return source as Required<Pick<ObjectStorageSignerSource, "S3_ACCESS_KEY" | "S3_BUCKET" | "S3_ENDPOINT" | "S3_SECRET_KEY">> & ObjectStorageSignerSource;
}

function assertReportObjectKey(objectKey: string, tenantId?: string): void {
  const match = /^reports\/([^/]+)\/([^/]+)\/([^/]+\.(?:csv|html|json|txt|xlsx))$/.exec(objectKey);
  if (!match || (tenantId && match[1] !== tenantId)) throw new Error("report_object_key_invalid");
}

function reportTenantFromObjectKey(objectKey: string): string {
  const match = /^reports\/([^/]+)\//.exec(objectKey);
  if (!match) throw new Error("report_object_key_invalid");
  return match[1];
}
