import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { createObjectStorageSigner } from "./object-storage.js";
import {
  WorkspaceRepository,
  type ClientExportJobRecord,
  type ClientProfileRecord,
  type FileRecord,
  type KnowledgeApprovalDecisionRecord,
  type KnowledgeArticle,
  type TemplateAuditRecord,
  type TemplateRecord
} from "./workspace.repository.js";

const CLIENT_SERVICE = "clientService";
const FILE_SERVICE = "fileService";
const TEMPLATE_SERVICE = "templateService";
const KNOWLEDGE_SERVICE = "knowledgeService";
const ATTACHMENT_CHANNELS = new Set(["SDK", "Telegram", "VK", "MAX"]);
const PENDING_UPLOAD_DESCRIPTOR_LIMIT = 25;

export interface ObjectStorageSignUploadInput {
  contentType: string;
  fileId: string;
  fileName: string;
  objectKey: string;
  sizeBytes: number;
  tenantId: string;
}

export interface ObjectStorageSignDownloadInput {
  fileId: string;
  fileName: string;
  objectKey: string;
  tenantId: string;
}

export interface ObjectStorageMetadataInput {
  fileId: string;
  fileName: string;
  objectKey: string;
  tenantId: string;
}

export interface ObjectStorageObjectMetadata {
  checksum?: string;
  sizeBytes?: number;
}

export interface SignedObjectStorageUrl {
  expiresAt: string;
  headers?: Record<string, string>;
  method: "GET" | "PUT";
  url: string;
}

export interface ObjectStorageSigner {
  getObjectMetadata?(input: ObjectStorageMetadataInput): ObjectStorageObjectMetadata | undefined | Promise<ObjectStorageObjectMetadata | undefined>;
  signDownload(input: ObjectStorageSignDownloadInput): SignedObjectStorageUrl | Promise<SignedObjectStorageUrl>;
  signUpload(input: ObjectStorageSignUploadInput): SignedObjectStorageUrl | Promise<SignedObjectStorageUrl>;
}

export interface FileUploadQuotaCheckInput {
  channel: string;
  requestedBytes: number;
  resource: "storage";
  tenantId: string;
}

export interface FileUploadQuotaDecision {
  allowed: boolean;
  limitBytes?: number;
  remainingBytes?: number;
  usedBytes?: number;
}

export interface FileUploadQuotaChecker {
  checkFileUpload(input: FileUploadQuotaCheckInput): FileUploadQuotaDecision | Promise<FileUploadQuotaDecision>;
}

export interface WorkspaceServiceOptions {
  fileUploadQuota?: FileUploadQuotaChecker;
  objectStorage?: ObjectStorageSigner;
}

export interface WorkspaceRequestContext {
  tenantId?: string;
}

export type FileScanVerdict = "clean" | "error" | "infected";

export interface KnowledgeWorkflowPayload {
  actor?: string;
  articleId: string;
  draftId?: string;
  reason?: string;
}

export interface KnowledgeAttachmentPayload {
  actor?: string;
  articleId: string;
  attachment: Record<string, unknown>;
  reason?: string;
}

export interface KnowledgeAttachmentDeletePayload {
  actor?: string;
  articleId: string;
  attachmentId: string;
  reason?: string;
}

export class WorkspaceService {
  private readonly fileUploadQuota?: FileUploadQuotaChecker;
  private readonly objectStorage: ObjectStorageSigner;

  constructor(
    private readonly workspaceRepository = WorkspaceRepository.default(),
    options: WorkspaceServiceOptions = {}
  ) {
    this.fileUploadQuota = options.fileUploadQuota;
    this.objectStorage = options.objectStorage ?? createObjectStorageSigner();
  }

  async fetchClientProfiles(filters: { maskSensitive?: boolean | string; page?: number | string; pageSize?: number | string; segmentId?: string } = {}, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const page = toPositiveInt(filters.page, 1);
    const pageSize = toPositiveInt(filters.pageSize, 25);
    const maskSensitive = true;
    const allProfiles = await this.listClientProfiles(context);
    const segment = resolveClientSegment(allProfiles, filters.segmentId);
    const profiles = filterClientProfilesBySegment(allProfiles, segment);
    const mergeEvents = await this.workspaceRepository.listClientMergeEvents({ tenantId: context.tenantId });
    const items = profiles.slice((page - 1) * pageSize, page * pageSize).map((profile) => ({
      ...profile,
      phone: maskPhone(profile.phone)
    }));

    return createEnvelope({
      service: CLIENT_SERVICE,
      operation: "fetchClientProfiles",
      traceId: workspaceTraceId(CLIENT_SERVICE, "fetchClientProfiles"),
      partial: true,
      meta: apiMeta({ filters, sensitiveFieldsMasked: maskSensitive }),
      data: {
        items,
        mergeEvents,
        mergeGraph: buildMergeGraph(allProfiles),
        pagination: {
          mode: "backend-ready",
          page,
          pageSize,
          total: profiles.length
        },
        segment
      }
    });
  }

  async fetchClientSegments(context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const profiles = await this.listClientProfiles(context);
    const segments = buildClientSegments(profiles);

    return createEnvelope({
      service: CLIENT_SERVICE,
      operation: "fetchClientSegments",
      traceId: workspaceTraceId(CLIENT_SERVICE, "fetchClientSegments"),
      meta: apiMeta(),
      data: {
        dimensions: ["channel", "device", "topic"],
        segments,
        totalProfiles: profiles.length
      }
    });
  }

  async createClientExport(payload: { format?: string; reason?: string; segmentId?: string } = {}, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(CLIENT_SERVICE, "createClientExport", "reason_required", "A client export reason of at least 8 characters is required.", {
        segmentId: payload.segmentId ?? null
      });
    }
    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(CLIENT_SERVICE, "createClientExport");
    }

    const allProfiles = await this.listClientProfiles(context);
    const segment = resolveClientSegment(allProfiles, payload.segmentId);
    const profiles = filterClientProfilesBySegment(allProfiles, segment);
    const format = normalizeClientExportFormat(payload.format);
    const audit = auditEvent("client_export", "client.export", payload.reason);
    const exportId = `client_export_${randomUUID()}`;
    const fileDescriptor = {
      fileName: clientExportFileName(segment, format),
      format,
      mimeType: format === "csv" ? "text/csv" : "application/json",
      sensitiveFieldsMasked: true
    };
    const job: ClientExportJobRecord = {
      auditEvent: audit,
      createdAt: new Date().toISOString(),
      exportId,
      fileDescriptor,
      filters: {
        segmentId: segment?.id ?? null
      },
      format,
      itemCount: profiles.length,
      reason: String(payload.reason ?? "").trim(),
      ...(segment ? { segment } : {}),
      sensitiveFieldsMasked: true,
      status: "queued",
      tenantId: context.tenantId
    };
    const saved = await this.workspaceRepository.saveClientExportJob(job);

    return createEnvelope({
      service: CLIENT_SERVICE,
      operation: "createClientExport",
      traceId: workspaceTraceId(CLIENT_SERVICE, "createClientExport"),
      meta: apiMeta({ sensitiveFieldsMasked: true }),
      data: {
        ...saved,
        previewRows: profiles.slice(0, 5).map(maskClientProfileForExport)
      }
    });
  }

  async mergeClientProfiles(payload: { candidateProfileId: string; primaryProfileId: string; reason?: string }, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(CLIENT_SERVICE, "mergeClientProfiles", "reason_required", "A merge reason of at least 8 characters is required.", {
        candidateProfileId: payload.candidateProfileId,
        primaryProfileId: payload.primaryProfileId
      });
    }
    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(CLIENT_SERVICE, "mergeClientProfiles");
    }

    const audit = auditEvent("client_merge", "client.merge", payload.reason);
    const mergeEvent = await this.workspaceRepository.saveClientMergeEvent({
      action: "client.merge",
      candidateProfileId: payload.candidateProfileId,
      id: String(audit.id),
      immutable: true,
      mergeGraphEdge: `${payload.primaryProfileId}->${payload.candidateProfileId}`,
      primaryProfileId: payload.primaryProfileId,
      reason: payload.reason,
      tenantId: context.tenantId
    });

    return createEnvelope({
      service: CLIENT_SERVICE,
      operation: "mergeClientProfiles",
      traceId: workspaceTraceId(CLIENT_SERVICE, "mergeClientProfiles"),
      meta: apiMeta(),
      data: {
        primaryProfileId: payload.primaryProfileId,
        mergedProfileId: payload.candidateProfileId,
        mergeGraphEdge: `${payload.primaryProfileId}->${payload.candidateProfileId}`,
        conflictResolution: await this.detectConflict(payload.primaryProfileId, payload.candidateProfileId, context),
        sourceProfileIds: [payload.primaryProfileId, payload.candidateProfileId],
        auditEvent: mergeEvent
      }
    });
  }

  async unmergeClientProfile(payload: { detachedProfileId: string; primaryProfileId: string; reason?: string }, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(CLIENT_SERVICE, "unmergeClientProfile", "reason_required", "An unmerge reason of at least 8 characters is required.", {
        detachedProfileId: payload.detachedProfileId,
        primaryProfileId: payload.primaryProfileId
      });
    }
    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(CLIENT_SERVICE, "unmergeClientProfile");
    }

    const audit = auditEvent("client_merge", "client.unmerge", payload.reason);
    const mergeEvent = await this.workspaceRepository.saveClientMergeEvent({
      action: "client.unmerge",
      detachedProfileId: payload.detachedProfileId,
      id: String(audit.id),
      immutable: true,
      mergeGraphEdge: `${payload.primaryProfileId}->${payload.detachedProfileId}`,
      primaryProfileId: payload.primaryProfileId,
      reason: payload.reason,
      tenantId: context.tenantId
    });

    return createEnvelope({
      service: CLIENT_SERVICE,
      operation: "unmergeClientProfile",
      traceId: workspaceTraceId(CLIENT_SERVICE, "unmergeClientProfile"),
      meta: apiMeta(),
      data: {
        primaryProfileId: payload.primaryProfileId,
        detachedProfileId: payload.detachedProfileId,
        mergeGraphEdge: `${payload.primaryProfileId}->${payload.detachedProfileId}`,
        conflictResolution: "manual_detach",
        auditEvent: mergeEvent
      }
    });
  }

  async createUploadDescriptor(
    payload: { channel: string; fileName: string; mimeType?: string; sizeBytes?: number },
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!String(payload.fileName ?? "").trim()) {
      return invalidEnvelope(FILE_SERVICE, "createUploadDescriptor", "file_name_required", "fileName is required.", {});
    }
    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(FILE_SERVICE, "createUploadDescriptor");
    }
    const tenantId = sanitizeTenantId(context.tenantId);
    if (!ATTACHMENT_CHANNELS.has(String(payload.channel ?? "").trim())) {
      return deniedEnvelope(FILE_SERVICE, "createUploadDescriptor", "attachment_channel_unsupported", "This channel does not support file attachments.", {
        auditEvent: uploadDescriptorDeniedAuditEvent("attachment_channel_unsupported", payload.channel, tenantId),
        channel: payload.channel,
        objectKeyExposed: false
      });
    }

    const requestedBytes = payload.sizeBytes ?? 0;
    const quota = await this.fileUploadQuota?.checkFileUpload({
      channel: payload.channel,
      requestedBytes,
      resource: "storage",
      tenantId
    });
    if (quota && !quota.allowed) {
      return deniedEnvelope(FILE_SERVICE, "createUploadDescriptor", "attachment_quota_exceeded", "Tenant attachment quota would be exceeded.", {
        auditEvent: uploadDescriptorDeniedAuditEvent("attachment_quota_exceeded", payload.channel, tenantId),
        channel: payload.channel,
        limitBytes: quota.limitBytes,
        objectKeyExposed: false,
        remainingBytes: quota.remainingBytes,
        requestedBytes,
        resource: "storage",
        tenantId,
        usedBytes: quota.usedBytes
      });
    }
    const pendingUploadDescriptors = countPendingUploadDescriptors(await this.workspaceRepository.listFiles({ tenantId }));
    if (pendingUploadDescriptors >= PENDING_UPLOAD_DESCRIPTOR_LIMIT) {
      return deniedEnvelope(FILE_SERVICE, "createUploadDescriptor", "attachment_upload_state_limit_exceeded", "Tenant has too many pending upload descriptors.", {
        auditEvent: uploadDescriptorDeniedAuditEvent("attachment_upload_state_limit_exceeded", payload.channel, tenantId),
        channel: payload.channel,
        objectKeyExposed: false,
        pendingUploadDescriptorLimit: PENDING_UPLOAD_DESCRIPTOR_LIMIT,
        pendingUploadDescriptors,
        tenantId
      });
    }

    const fileId = `file_${randomUUID()}`;
    const fileName = sanitizeFileName(payload.fileName);
    const record: FileRecord = {
      auditId: makeAuditId("file"),
      channel: payload.channel,
      fileId,
      fileName,
      mimeType: payload.mimeType ?? "application/octet-stream",
      objectKey: createOpaqueObjectKey(),
      scanState: "pending",
      sizeBytes: requestedBytes,
      storageState: "upload_descriptor_ready",
      tenantId
    };
    const persisted = await this.workspaceRepository.saveFile(record);
    const signedUpload = await this.objectStorage.signUpload({
      contentType: persisted.mimeType,
      fileId: persisted.fileId,
      fileName: persisted.fileName,
      objectKey: persisted.objectKey,
      sizeBytes: persisted.sizeBytes,
      tenantId: requireWorkspaceTenantId(persisted.tenantId)
    });

    return createEnvelope({
      service: FILE_SERVICE,
      operation: "createUploadDescriptor",
      traceId: workspaceTraceId(FILE_SERVICE, "createUploadDescriptor"),
      meta: apiMeta({ channel: payload.channel }),
      data: uploadDescriptor(persisted, signedUpload)
    });
  }

  async finalizeUpload(
    payload: { checksum?: string; fileId: string },
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const file = await this.workspaceRepository.findFile(payload.fileId, { tenantId: context.tenantId });

    if (!file) {
      return notFoundEnvelope(FILE_SERVICE, "finalizeUpload", "file_not_found", `File ${payload.fileId} was not found.`, { fileId: payload.fileId });
    }

    if (this.objectStorage.getObjectMetadata) {
      const objectMetadata = await this.objectStorage.getObjectMetadata({
        fileId: file.fileId,
        fileName: file.fileName,
        objectKey: file.objectKey,
        tenantId: requireWorkspaceTenantId(file.tenantId)
      });

      if (!objectMetadata) {
        return createEnvelope({
          service: FILE_SERVICE,
          operation: "finalizeUpload",
          traceId: workspaceTraceId(FILE_SERVICE, "finalizeUpload"),
          status: "denied",
          meta: apiMeta({ fileId: file.fileId }),
          data: {
            fileId: file.fileId,
            storageState: file.storageState,
            scanState: file.scanState,
            auditEvent: fileFinalizeAuditEvent(file, "file.upload.finalize_denied")
          },
          error: {
            code: "object_metadata_missing",
            message: "Uploaded object metadata was not found."
          }
        });
      }

      if (objectMetadata.sizeBytes !== undefined && objectMetadata.sizeBytes !== file.sizeBytes) {
        return createEnvelope({
          service: FILE_SERVICE,
          operation: "finalizeUpload",
          traceId: workspaceTraceId(FILE_SERVICE, "finalizeUpload"),
          status: "denied",
          meta: apiMeta({ fileId: file.fileId }),
          data: {
            fileId: file.fileId,
            storageState: file.storageState,
            scanState: file.scanState,
            expectedSizeBytes: file.sizeBytes,
            actualSizeBytes: objectMetadata.sizeBytes,
            auditEvent: fileFinalizeAuditEvent(file, "file.upload.finalize_denied")
          },
          error: {
            code: "object_size_mismatch",
            message: "Uploaded object size does not match the upload descriptor."
          }
        });
      }

      if (objectMetadata.checksum && payload.checksum && objectMetadata.checksum !== payload.checksum) {
        return createEnvelope({
          service: FILE_SERVICE,
          operation: "finalizeUpload",
          traceId: workspaceTraceId(FILE_SERVICE, "finalizeUpload"),
          status: "denied",
          meta: apiMeta({ fileId: file.fileId }),
          data: {
            fileId: file.fileId,
            storageState: file.storageState,
            scanState: file.scanState,
            checksumVerified: false,
            auditEvent: fileFinalizeAuditEvent(file, "file.upload.finalize_denied")
          },
          error: {
            code: "object_checksum_mismatch",
            message: "Uploaded object checksum does not match the finalize checksum."
          }
        });
      }
    }

    file.checksum = payload.checksum;
    file.storageState = "uploaded";
    file.scanState = "scan_pending";
    const persisted = await this.workspaceRepository.saveFile(file);

    return createEnvelope({
      service: FILE_SERVICE,
      operation: "finalizeUpload",
      traceId: workspaceTraceId(FILE_SERVICE, "finalizeUpload"),
      meta: apiMeta({ fileId: file.fileId }),
      data: {
        fileId: persisted.fileId,
        storageState: persisted.storageState,
        scanState: persisted.scanState,
        checksum: persisted.checksum,
        auditId: persisted.auditId,
        auditEvent: fileFinalizeAuditEvent(persisted, "file.upload.finalized"),
        downloadPolicy: {
          permissionRequired: "files.read",
          signedUrlAvailable: false
        }
      }
    });
  }

  async recordScanResult(payload: {
    checkedAt?: string;
    fileId: string;
    idempotencyKey?: string;
    reason?: string;
    scanner?: string;
    verdict: FileScanVerdict;
  }, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!["clean", "error", "infected"].includes(payload.verdict)) {
      return invalidEnvelope(FILE_SERVICE, "recordScanResult", "scan_verdict_unsupported", "Scan verdict must be clean, infected or error.", {
        fileId: payload.fileId,
        verdict: payload.verdict
      });
    }

    const scanState = scanStateForVerdict(payload.verdict);
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
    const checkedAt = payload.checkedAt ? normalizeIsoTimestamp(payload.checkedAt) : undefined;
    const scanResult = {
      scanCheckedAt: checkedAt,
      scanReason: payload.reason,
      scanState,
      scanVerdict: payload.verdict,
      scanner: normalizeScanner(payload.scanner)
    };
    const fingerprint = createRequestFingerprint("file_scan_result", {
      fileId: payload.fileId,
      ...scanResult
    });
    const file = await this.workspaceRepository.findFile(payload.fileId, { tenantId: context.tenantId });

    if (!file) {
      return notFoundEnvelope(FILE_SERVICE, "recordScanResult", "file_not_found", `File ${payload.fileId} was not found.`, { fileId: payload.fileId });
    }

    if (idempotencyKey) {
      const existing = await this.workspaceRepository.findFileScanResultIdempotency(idempotencyKey, { tenantId: context.tenantId });
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return conflictEnvelope(FILE_SERVICE, "recordScanResult", "idempotency_key_reused", "Idempotency key was already used for a different file scan result.", {
            fileId: payload.fileId,
            idempotencyKey
          });
        }

        return createEnvelope({
          service: FILE_SERVICE,
          operation: "recordScanResult",
          traceId: workspaceTraceId(FILE_SERVICE, "recordScanResult"),
          meta: apiMeta({ fileId: payload.fileId, idempotencyKey }),
          data: {
            ...clone(existing.result),
            duplicate: true
          }
        });
      }
    }

    if (idempotencyKey) {
      const saved = await this.workspaceRepository.saveFileScanResultIdempotency({
        fileId: payload.fileId,
        fingerprint,
        key: idempotencyKey,
        result: {}
      });
      if (saved.fingerprint !== fingerprint) {
        return conflictEnvelope(FILE_SERVICE, "recordScanResult", "idempotency_key_reused", "Idempotency key was already used for a different file scan result.", {
          fileId: payload.fileId,
          idempotencyKey
        });
      }
      if (Object.keys(saved.result).length > 0) {
        return createEnvelope({
          service: FILE_SERVICE,
          operation: "recordScanResult",
          traceId: workspaceTraceId(FILE_SERVICE, "recordScanResult"),
          meta: apiMeta({ fileId: payload.fileId, idempotencyKey }),
          data: {
            ...clone(saved.result),
            duplicate: true
          }
        });
      }
    }

    const persisted = await this.workspaceRepository.updateFileScanResult(file.fileId, scanResult);

    if (!persisted) {
      return notFoundEnvelope(FILE_SERVICE, "recordScanResult", "file_not_found", `File ${payload.fileId} was not found.`, { fileId: payload.fileId });
    }

    const result = scanResultResponseData(persisted);
    if (idempotencyKey) {
      await this.workspaceRepository.completeFileScanResultIdempotency(idempotencyKey, result);
    }

    return createEnvelope({
      service: FILE_SERVICE,
      operation: "recordScanResult",
      traceId: workspaceTraceId(FILE_SERVICE, "recordScanResult"),
      meta: apiMeta({ fileId: persisted.fileId, idempotencyKey: idempotencyKey ?? null, scanner: persisted.scanner }),
      data: result
    });
  }

  async getDownloadPolicy(fileId: string, context: { canDownload?: boolean; tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const file = await this.workspaceRepository.findFile(fileId, { tenantId: context.tenantId });

    if (!file) {
      return notFoundEnvelope(FILE_SERVICE, "getDownloadPolicy", "file_not_found", `File ${fileId} was not found.`, { fileId });
    }

    if (!context.canDownload) {
      return createEnvelope({
        service: FILE_SERVICE,
        operation: "getDownloadPolicy",
        traceId: workspaceTraceId(FILE_SERVICE, "getDownloadPolicy"),
        status: "denied",
        meta: apiMeta({ fileId }),
        data: {
          fileId,
          permissionRequired: "files.read",
          signedUrl: null
        },
        error: { code: "file_permission_denied", message: "Current role cannot download this file." }
      });
    }

    const fileIsReady = fileDownloadIsReady(file);
    if (!fileIsReady) {
      const scanBlocked = ["infected", "scan_blocked"].includes(file.scanState);
      return createEnvelope({
        service: FILE_SERVICE,
        operation: "getDownloadPolicy",
        traceId: workspaceTraceId(FILE_SERVICE, "getDownloadPolicy"),
        status: "denied",
        meta: apiMeta({ fileId }),
        data: {
          fileId,
          permissionRequired: "files.read",
          signedUrl: null
        },
        error: scanBlocked
          ? { code: "file_scan_blocked", message: "File scan blocked this download." }
          : { code: "file_not_ready", message: "File is not ready for download." }
      });
    }

    const signedDownload = await this.objectStorage.signDownload({
      fileId: file.fileId,
      fileName: file.fileName,
      objectKey: file.objectKey,
      tenantId: requireWorkspaceTenantId(file.tenantId)
    });

    return createEnvelope({
      service: FILE_SERVICE,
      operation: "getDownloadPolicy",
      traceId: workspaceTraceId(FILE_SERVICE, "getDownloadPolicy"),
      meta: apiMeta({ fileId }),
      data: {
        fileId,
        permissionRequired: "files.read",
        signedUrl: signedDownload.url,
        expiresAt: signedDownload.expiresAt
      }
    });
  }

  async fetchTemplates(filters: { operatorId?: string } = {}, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const templates = await this.listTemplates(context);

    return createEnvelope({
      service: TEMPLATE_SERVICE,
      operation: "fetchTemplates",
      traceId: workspaceTraceId(TEMPLATE_SERVICE, "fetchTemplates"),
      partial: true,
      meta: apiMeta({ operatorId: filters.operatorId ?? "current" }),
      data: {
        operatorId: filters.operatorId ?? "current",
        items: templates,
        source: "operator_template_library"
      }
    });
  }

  async saveTemplate(template: { channel: string; id?: string; text: string; title: string; topic: string; version?: number }, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(TEMPLATE_SERVICE, "saveTemplate");
    }
    const auditId = makeAuditId("template");
    const saved = await this.workspaceRepository.saveTemplate({
      ...template,
      id: template.id ?? `tpl_${randomUUID()}`,
      scope: "team",
      tenantId: context.tenantId,
      updated: new Date().toISOString(),
      usage: 0,
      version: template.version ?? 1,
      auditId
    });
    const auditEvent: TemplateAuditRecord = await this.workspaceRepository.saveTemplateAuditEvent({
      action: "template.saved",
      id: auditId,
      immutable: true,
      templateId: saved.id,
      timestamp: saved.updated
    });

    return createEnvelope({
      service: TEMPLATE_SERVICE,
      operation: "saveTemplate",
      traceId: workspaceTraceId(TEMPLATE_SERVICE, "saveTemplate"),
      meta: apiMeta({ templateId: saved.id }),
      data: {
        ...clone(saved),
        auditEvent: clone(auditEvent)
      } as unknown as Record<string, unknown>
    });
  }

  async fetchKnowledgeArticles(filters: { visibility?: string } = {}, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    const articles = await this.listKnowledgeArticles(context);
    const items = articles.filter((article) => isKnowledgeArticleVisible(article, filters));

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "fetchKnowledgeArticles",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "fetchKnowledgeArticles"),
      partial: true,
      meta: apiMeta({ filters, tenantId: tenantId ?? null }),
      data: {
        items: clone(items)
      }
    });
  }

  async fetchKnowledgeArticle(articleId: string, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const article = await this.findArticle(articleId, context);

    if (!article) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "fetchKnowledgeArticle", "knowledge_article_not_found", `Article ${articleId} was not found.`, { articleId });
    }

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "fetchKnowledgeArticle",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "fetchKnowledgeArticle"),
      meta: apiMeta({ articleId, tenantId: context.tenantId ?? null }),
      data: {
        article: clone(article)
      }
    });
  }

  async createKnowledgeArticle(payload: { body?: string; category?: string; channels?: string[]; title?: string; topics?: string[]; visibility?: string }, context: WorkspaceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = String(context.tenantId ?? "").trim();
    const title = normalizeText(payload.title);
    if (!tenantId) return tenantContextRequiredEnvelope(KNOWLEDGE_SERVICE, "createKnowledgeArticle", {});
    if (!title) return invalidEnvelope(KNOWLEDGE_SERVICE, "createKnowledgeArticle", "knowledge_article_title_required", "Knowledge article title is required.", {});
    const now = new Date().toISOString();
    const id = `kb-${randomUUID()}`;
    const article: KnowledgeArticle = {
      approvalHistory: [{ action: "created_draft", actor: "current-operator", id: `evt_knowledge_${randomUUID()}`, immutable: true, timestamp: now, tone: "info" }],
      attachments: [], body: normalizeText(payload.body) ?? "", category: normalizeText(payload.category) ?? "General", channels: normalizeStringList(payload.channels) ?? ["SDK"], helpfulRate: 0, id, owner: "current-operator", status: "draft", tenantId, title, topics: normalizeStringList(payload.topics) ?? ["General"], updated: now, usage: 0, version: "v1.0-draft", versions: [{ author: "current-operator", id: `${id}-v1`, label: "v1.0-draft", status: "draft", updated: now }], visibility: normalizeText(payload.visibility) ?? "internal"
    };
    const saved = await this.workspaceRepository.saveKnowledgeArticle(article);
    return createEnvelope({ service: KNOWLEDGE_SERVICE, operation: "createKnowledgeArticle", traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "createKnowledgeArticle"), meta: apiMeta({ articleId: id, tenantId }), data: { article: saved, auditEvent: auditEvent("knowledge", "knowledge.article.created", "Created a new knowledge article draft.") } });
  }

  async saveKnowledgeArticleDraft(
    payload: {
      articleId: string;
      body: string;
      category?: string;
      channels?: string[];
      reason?: string;
      title?: string;
      topics?: string[];
      visibility?: string;
    },
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(KNOWLEDGE_SERVICE, "saveKnowledgeArticleDraft", "reason_required", "A knowledge draft reason of at least 8 characters is required.", {
        articleId: payload.articleId
      });
    }

    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(KNOWLEDGE_SERVICE, "saveKnowledgeArticleDraft", { articleId: payload.articleId });
    }
    const article = await this.workspaceRepository.findKnowledgeArticle(payload.articleId, { tenantId: context.tenantId });

    if (!article) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "saveKnowledgeArticleDraft", "knowledge_article_not_found", `Article ${payload.articleId} was not found.`, {
        articleId: payload.articleId
      });
    }

    const draft = await this.workspaceRepository.saveKnowledgeArticle({
      ...article,
      body: payload.body,
      category: normalizeText(payload.category) ?? article.category,
      channels: normalizeStringList(payload.channels) ?? article.channels,
      status: "draft",
      tenantId: article.tenantId,
      title: normalizeText(payload.title) ?? article.title,
      topics: normalizeStringList(payload.topics) ?? article.topics,
      version: nextDraftVersion(article.version),
      visibility: normalizeText(payload.visibility) ?? article.visibility,
      updated: new Date().toISOString(),
      versions: [
        {
          id: `${article.id}-${randomUUID()}`,
          label: nextDraftVersion(article.version),
          status: "draft",
          author: "current-service-admin",
          updated: new Date().toISOString(),
          changes: payload.reason
        },
        ...article.versions
      ]
    });

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "saveKnowledgeArticleDraft",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "saveKnowledgeArticleDraft"),
      meta: apiMeta({ articleId: article.id, tenantId: context.tenantId ?? article.tenantId ?? null }),
      data: {
        article: draft,
        auditEvent: auditEvent("knowledge", "knowledge.article.draft", payload.reason)
      }
    });
  }

  async submitKnowledgeArticleForReview(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.transitionKnowledgeArticle(payload, context, {
      action: "sent_for_review",
      allowedStatuses: ["draft", "review"],
      nextStatus: "review",
      nextVisibility: "internal",
      operation: "submitKnowledgeArticleForReview",
      tone: "info"
    });
  }

  async approveKnowledgeArticle(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.transitionKnowledgeArticle(payload, context, {
      action: "approved",
      allowedStatuses: ["review", "approved"],
      nextStatus: "approved",
      nextVisibility: "internal",
      operation: "approveKnowledgeArticle",
      tone: "ok"
    });
  }

  async publishKnowledgeArticle(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const base = await this.prepareKnowledgeWorkflow(payload, context, "publishKnowledgeArticle", ["review", "approved"]);
    if (!base.ok) {
      return base.envelope;
    }

    const unsafeAttachments = base.article.attachments.filter((attachment) => !isKnowledgeAttachmentPublishable(attachment));
    if (unsafeAttachments.length > 0) {
      return deniedEnvelope(KNOWLEDGE_SERVICE, "publishKnowledgeArticle", "knowledge_attachment_scan_required", "All knowledge article attachments must be scan-clean before publication.", {
        articleId: base.article.id,
        unsafeAttachmentIds: unsafeAttachments.map((attachment) => String(attachment.id ?? attachment.fileId ?? attachment.name ?? "attachment"))
      });
    }

    return this.persistKnowledgeTransition(base.article, payload, context, {
      action: "published",
      nextStatus: "published",
      nextVisibility: "public",
      operation: "publishKnowledgeArticle",
      tone: "ok"
    });
  }

  async rejectKnowledgeArticle(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.transitionKnowledgeArticle(payload, context, {
      action: "returned_for_revision",
      allowedStatuses: ["review", "approved"],
      nextStatus: "draft",
      nextVisibility: "internal",
      operation: "rejectKnowledgeArticle",
      tone: "warn"
    });
  }

  async archiveKnowledgeArticle(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.transitionKnowledgeArticle(payload, context, {
      action: "archived",
      allowedStatuses: ["published"],
      nextStatus: "archived",
      nextVisibility: "internal",
      operation: "archiveKnowledgeArticle",
      tone: "warn"
    });
  }

  async addKnowledgeArticleAttachment(
    payload: KnowledgeAttachmentPayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(KNOWLEDGE_SERVICE, "addKnowledgeArticleAttachment", "reason_required", "A knowledge attachment reason of at least 8 characters is required.", {
        articleId: payload.articleId
      });
    }

    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(KNOWLEDGE_SERVICE, "addKnowledgeArticleAttachment", { articleId: payload.articleId });
    }
    const article = await this.workspaceRepository.findKnowledgeArticle(payload.articleId, { tenantId: context.tenantId });
    if (!article) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "addKnowledgeArticleAttachment", "knowledge_article_not_found", `Article ${payload.articleId} was not found.`, {
        articleId: payload.articleId
      });
    }

    const attachment = normalizeKnowledgeAttachment(payload.attachment);
    if (!attachment) {
      return invalidEnvelope(KNOWLEDGE_SERVICE, "addKnowledgeArticleAttachment", "knowledge_attachment_invalid", "Knowledge attachment name is required.", {
        articleId: article.id
      });
    }

    if (article.attachments.some((item) => String(item.id ?? "") === attachment.id)) {
      return conflictEnvelope(KNOWLEDGE_SERVICE, "addKnowledgeArticleAttachment", "knowledge_attachment_conflict", "Knowledge attachment already exists for this article.", {
        articleId: article.id,
        attachmentId: attachment.id
      });
    }

    const now = new Date().toISOString();
    const audit: Record<string, unknown> = {
      ...auditEvent("knowledge", "knowledge.article.attachment.added", payload.reason),
      actor: knowledgeActor(payload.actor),
      articleId: article.id,
      attachmentId: attachment.id
    };
    const saved = await this.workspaceRepository.saveKnowledgeArticle({
      ...article,
      attachments: [...article.attachments, attachment],
      approvalHistory: [
        knowledgeHistoryEvent({
          action: "attachment_added",
          actor: knowledgeActor(payload.actor),
          comment: payload.reason,
          id: String(audit.id),
          timestamp: now,
          tone: "info"
        }),
        ...article.approvalHistory
      ],
      status: article.status === "published" ? "draft" : article.status,
      tenantId: article.tenantId,
      updated: now,
      visibility: article.status === "published" ? "internal" : article.visibility
    });

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "addKnowledgeArticleAttachment",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "addKnowledgeArticleAttachment"),
      meta: apiMeta({ articleId: article.id, tenantId: context.tenantId ?? article.tenantId ?? null }),
      data: {
        article: saved,
        attachment,
        auditEvent: audit
      }
    });
  }

  async deleteKnowledgeArticleAttachment(
    payload: KnowledgeAttachmentDeletePayload,
    context: WorkspaceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(KNOWLEDGE_SERVICE, "deleteKnowledgeArticleAttachment", "reason_required", "A knowledge attachment delete reason of at least 8 characters is required.", {
        articleId: payload.articleId,
        attachmentId: payload.attachmentId
      });
    }

    if (!context.tenantId) {
      return tenantContextRequiredEnvelope(KNOWLEDGE_SERVICE, "deleteKnowledgeArticleAttachment", { articleId: payload.articleId });
    }
    const article = await this.workspaceRepository.findKnowledgeArticle(payload.articleId, { tenantId: context.tenantId });
    if (!article) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "deleteKnowledgeArticleAttachment", "knowledge_article_not_found", `Article ${payload.articleId} was not found.`, {
        articleId: payload.articleId
      });
    }

    const attachment = article.attachments.find((item) => knowledgeAttachmentId(item) === payload.attachmentId);
    if (!attachment) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "deleteKnowledgeArticleAttachment", "knowledge_attachment_not_found", `Attachment ${payload.attachmentId} was not found.`, {
        articleId: article.id,
        attachmentId: payload.attachmentId
      });
    }

    const now = new Date().toISOString();
    const audit: Record<string, unknown> = {
      ...auditEvent("knowledge", "knowledge.article.attachment.deleted", payload.reason),
      actor: knowledgeActor(payload.actor),
      articleId: article.id,
      attachmentId: payload.attachmentId
    };
    const saved = await this.workspaceRepository.saveKnowledgeArticle({
      ...article,
      approvalHistory: [
        knowledgeHistoryEvent({
          action: "attachment_deleted",
          actor: knowledgeActor(payload.actor),
          comment: payload.reason,
          id: String(audit.id),
          timestamp: now,
          tone: "warn"
        }),
        ...article.approvalHistory
      ],
      attachments: article.attachments.filter((item) => knowledgeAttachmentId(item) !== payload.attachmentId),
      status: article.status === "published" ? "draft" : article.status,
      tenantId: article.tenantId,
      updated: now,
      visibility: article.status === "published" ? "internal" : article.visibility
    });

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "deleteKnowledgeArticleAttachment",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "deleteKnowledgeArticleAttachment"),
      meta: apiMeta({ articleId: article.id, attachmentId: payload.attachmentId, tenantId: context.tenantId ?? article.tenantId ?? null }),
      data: {
        article: saved,
        attachment,
        auditEvent: audit
      }
    });
  }

  private async findArticle(articleId: string, context: WorkspaceRequestContext = {}): Promise<KnowledgeArticle | undefined> {
    const articles = await this.listKnowledgeArticles(context);
    return articles.find((article) => article.id === articleId);
  }

  private async transitionKnowledgeArticle(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext,
    transition: {
      action: string;
      allowedStatuses: string[];
      nextStatus: string;
      nextVisibility: string;
      operation: string;
      tone: string;
    }
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const base = await this.prepareKnowledgeWorkflow(payload, context, transition.operation, transition.allowedStatuses);
    if (!base.ok) {
      return base.envelope;
    }

    return this.persistKnowledgeTransition(base.article, payload, context, transition);
  }

  private async prepareKnowledgeWorkflow(
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext,
    operation: string,
    allowedStatuses: string[]
  ): Promise<
    | { ok: true; article: KnowledgeArticle }
    | { ok: false; envelope: BackendEnvelope<Record<string, unknown>> }
  > {
    if (!hasReason(payload.reason)) {
      return {
        ok: false,
        envelope: invalidEnvelope(KNOWLEDGE_SERVICE, operation, "reason_required", "A knowledge workflow reason of at least 8 characters is required.", {
          articleId: payload.articleId
        })
      };
    }

    if (!context.tenantId) {
      return {
        ok: false,
        envelope: tenantContextRequiredEnvelope(KNOWLEDGE_SERVICE, operation, { articleId: payload.articleId })
      };
    }

    const article = await this.workspaceRepository.findKnowledgeArticle(payload.articleId, { tenantId: context.tenantId });
    if (!article) {
      return {
        ok: false,
        envelope: notFoundEnvelope(KNOWLEDGE_SERVICE, operation, "knowledge_article_not_found", `Article ${payload.articleId} was not found.`, {
          articleId: payload.articleId
        })
      };
    }

    if (!allowedStatuses.includes(article.status)) {
      return {
        ok: false,
        envelope: conflictEnvelope(KNOWLEDGE_SERVICE, operation, "knowledge_status_transition_invalid", `Article ${article.id} cannot transition from ${article.status}.`, {
          allowedStatuses,
          articleId: article.id,
          status: article.status
        })
      };
    }

    return { ok: true, article };
  }

  private async persistKnowledgeTransition(
    article: KnowledgeArticle,
    payload: KnowledgeWorkflowPayload,
    context: WorkspaceRequestContext,
    transition: {
      action: string;
      nextStatus: string;
      nextVisibility: string;
      operation: string;
      tone: string;
    }
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const now = new Date().toISOString();
    const actor = knowledgeActor(payload.actor);
    const decision = await this.workspaceRepository.saveKnowledgeApprovalDecision({
      action: transition.action,
      actor,
      articleId: article.id,
      ...(payload.draftId ? { draftId: payload.draftId } : {}),
      id: makeAuditId("knowledge"),
      immutable: true,
      reason: payload.reason,
      timestamp: now
    });
    const saved = await this.workspaceRepository.saveKnowledgeArticle({
      ...article,
      approvalHistory: [
        knowledgeDecisionHistoryEvent(decision, transition.tone),
        ...article.approvalHistory
      ],
      status: transition.nextStatus,
      tenantId: article.tenantId,
      updated: now,
      versions: updateKnowledgeVersionStatuses(article, transition.nextStatus, now, actor, payload.reason),
      visibility: transition.nextVisibility
    });
    const audit: Record<string, unknown> = {
      ...auditEvent("knowledge", `knowledge.article.${transition.action}`, payload.reason),
      actor,
      articleId: article.id,
      approvalDecisionId: decision.id
    };

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: transition.operation,
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, transition.operation),
      meta: apiMeta({ articleId: article.id, tenantId: context.tenantId ?? article.tenantId ?? null }),
      data: {
        article: saved,
        approvalDecision: decision,
        auditEvent: audit
      }
    });
  }

  private async detectConflict(primaryProfileId: string, candidateProfileId: string, context: WorkspaceRequestContext = {}): Promise<string> {
    const profiles = await this.listClientProfiles(context);
    return detectConflict(profiles, primaryProfileId, candidateProfileId);
  }

  private async listClientProfiles(context: WorkspaceRequestContext = {}): Promise<ClientProfileRecord[]> {
    return this.workspaceRepository.listClientProfiles({ tenantId: context.tenantId });
  }

  private async listKnowledgeArticles(context: WorkspaceRequestContext = {}): Promise<KnowledgeArticle[]> {
    return this.workspaceRepository.listKnowledgeArticles({ tenantId: context.tenantId });
  }

  private async listTemplates(context: WorkspaceRequestContext = {}): Promise<TemplateRecord[]> {
    return this.workspaceRepository.listTemplates({ tenantId: context.tenantId });
  }

}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditEvent(scope: string, action: string, reason?: string): Record<string, unknown> {
  return {
    id: makeAuditId(scope),
    action,
    immutable: true,
    reason
  };
}

function buildMergeGraph(items: ClientProfileRecord[]): Array<{ candidateIds: string[]; profileId: string }> {
  return items.map((client) => ({
    profileId: client.sourceProfileId,
    candidateIds: items
      .filter((candidate) => candidate.id !== client.id)
      .filter((candidate) => candidate.channel === client.channel || candidate.name.split(" ")[0] === client.name.split(" ")[0])
      .map((candidate) => candidate.sourceProfileId)
  }));
}

function buildClientSegments(profiles: ClientProfileRecord[]): Array<{ count: number; dimension: string; id: string; label: string }> {
  return [
    ...countClientSegmentDimension(profiles, "channel", (profile) => profile.channel),
    ...countClientSegmentDimension(profiles, "device", (profile) => profile.device),
    ...countClientSegmentDimension(profiles, "topic", (profile) => profile.topic || "No topic")
  ];
}

function countClientSegmentDimension(
  profiles: ClientProfileRecord[],
  dimension: string,
  valueSelector: (profile: ClientProfileRecord) => string
): Array<{ count: number; dimension: string; id: string; label: string }> {
  const counts = new Map<string, number>();
  for (const profile of profiles) {
    const value = String(valueSelector(profile) ?? "").trim() || "Unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => ({
      count,
      dimension,
      id: `${dimension}:${label}`,
      label
    }));
}

function resolveClientSegment(
  profiles: ClientProfileRecord[],
  segmentId: string | undefined
): { count: number; dimension: string; id: string; label: string } | null {
  const normalizedSegmentId = String(segmentId ?? "").trim();
  if (!normalizedSegmentId) {
    return null;
  }

  const existing = buildClientSegments(profiles).find((segment) => segment.id === normalizedSegmentId);
  if (existing) {
    return existing;
  }

  const parsed = parseClientSegmentId(normalizedSegmentId);
  return parsed ? { ...parsed, count: 0, id: normalizedSegmentId } : null;
}

function parseClientSegmentId(segmentId: string): { dimension: string; label: string } | null {
  const [dimension, ...labelParts] = segmentId.split(":");
  const label = labelParts.join(":").trim();
  if (!["channel", "device", "topic"].includes(dimension) || !label) {
    return null;
  }

  return { dimension, label };
}

function filterClientProfilesBySegment(
  profiles: ClientProfileRecord[],
  segment: { dimension: string; label: string } | null
): ClientProfileRecord[] {
  if (!segment) {
    return profiles;
  }

  return profiles.filter((profile) => {
    if (segment.dimension === "channel") {
      return profile.channel === segment.label;
    }

    if (segment.dimension === "device") {
      return profile.device === segment.label;
    }

    return (profile.topic || "No topic") === segment.label;
  });
}

function normalizeClientExportFormat(format: string | undefined): "csv" | "json" {
  return String(format ?? "").trim().toLowerCase() === "csv" ? "csv" : "json";
}

function clientExportFileName(segment: { id: string } | null, format: "csv" | "json"): string {
  const suffix = sanitizeFileSegment(segment?.id ?? "all");
  return `clients-${suffix}.${format}`;
}

function sanitizeFileSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "all";
}

function maskClientProfileForExport(profile: ClientProfileRecord): Record<string, unknown> {
  return {
    channel: profile.channel,
    clientSince: profile.clientSince,
    device: profile.device,
    entry: profile.entry,
    id: profile.id,
    name: profile.name,
    phone: maskPhone(profile.phone),
    sourceProfileId: profile.sourceProfileId,
    topic: profile.topic
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function detectConflict(profiles: ClientProfileRecord[], primaryProfileId: string, candidateProfileId: string): string {
  const primary = profiles.find((profile) => profile.sourceProfileId === primaryProfileId);
  const candidate = profiles.find((profile) => profile.sourceProfileId === candidateProfileId);

  if (!primary || !candidate) {
    return "manual_review:missing_profile";
  }

  const conflicts = [
    primary.phone !== candidate.phone ? "phone" : "",
    primary.device !== candidate.device ? "device" : "",
    primary.entry !== candidate.entry ? "entry" : ""
  ].filter(Boolean);

  return conflicts.length ? `manual_review:${conflicts.join(",")}` : "auto_merge";
}

function hasReason(reason?: string): boolean {
  return String(reason ?? "").trim().length >= 8;
}

function invalidEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: workspaceTraceId(service, operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function tenantContextRequiredEnvelope(
  service: string,
  operation: string,
  data: Record<string, unknown> = {}
): BackendEnvelope<Record<string, unknown>> {
  return invalidEnvelope(
    service,
    operation,
    "tenant_context_required",
    "A current tenant is required for this operation.",
    data
  );
}

function conflictEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: workspaceTraceId(service, operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function deniedEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: workspaceTraceId(service, operation),
    status: "denied",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: workspaceTraceId(service, operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function maskPhone(phone: string): string {
  return phone.replace(/(\+7)\s\d{3}\s\d{3}-\d{2}-(\d{2})/, "$1 *** ***-**-$2");
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .at(-1) ?? "upload.bin";
}

function sanitizeTenantId(tenantId: string): string {
  const normalized = tenantId.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("workspace_tenant_id_invalid");
  }
  return normalized;
}

function requireWorkspaceTenantId(value: unknown): string {
  const tenantId = String(value ?? "").trim();
  if (!tenantId) {
    throw new Error("workspace_tenant_id_required");
  }
  return tenantId;
}

function createOpaqueObjectKey(): string {
  return `objects/obj_${randomUUID()}`;
}

function fileDownloadIsReady(file: FileRecord): boolean {
  return file.storageState === "uploaded" && ["clean", "scan_clean"].includes(file.scanState) && file.scanVerdict === "clean";
}

function countPendingUploadDescriptors(files: FileRecord[]): number {
  return files.filter((file) => file.storageState === "upload_descriptor_ready" && file.scanState === "pending").length;
}

function scanResultResponseData(file: FileRecord): Record<string, unknown> {
  return {
    fileId: file.fileId,
    storageState: file.storageState,
    scanState: file.scanState,
    scanVerdict: file.scanVerdict,
    scanCheckedAt: file.scanCheckedAt,
    scanReason: file.scanReason,
    scanner: file.scanner,
    auditId: file.auditId,
    downloadPolicy: {
      permissionRequired: "files.read",
      signedUrlAvailable: fileDownloadIsReady(file)
    }
  };
}

function fileFinalizeAuditEvent(file: FileRecord, action: string): Record<string, unknown> {
  return {
    id: file.auditId,
    action,
    fileId: file.fileId,
    immutable: true,
    objectKeyExposed: false
  };
}

function uploadDescriptorDeniedAuditEvent(reason: string, channel: string, tenantId: string): Record<string, unknown> {
  return {
    id: makeAuditId("file"),
    action: "file.upload_descriptor_denied",
    channel,
    immutable: true,
    objectKeyExposed: false,
    reason,
    tenantId
  };
}

function normalizeIdempotencyKey(value?: string): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function createRequestFingerprint(scope: string, value: Record<string, unknown>): string {
  return createHash("sha256")
    .update(`${scope}:${stableStringify(value)}`)
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeIsoTimestamp(value?: string): string {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeScanner(scanner?: string): string {
  const normalized = String(scanner ?? "scanner-unknown").trim();
  return normalized || "scanner-unknown";
}

function scanStateForVerdict(verdict: FileScanVerdict): string {
  if (verdict === "clean") {
    return "scan_clean";
  }

  if (verdict === "infected") {
    return "scan_blocked";
  }

  return "scan_failed";
}

function nextDraftVersion(version: string): string {
  const match = version.match(/^v(\d+)\.(\d+)/);

  if (!match) {
    return `${version}-draft`;
  }

  return `v${match[1]}.${Number(match[2]) + 1}-draft`;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : undefined;
}

function normalizeStringList(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function knowledgeActor(actor?: string): string {
  return normalizeText(actor) ?? "current-service-admin";
}

function knowledgeAttachmentId(attachment: Record<string, unknown>): string {
  return String(attachment.id ?? attachment.fileId ?? attachment.name ?? "").trim();
}

function normalizeKnowledgeAttachment(attachment: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
    return null;
  }

  const name = normalizeText(stringRecordValue(attachment, "name") ?? stringRecordValue(attachment, "fileName"));
  if (!name) {
    return null;
  }

  return {
    ...attachment,
    id: normalizeText(stringRecordValue(attachment, "id") ?? stringRecordValue(attachment, "fileId")) ?? `att_${randomUUID()}`,
    name,
    status: normalizeText(stringRecordValue(attachment, "status")) ?? "scan_pending"
  };
}

function isKnowledgeAttachmentPublishable(attachment: Record<string, unknown>): boolean {
  const status = normalizeText(stringRecordValue(attachment, "status"))?.toLowerCase();
  const scanState = normalizeText(stringRecordValue(attachment, "scanState"))?.toLowerCase();
  const scanVerdict = normalizeText(stringRecordValue(attachment, "scanVerdict"))?.toLowerCase();

  return (!status || ["ready", "clean", "scan_clean"].includes(status))
    && (!scanState || ["ready", "clean", "scan_clean"].includes(scanState))
    && (!scanVerdict || scanVerdict === "clean");
}

function knowledgeDecisionHistoryEvent(decision: KnowledgeApprovalDecisionRecord, tone: string): Record<string, unknown> {
  return knowledgeHistoryEvent({
    action: decision.action,
    actor: decision.actor,
    comment: decision.reason,
    id: decision.id,
    timestamp: decision.timestamp,
    tone
  });
}

function knowledgeHistoryEvent(input: {
  action: string;
  actor: string;
  comment?: string;
  id: string;
  timestamp: string;
  tone: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    actor: input.actor,
    role: "Knowledge governance",
    action: input.action,
    date: input.timestamp,
    comment: input.comment,
    tone: input.tone
  };
}

function updateKnowledgeVersionStatuses(
  article: KnowledgeArticle,
  status: string,
  updated: string,
  author: string,
  changes?: string
): Array<Record<string, unknown>> {
  const versions = Array.isArray(article.versions) ? article.versions : [];
  if (versions.length === 0) {
    return [
      {
        id: `${article.id}-${status}-${randomUUID()}`,
        label: article.version,
        status,
        author,
        updated,
        changes
      }
    ];
  }

  return versions.map((version, index) => (
    index === 0
      ? {
          ...version,
          status,
          author,
          updated,
          changes: changes ?? version.changes
        }
      : version
  ));
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return value === undefined || value === null ? undefined : String(value);
}

function isKnowledgeArticleVisible(article: KnowledgeArticle, filters: { visibility?: string }): boolean {
  if (filters.visibility && filters.visibility !== "all" && article.visibility !== filters.visibility) {
    return false;
  }

  if (filters.visibility === "public") {
    return article.status === "published";
  }

  return true;
}

function toPositiveInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function uploadDescriptor(file: FileRecord, signedUpload: SignedObjectStorageUrl): Record<string, unknown> {
  return {
    fileId: file.fileId,
    channel: file.channel,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    storageState: file.storageState,
    scanState: file.scanState,
    objectKeyExposed: false,
    signedUpload: {
      method: signedUpload.method,
      url: signedUpload.url,
      expiresAt: signedUpload.expiresAt,
      ...(signedUpload.headers ? { headers: signedUpload.headers } : {})
    },
    auditId: file.auditId
  };
}

function workspaceTraceId(service: string, operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(service, operation);
}
