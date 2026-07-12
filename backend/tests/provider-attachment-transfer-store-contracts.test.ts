import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPrismaProviderAttachmentTransferStore,
  type PrismaProviderAttachmentTransferClient,
  type ProviderAttachmentTransferKey
} from "../apps/outbox-worker/src/provider-attachment-transfer-store.ts";

const baseKey: ProviderAttachmentTransferKey = {
  channelConnectionId: "connection-vk-1",
  contentVersion: "sha256:ed1f0f65d57e",
  fileId: "file-1",
  provider: "vk",
  tenantId: "tenant-a"
};

describe("provider attachment transfer store", () => {
  it("keeps a transfer unique to tenant, connection, provider, file and content version", async () => {
    const client = createClient();
    const store = createPrismaProviderAttachmentTransferStore(client);

    const created = await store.upsert(baseKey);
    const replay = await store.upsert(baseKey);
    const otherTenant = await store.upsert({ ...baseKey, tenantId: "tenant-b" });
    const otherVersion = await store.upsert({ ...baseKey, contentVersion: "sha256:8ad8757baa84" });

    assert.equal(created.status, "pending");
    assert.equal(created.attempts, 0);
    assert.equal(replay.id, created.id);
    assert.notEqual(otherTenant.id, created.id);
    assert.notEqual(otherVersion.id, created.id);
    assert.equal(client.rows.size, 3);
  });

  it("persists attempts and successful VK/MAX provider references", async () => {
    const client = createClient();
    const store = createPrismaProviderAttachmentTransferStore(client);

    await store.upsert(baseKey);
    const attempted = await store.markAttempt(baseKey);
    const vkUploaded = await store.markUploaded({ ...baseKey, providerAttachmentId: "doc42_17" });
    const maxKey = { ...baseKey, channelConnectionId: "connection-max-1", provider: "max" as const };
    await store.upsert(maxKey);
    const maxUploaded = await store.markUploaded({ ...maxKey, providerAttachmentToken: "max-upload-token" });

    assert.equal(attempted.attempts, 1);
    assert.equal(attempted.status, "pending");
    assert.equal(vkUploaded.status, "uploaded");
    assert.equal(vkUploaded.providerAttachmentId, "doc42_17");
    assert.equal(vkUploaded.providerAttachmentToken, null);
    assert.equal(maxUploaded.status, "uploaded");
    assert.equal(maxUploaded.providerAttachmentId, null);
    assert.equal(maxUploaded.providerAttachmentToken, "max-upload-token");
  });

  it("records a sanitized failure without exposing provider tokens", async () => {
    const client = createClient();
    const store = createPrismaProviderAttachmentTransferStore(client);
    await store.upsert(baseKey);

    const failed = await store.markFailed({
      ...baseKey,
      error: "provider rejected authorization=secret-value; Bearer another-secret"
    });

    assert.equal(failed.status, "failed");
    assert.match(failed.error ?? "", /authorization=\[redacted\]/);
    assert.match(failed.error ?? "", /Bearer \[redacted\]/);
    assert.doesNotMatch(failed.error ?? "", /secret-value|another-secret/);
  });

  it("rejects incomplete identities and uploaded states without a provider reference", async () => {
    const store = createPrismaProviderAttachmentTransferStore(createClient());

    await assert.rejects(() => store.upsert({ ...baseKey, contentVersion: " " }), /provider_attachment_content_version_required/);
    await store.upsert(baseKey);
    await assert.rejects(() => store.markUploaded(baseKey), /provider_attachment_reference_required/);
  });
});

function createClient(): PrismaProviderAttachmentTransferClient & { rows: Map<string, TransferRow> } {
  const rows = new Map<string, TransferRow>();
  const rowKey = (identity: Identity) => [identity.tenantId, identity.channelConnectionId, identity.provider, identity.fileId, identity.contentVersion].join("\u0000");
  const clone = (row: TransferRow) => ({ ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) });

  return {
    rows,
    providerAttachmentTransfer: {
      async findUnique({ where }) {
        const row = rows.get(rowKey(where.tenantId_channelConnectionId_provider_fileId_contentVersion));
        return row ? clone(row) : null;
      },
      async update({ data, where }) {
        const key = rowKey(where.tenantId_channelConnectionId_provider_fileId_contentVersion);
        const current = rows.get(key);
        if (!current) {
          throw new Error("record_not_found");
        }
        const attempts = data.attempts as { increment?: number } | undefined;
        const next: TransferRow = {
          ...current,
          ...(typeof data.error === "string" || data.error === null ? { error: data.error as string | null } : {}),
          ...(typeof data.providerAttachmentId === "string" || data.providerAttachmentId === null
            ? { providerAttachmentId: data.providerAttachmentId as string | null }
            : {}),
          ...(typeof data.providerAttachmentToken === "string" || data.providerAttachmentToken === null
            ? { providerAttachmentToken: data.providerAttachmentToken as string | null }
            : {}),
          ...(typeof data.status === "string" ? { status: data.status } : {}),
          ...(attempts?.increment ? { attempts: current.attempts + attempts.increment } : {}),
          updatedAt: new Date("2026-07-12T12:00:01.000Z")
        };
        rows.set(key, next);
        return clone(next);
      },
      async upsert({ create, update: _update, where }) {
        const key = rowKey(where.tenantId_channelConnectionId_provider_fileId_contentVersion);
        const existing = rows.get(key);
        if (existing) {
          return clone(existing);
        }
        const now = new Date("2026-07-12T12:00:00.000Z");
        const row: TransferRow = {
          attempts: Number(create.attempts),
          channelConnectionId: String(create.channelConnectionId),
          contentVersion: String(create.contentVersion),
          createdAt: now,
          error: create.error as string | null,
          fileId: String(create.fileId),
          id: String(create.id),
          provider: String(create.provider),
          providerAttachmentId: create.providerAttachmentId as string | null,
          providerAttachmentToken: create.providerAttachmentToken as string | null,
          status: String(create.status),
          tenantId: String(create.tenantId),
          updatedAt: now
        };
        rows.set(key, row);
        return clone(row);
      }
    }
  };
}

type Identity = {
  channelConnectionId: string;
  contentVersion: string;
  fileId: string;
  provider: string;
  tenantId: string;
};

type TransferRow = Identity & {
  attempts: number;
  createdAt: Date;
  error: string | null;
  id: string;
  providerAttachmentId: string | null;
  providerAttachmentToken: string | null;
  status: string;
  updatedAt: Date;
};
