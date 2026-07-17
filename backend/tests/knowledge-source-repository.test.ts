import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KnowledgeSourceRepository,
  type KnowledgeDocumentIngestionJob,
  type KnowledgeSourcePrismaClient,
  type PrismaKnowledgeIngestionJobRow
} from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import type { KnowledgeSourceRecord } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.types.ts";

function source(overrides: Partial<KnowledgeSourceRecord> = {}): KnowledgeSourceRecord {
  return {
    approvalStatus: "pending",
    approvedAt: null,
    approvedBy: null,
    archivedAt: null,
    contentChecksum: null,
    createdAt: "2026-07-12T10:00:00.000Z",
    disabledAt: null,
    failedAt: null,
    failureCode: null,
    id: "source-1",
    kind: "document",
    lastIndexedAt: null,
    lastIngestedAt: null,
    metadata: {},
    owner: "  support-admin  ",
    readiness: "ready",
    retentionUntil: null,
    sourceConfig: {},
    sourceRef: "  file-1  ",
    status: "ready",
    tenantId: "  tenant-volga  ",
    title: "  Product guide  ",
    updatedAt: "2026-07-12T10:00:00.000Z",
    version: 0,
    ...overrides
  };
}

function ingestionJob(overrides: Partial<KnowledgeDocumentIngestionJob> = {}): KnowledgeDocumentIngestionJob {
  return {
    attempts: 0,
    createdAt: "2026-07-12T10:00:00.000Z",
    errorCode: null,
    fileId: "file-1",
    fingerprint: "fingerprint-1",
    idempotencyKey: "ingestion-key-1",
    jobId: "job-1",
    sourceId: "source-1",
    status: "pending",
    tenantId: "tenant-volga",
    updatedAt: "2026-07-12T10:00:00.000Z",
    ...overrides
  };
}

describe("KnowledgeSourceRepository", () => {
  it("keeps sources tenant scoped for list, find and overwrite", () => {
    const repository = KnowledgeSourceRepository.inMemory();
    repository.save(source());
    repository.save(source({ id: "source-1", tenantId: "tenant-ladoga", title: "Other tenant" }));

    assert.equal(repository.list("tenant-volga").length, 1);
    assert.equal(repository.list("tenant-ladoga").length, 1);
    assert.equal(repository.find("tenant-ladoga", "source-1")?.title, "Other tenant");
    assert.equal(repository.find("tenant-volga", "source-1")?.title, "Product guide");

    repository.save(source({ title: "Updated guide" }));
    assert.equal(repository.list("tenant-volga").length, 1);
    assert.equal(repository.find("tenant-volga", "source-1")?.title, "Updated guide");
  });

  it("normalizes the retrieval lifecycle and returns defensive copies", () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const saved = repository.save(source({ approvalStatus: "approved", metadata: { nested: { value: 1 } }, sourceConfig: null as unknown as Record<string, unknown> }));

    assert.equal(saved.tenantId, "tenant-volga");
    assert.equal(saved.title, "Product guide");
    assert.equal(saved.owner, "support-admin");
    assert.equal(saved.sourceRef, "file-1");
    assert.equal(saved.readiness, "ready");
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.sourceConfig, {});

    (saved.metadata.nested as { value: number }).value = 2;
    assert.equal(((repository.find("tenant-volga", "source-1")?.metadata.nested as { value: number }).value), 1);

    const pending = repository.save(source({ id: "source-pending", status: "ready", approvalStatus: "pending" }));
    const disabled = repository.save(source({ id: "source-disabled", status: "disabled", approvalStatus: "approved" }));
    assert.equal(pending.readiness, "stale");
    assert.equal(disabled.readiness, "not_ready");
  });

  it("rejects malformed source lifecycle values", () => {
    const repository = KnowledgeSourceRepository.inMemory();
    assert.throws(() => repository.save(source({ status: "unknown" as KnowledgeSourceRecord["status"] })), /knowledge_source_status_invalid/);
    assert.throws(() => repository.save(source({ tenantId: " " })), /knowledge_source_tenant_required/);
  });

  it("reclaims stale ingestion jobs and fails exhausted leases", () => {
    const repository = KnowledgeSourceRepository.inMemory({
      ingestionJobs: [
        ingestionJob({ attempts: 1, jobId: "job-stale", status: "processing", updatedAt: "2020-01-01T00:00:00.000Z" }),
        ingestionJob({ attempts: 5, idempotencyKey: "exhausted", jobId: "job-exhausted", status: "processing", updatedAt: "2020-01-01T00:00:00.000Z" })
      ],
      sources: []
    });

    const claimed = repository.claimNextIngestionJob();

    assert.equal(claimed?.jobId, "job-stale");
    assert.equal(claimed?.attempts, 2);
    assert.equal(repository.findIngestionJob("tenant-volga", "exhausted")?.status, "failed");
    assert.equal(repository.findIngestionJob("tenant-volga", "exhausted")?.errorCode, "knowledge_ingestion_attempts_exhausted");
  });

  it("drops source ingestion jobs together with an in-memory source", () => {
    const repository = KnowledgeSourceRepository.inMemory({ ingestionJobs: [ingestionJob()], sources: [source()] });

    repository.delete("tenant-volga", "source-1");

    assert.equal(repository.find("tenant-volga", "source-1"), undefined);
    assert.equal(repository.findIngestionJob("tenant-volga", "ingestion-key-1"), undefined);
  });

  it("recovers a concurrent Prisma idempotency insert and cascades source job deletion", async () => {
    let storedJob: PrismaKnowledgeIngestionJobRow | null = null;
    const deleted: string[] = [];
    const client: KnowledgeSourcePrismaClient = {
      knowledgeIngestionJob: {
        create: async ({ data }) => {
          storedJob = data;
          throw Object.assign(new Error("unique constraint"), { code: "P2002" });
        },
        deleteMany: async ({ where }) => { deleted.push(`jobs:${where.tenantId}:${where.sourceId}`); return { count: 1 }; },
        findFirst: async ({ where }) => where.idempotencyKey && storedJob ? storedJob : null,
        findUnique: async () => storedJob,
        updateMany: async () => ({ count: 0 })
      },
      knowledgeSource: {
        deleteMany: async ({ where }) => { deleted.push(`source:${where.tenantId}:${where.id}`); return { count: 1 }; },
        findMany: async () => [],
        upsert: async () => { throw new Error("not used"); }
      }
    };
    const repository = KnowledgeSourceRepository.prisma({ client });

    const saved = await repository.saveIngestionJob(ingestionJob());
    await repository.delete("tenant-volga", "source-1");

    assert.equal(saved.idempotencyKey, "ingestion-key-1");
    assert.deepEqual(deleted, ["jobs:tenant-volga:source-1", "source:tenant-volga:source-1"]);
  });
});
