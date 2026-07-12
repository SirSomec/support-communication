import { createHash } from "node:crypto";

export type ProviderAttachmentTransferStatus = "pending" | "uploaded" | "failed";

export interface ProviderAttachmentTransferKey {
  channelConnectionId: string;
  contentVersion: string;
  fileId: string;
  provider: "max" | "vk";
  tenantId: string;
}

export interface ProviderAttachmentTransfer extends ProviderAttachmentTransferKey {
  attempts: number;
  createdAt: string;
  error: string | null;
  id: string;
  providerAttachmentId: string | null;
  providerAttachmentToken: string | null;
  status: ProviderAttachmentTransferStatus;
  updatedAt: string;
}

export interface ProviderAttachmentTransferStore {
  find(key: ProviderAttachmentTransferKey): Promise<ProviderAttachmentTransfer | null>;
  markAttempt(key: ProviderAttachmentTransferKey): Promise<ProviderAttachmentTransfer>;
  markFailed(input: ProviderAttachmentTransferKey & { error: string }): Promise<ProviderAttachmentTransfer>;
  markUploaded(input: ProviderAttachmentTransferKey & { providerAttachmentId?: string; providerAttachmentToken?: string }): Promise<ProviderAttachmentTransfer>;
  upsert(key: ProviderAttachmentTransferKey): Promise<ProviderAttachmentTransfer>;
}

type ProviderAttachmentTransferRow = {
  attempts: number;
  channelConnectionId: string;
  contentVersion: string;
  createdAt: Date;
  error: string | null;
  fileId: string;
  id: string;
  provider: string;
  providerAttachmentId: string | null;
  providerAttachmentToken: string | null;
  status: string;
  tenantId: string;
  updatedAt: Date;
};

type TransferIdentity = {
  channelConnectionId: string;
  contentVersion: string;
  fileId: string;
  provider: string;
  tenantId: string;
};

export interface PrismaProviderAttachmentTransferClient {
  providerAttachmentTransfer: {
    findUnique(args: { where: { tenantId_channelConnectionId_provider_fileId_contentVersion: TransferIdentity } }): Promise<ProviderAttachmentTransferRow | null>;
    update(args: {
      data: Record<string, unknown>;
      where: { tenantId_channelConnectionId_provider_fileId_contentVersion: TransferIdentity };
    }): Promise<ProviderAttachmentTransferRow>;
    upsert(args: {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      where: { tenantId_channelConnectionId_provider_fileId_contentVersion: TransferIdentity };
    }): Promise<ProviderAttachmentTransferRow>;
  };
}

export function createPrismaProviderAttachmentTransferStore(client: PrismaProviderAttachmentTransferClient): ProviderAttachmentTransferStore {
  return {
    async find(key) {
      const identity = transferIdentity(key);
      const row = await client.providerAttachmentTransfer.findUnique({
        where: { tenantId_channelConnectionId_provider_fileId_contentVersion: identity }
      });
      return row ? fromRow(row) : null;
    },

    async markAttempt(key) {
      const identity = transferIdentity(key);
      return fromRow(await client.providerAttachmentTransfer.update({
        data: { attempts: { increment: 1 }, error: null, status: "pending" },
        where: { tenantId_channelConnectionId_provider_fileId_contentVersion: identity }
      }));
    },

    async markFailed(input) {
      const identity = transferIdentity(input);
      return fromRow(await client.providerAttachmentTransfer.update({
        data: { error: sanitizeError(input.error), status: "failed" },
        where: { tenantId_channelConnectionId_provider_fileId_contentVersion: identity }
      }));
    },

    async markUploaded(input) {
      const identity = transferIdentity(input);
      const providerAttachmentId = nullableText(input.providerAttachmentId);
      const providerAttachmentToken = nullableText(input.providerAttachmentToken);
      if (!providerAttachmentId && !providerAttachmentToken) {
        throw new Error("provider_attachment_reference_required");
      }
      return fromRow(await client.providerAttachmentTransfer.update({
        data: { error: null, providerAttachmentId, providerAttachmentToken, status: "uploaded" },
        where: { tenantId_channelConnectionId_provider_fileId_contentVersion: identity }
      }));
    },

    async upsert(key) {
      const identity = transferIdentity(key);
      return fromRow(await client.providerAttachmentTransfer.upsert({
        create: {
          ...identity,
          attempts: 0,
          error: null,
          id: transferId(identity),
          providerAttachmentId: null,
          providerAttachmentToken: null,
          status: "pending"
        },
        update: {},
        where: { tenantId_channelConnectionId_provider_fileId_contentVersion: identity }
      }));
    }
  };
}

function transferIdentity(key: ProviderAttachmentTransferKey): TransferIdentity {
  const provider = requiredText(key.provider, "provider_attachment_provider_required").toLowerCase();
  if (provider !== "max" && provider !== "vk") {
    throw new Error("provider_attachment_provider_unsupported");
  }
  return {
    channelConnectionId: requiredText(key.channelConnectionId, "provider_attachment_connection_required"),
    contentVersion: requiredText(key.contentVersion, "provider_attachment_content_version_required"),
    fileId: requiredText(key.fileId, "provider_attachment_file_required"),
    provider,
    tenantId: requiredText(key.tenantId, "provider_attachment_tenant_required")
  };
}

function fromRow(row: ProviderAttachmentTransferRow): ProviderAttachmentTransfer {
  if (row.status !== "pending" && row.status !== "uploaded" && row.status !== "failed") {
    throw new Error("provider_attachment_transfer_status_invalid");
  }
  return {
    attempts: row.attempts,
    channelConnectionId: row.channelConnectionId,
    contentVersion: row.contentVersion,
    createdAt: row.createdAt.toISOString(),
    error: row.error,
    fileId: row.fileId,
    id: row.id,
    provider: row.provider === "max" || row.provider === "vk" ? row.provider : invalidProvider(row.provider),
    providerAttachmentId: row.providerAttachmentId,
    providerAttachmentToken: row.providerAttachmentToken,
    status: row.status,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString()
  };
}

function invalidProvider(_provider: string): never {
  throw new Error("provider_attachment_provider_unsupported");
}

function nullableText(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: string, errorCode: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(errorCode);
  }
  return normalized;
}

function sanitizeError(value: string): string {
  return requiredText(value, "provider_attachment_error_required")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/((?:access_?token|token|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function transferId(identity: TransferIdentity): string {
  const value = [identity.tenantId, identity.channelConnectionId, identity.provider, identity.fileId, identity.contentVersion].join("\u0000");
  return `pat_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}
