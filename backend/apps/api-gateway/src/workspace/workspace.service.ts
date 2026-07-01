import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { createObjectStorageSigner } from "./object-storage.js";
import { WorkspaceRepository, type ClientProfileRecord, type FileRecord, type KnowledgeArticle, type TemplateAuditRecord, type TemplateRecord } from "./workspace.repository.js";

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

const clientProfiles: ClientProfileRecord[] = [
  {
    id: "maria",
    sourceProfileId: "src_sdk_maria",
    name: "Maria K.",
    channel: "SDK",
    phone: "+7 999 204-18-44",
    device: "Android",
    entry: "SDK",
    topic: "Delivery / Status",
    clientSince: "2024-05-12",
    previous: [["2024-05-05", "Return", "Closed"]]
  },
  {
    id: "dmitry",
    sourceProfileId: "src_telegram_dmitry",
    name: "Dmitry S.",
    channel: "Telegram",
    phone: "+7 916 481-77-02",
    device: "iOS",
    entry: "Telegram",
    topic: "Delivery / Address",
    clientSince: "2024-06-03",
    previous: [["2024-05-11", "Promo code", "Closed"]]
  },
  {
    id: "olga",
    sourceProfileId: "src_sdk_olga",
    name: "Olga L.",
    channel: "SDK",
    phone: "+7 985 430-09-40",
    device: "iOS",
    entry: "SDK",
    topic: "Payment / Refund",
    clientSince: "2024-03-14",
    previous: [["2024-05-28", "Card change", "Closed"]]
  }
];

const templateFixtures: TemplateRecord[] = [
  {
    id: "delay",
    title: "Delivery delay",
    scope: "team",
    channel: "SDK",
    topic: "Delivery",
    usage: 184,
    updated: "2026-06-27T08:04:00.000Z",
    text: "I understand the wait. I will check the order status and return with the delivery window.",
    version: 3
  },
  {
    id: "refund",
    title: "Refund status",
    scope: "team",
    channel: "VK",
    topic: "Payment",
    usage: 73,
    updated: "2026-06-20T12:00:00.000Z",
    text: "I will check the refund status and confirm the expected posting date.",
    version: 2
  }
];

const knowledgeFixtures: KnowledgeArticle[] = [
  {
    id: "kb-delivery-tracking",
    title: "Order tracking",
    status: "published",
    category: "Delivery",
    topics: ["Delivery / Status"],
    channels: ["SDK", "Telegram", "MAX", "VK"],
    visibility: "public",
    version: "v4.2",
    updated: "2026-06-27T10:40:00.000Z",
    owner: "Elena S.",
    usage: 312,
    helpfulRate: 89,
    body: "Check the order status in OMS and give the customer the current delivery stage.",
    attachments: [
      { id: "att-delivery-map", name: "delivery-status-map.pdf", type: "PDF", size: "1.8 MB", status: "ready" }
    ],
    versions: [
      { id: "kb-delivery-v42", label: "v4.2", status: "published", author: "Elena S.", updated: "2026-06-27T10:40:00.000Z" },
      { id: "kb-delivery-v41", label: "v4.1", status: "archived", author: "Ivan P.", updated: "2026-06-20T15:10:00.000Z" }
    ],
    approvalHistory: [
      { id: "approval-delivery-3", actor: "Elena S.", action: "published", tone: "ok" },
      { id: "approval-delivery-2", actor: "Anna R.", action: "sent_for_review", tone: "info" }
    ]
  },
  {
    id: "kb-refund-terms",
    title: "Refund timelines",
    status: "review",
    category: "Payment",
    topics: ["Payment / Refund"],
    channels: ["SDK", "VK"],
    visibility: "public",
    version: "v2.0",
    updated: "2026-06-26T17:05:00.000Z",
    owner: "Anna R.",
    usage: 147,
    helpfulRate: 82,
    body: "Refund timing depends on payment method. Always include the next step and request number.",
    attachments: [
      { id: "att-refund-policy", name: "refund-policy.pdf", type: "PDF", size: "920 KB", status: "ready" }
    ],
    versions: [
      { id: "kb-refund-v20", label: "v2.0", status: "review", author: "Anna R.", updated: "2026-06-26T17:05:00.000Z" }
    ],
    approvalHistory: [
      { id: "approval-refund-2", actor: "Anna R.", action: "sent_for_review", tone: "info" }
    ]
  },
  {
    id: "kb-auth-code",
    title: "Confirmation code not received",
    status: "draft",
    category: "Authorization",
    topics: ["Authorization / Code"],
    channels: ["VK", "MAX"],
    visibility: "internal",
    version: "v0.7",
    updated: "2026-06-22T12:00:00.000Z",
    owner: "Oleg N.",
    usage: 38,
    helpfulRate: 74,
    body: "Check code send limits and phone freshness before publishing.",
    attachments: [
      { id: "att-auth-checklist", name: "auth-checklist.md", type: "MD", size: "24 KB", status: "ready" }
    ],
    versions: [
      { id: "kb-auth-v07", label: "v0.7", status: "draft", author: "Oleg N.", updated: "2026-06-22T12:00:00.000Z" }
    ],
    approvalHistory: [
      { id: "approval-auth-1", actor: "Oleg N.", action: "created_draft", tone: "info" }
    ]
  }
];

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

  async fetchClientProfiles(filters: { maskSensitive?: boolean | string; page?: number | string; pageSize?: number | string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const page = toPositiveInt(filters.page, 1);
    const pageSize = toPositiveInt(filters.pageSize, 25);
    const maskSensitive = true;
    const profiles = await this.listClientProfiles();
    const mergeEvents = await this.workspaceRepository.listClientMergeEvents();
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
        mergeGraph: buildMergeGraph(profiles),
        pagination: {
          mode: "backend-ready",
          page,
          pageSize,
          total: profiles.length
        }
      }
    });
  }

  async mergeClientProfiles(payload: { candidateProfileId: string; primaryProfileId: string; reason?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(CLIENT_SERVICE, "mergeClientProfiles", "reason_required", "A merge reason of at least 8 characters is required.", {
        candidateProfileId: payload.candidateProfileId,
        primaryProfileId: payload.primaryProfileId
      });
    }

    await this.seedClientProfilesIfNeeded();
    const audit = auditEvent("client_merge", "client.merge", payload.reason);
    const mergeEvent = await this.workspaceRepository.saveClientMergeEvent({
      action: "client.merge",
      candidateProfileId: payload.candidateProfileId,
      id: String(audit.id),
      immutable: true,
      mergeGraphEdge: `${payload.primaryProfileId}->${payload.candidateProfileId}`,
      primaryProfileId: payload.primaryProfileId,
      reason: payload.reason
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
        conflictResolution: await this.detectConflict(payload.primaryProfileId, payload.candidateProfileId),
        sourceProfileIds: [payload.primaryProfileId, payload.candidateProfileId],
        auditEvent: mergeEvent
      }
    });
  }

  async unmergeClientProfile(payload: { detachedProfileId: string; primaryProfileId: string; reason?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(CLIENT_SERVICE, "unmergeClientProfile", "reason_required", "An unmerge reason of at least 8 characters is required.", {
        detachedProfileId: payload.detachedProfileId,
        primaryProfileId: payload.primaryProfileId
      });
    }

    await this.seedClientProfilesIfNeeded();
    const audit = auditEvent("client_merge", "client.unmerge", payload.reason);
    const mergeEvent = await this.workspaceRepository.saveClientMergeEvent({
      action: "client.unmerge",
      detachedProfileId: payload.detachedProfileId,
      id: String(audit.id),
      immutable: true,
      mergeGraphEdge: `${payload.primaryProfileId}->${payload.detachedProfileId}`,
      primaryProfileId: payload.primaryProfileId,
      reason: payload.reason
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
      tenantId: persisted.tenantId ?? "tenant-volga"
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
        tenantId: file.tenantId ?? "tenant-volga"
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
      tenantId: file.tenantId ?? "tenant-volga"
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
    await this.seedTemplatesIfNeeded();
    const auditId = makeAuditId("template");
    const saved = await this.workspaceRepository.saveTemplate({
      ...template,
      id: template.id ?? `tpl_${randomUUID()}`,
      scope: "team",
      tenantId: context.tenantId ?? "tenant-volga",
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

  async fetchKnowledgeArticles(filters: { visibility?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const articles = await this.listKnowledgeArticles();
    const items = articles.filter((article) => isKnowledgeArticleVisible(article, filters));

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "fetchKnowledgeArticles",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "fetchKnowledgeArticles"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        items: clone(items)
      }
    });
  }

  async fetchKnowledgeArticle(articleId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const article = await this.findArticle(articleId);

    if (!article) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "fetchKnowledgeArticle", "knowledge_article_not_found", `Article ${articleId} was not found.`, { articleId });
    }

    return createEnvelope({
      service: KNOWLEDGE_SERVICE,
      operation: "fetchKnowledgeArticle",
      traceId: workspaceTraceId(KNOWLEDGE_SERVICE, "fetchKnowledgeArticle"),
      meta: apiMeta({ articleId }),
      data: {
        article: clone(article)
      }
    });
  }

  async saveKnowledgeArticleDraft(payload: { articleId: string; body: string; reason?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!hasReason(payload.reason)) {
      return invalidEnvelope(KNOWLEDGE_SERVICE, "saveKnowledgeArticleDraft", "reason_required", "A knowledge draft reason of at least 8 characters is required.", {
        articleId: payload.articleId
      });
    }

    await this.seedKnowledgeIfNeeded();
    const article = await this.workspaceRepository.findKnowledgeArticle(payload.articleId);

    if (!article) {
      return notFoundEnvelope(KNOWLEDGE_SERVICE, "saveKnowledgeArticleDraft", "knowledge_article_not_found", `Article ${payload.articleId} was not found.`, {
        articleId: payload.articleId
      });
    }

    const draft = await this.workspaceRepository.saveKnowledgeArticle({
      ...article,
      body: payload.body,
      status: "draft",
      version: nextDraftVersion(article.version),
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
      meta: apiMeta({ articleId: article.id }),
      data: {
        article: draft,
        auditEvent: auditEvent("knowledge", "knowledge.article.draft", payload.reason)
      }
    });
  }

  private async findArticle(articleId: string): Promise<KnowledgeArticle | undefined> {
    const articles = await this.listKnowledgeArticles();
    return articles.find((article) => article.id === articleId);
  }

  private async detectConflict(primaryProfileId: string, candidateProfileId: string): Promise<string> {
    const profiles = await this.listClientProfiles();
    return detectConflict(profiles, primaryProfileId, candidateProfileId);
  }

  private async listClientProfiles(): Promise<ClientProfileRecord[]> {
    const profiles = await this.workspaceRepository.listClientProfiles();
    return profiles.length ? profiles : clone(clientProfiles);
  }

  private async listKnowledgeArticles(): Promise<KnowledgeArticle[]> {
    const articles = await this.workspaceRepository.listKnowledgeArticles();
    return articles.length ? articles : clone(knowledgeFixtures);
  }

  private async listTemplates(context: WorkspaceRequestContext = {}): Promise<TemplateRecord[]> {
    const templates = await this.workspaceRepository.listTemplates({ tenantId: context.tenantId });
    return templates.length ? templates : context.tenantId ? [] : clone(templateFixtures);
  }

  private async seedKnowledgeIfNeeded(): Promise<void> {
    const articles = await this.workspaceRepository.listKnowledgeArticles();
    if (articles.length > 0) {
      return;
    }

    for (const article of knowledgeFixtures) {
      await this.workspaceRepository.saveKnowledgeArticle(article);
    }
  }

  private async seedClientProfilesIfNeeded(): Promise<void> {
    const profiles = await this.workspaceRepository.listClientProfiles();
    if (profiles.length > 0) {
      return;
    }

    for (const profile of clientProfiles) {
      await this.workspaceRepository.saveClientProfile(profile);
    }
  }

  private async seedTemplatesIfNeeded(): Promise<void> {
    const templates = await this.workspaceRepository.listTemplates();
    if (templates.length > 0) {
      return;
    }

    for (const template of templateFixtures) {
      await this.workspaceRepository.saveTemplate(template);
    }
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

function sanitizeTenantId(tenantId?: string): string {
  const normalized = String(tenantId ?? "tenant-volga").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return normalized && normalized !== "." && normalized !== ".." ? normalized : "tenant-volga";
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
