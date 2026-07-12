import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeRetrievalCache, buildRetrievalCacheKey } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-cache.ts";
import { KnowledgeRetrievalService } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";

const source = (tenantId: string, id: string, version = 2, text = "Доставка заказа занимает три рабочих дня.") => ({
  approvalStatus: "approved" as const,
  approvedAt: "2026-07-12T10:00:00.000Z",
  approvedBy: "admin",
  archivedAt: null,
  contentChecksum: "sum",
  createdAt: "2026-07-12T10:00:00.000Z",
  disabledAt: null,
  failedAt: null,
  failureCode: null,
  id,
  kind: "url" as const,
  lastIndexedAt: "2026-07-12T10:00:00.000Z",
  lastIngestedAt: "2026-07-12T10:00:00.000Z",
  metadata: { extractedText: text },
  owner: "admin",
  readiness: "ready" as const,
  retentionUntil: null,
  sourceConfig: {},
  sourceRef: null,
  status: "ready" as const,
  tenantId,
  title: id,
  updatedAt: "2026-07-12T10:00:00.000Z",
  version
});

describe("BAI-506 revision-aware retrieval cache", () => {
  it("builds tenant and revision-aware keys without raw PII punctuation noise", () => {
    const left = buildRetrievalCacheKey({
      query: "Где мой заказ, пожалуйста?!",
      sourceBindings: [{ sourceId: "b", sourceVersion: "2" }, { sourceId: "a", sourceVersion: "1" }],
      tenantId: "tenant-a",
      tokenBudget: 200
    });
    const right = buildRetrievalCacheKey({
      query: "пожалуйста где мой заказ",
      sourceBindings: [{ sourceId: "a", sourceVersion: "1" }, { sourceId: "b", sourceVersion: "2" }],
      tenantId: "tenant-a",
      tokenBudget: 200
    });
    assert.equal(left, right);
    assert.match(left, /^kr:v1:tenant-a:a@1,b@2:200:/);
    assert.notEqual(
      left,
      buildRetrievalCacheKey({
        query: "где мой заказ",
        sourceBindings: [{ sourceId: "a", sourceVersion: "2" }, { sourceId: "b", sourceVersion: "2" }],
        tenantId: "tenant-a",
        tokenBudget: 200
      })
    );
  });

  it("returns cache hits for identical tenant/revision queries and misses across tenants or revisions", async () => {
    const repository = KnowledgeSourceRepository.inMemory({
      ingestionJobs: [],
      sources: [source("tenant-a", "ready", 2), source("tenant-b", "ready", 2)]
    });
    const cache = new KnowledgeRetrievalCache();
    const service = new KnowledgeRetrievalService(repository, undefined, cache);
    const input = {
      query: "Сколько занимает доставка заказа?",
      sourceBindings: [{ sourceId: "ready", sourceVersion: "2" }],
      tenantId: "tenant-a",
      tokenBudget: 200
    };

    const first = await service.retrieve(input);
    const second = await service.retrieve(input);
    assert.equal(first.cache, "miss");
    assert.equal(second.cache, "hit");
    assert.deepEqual(second.passages, first.passages);
    assert.equal(cache.metrics.hits, 1);
    assert.equal(cache.metrics.misses, 1);

    const otherTenant = await service.retrieve({ ...input, tenantId: "tenant-b" });
    assert.equal(otherTenant.cache, "miss");
    assert.equal(otherTenant.passages.length, 1);

    repository.save({ ...source("tenant-a", "ready", 3, "Доставка заказа занимает пять рабочих дней.") });
    const afterRevision = await service.retrieve({
      ...input,
      sourceBindings: [{ sourceId: "ready", sourceVersion: "3" }]
    });
    assert.equal(afterRevision.cache, "miss");
    assert.match(afterRevision.passages[0]?.content ?? "", /пять/);
  });

  it("purges cached retrievals when a source changes and never treats a hit as policy bypass evidence", async () => {
    const repository = KnowledgeSourceRepository.inMemory({
      ingestionJobs: [],
      sources: [source("tenant-a", "ready", 2)]
    });
    const cache = new KnowledgeRetrievalCache();
    KnowledgeRetrievalCache.useDefault(cache);
    const service = new KnowledgeRetrievalService(repository, undefined, cache);
    const input = {
      query: "доставка заказа",
      sourceBindings: [{ sourceId: "ready", sourceVersion: "2" }],
      tenantId: "tenant-a",
      tokenBudget: 200
    };

    assert.equal((await service.retrieve(input)).cache, "miss");
    assert.equal((await service.retrieve(input)).cache, "hit");

    repository.save({ ...source("tenant-a", "ready", 2), disabledAt: "2026-07-12T12:00:00.000Z", readiness: "not_ready", status: "disabled" });
    assert.ok(cache.metrics.purges >= 1);

    const afterDisable = await service.retrieve(input);
    assert.equal(afterDisable.cache, "miss");
    assert.equal(afterDisable.passages.length, 0);
    assert.equal(cache.metrics.hits, 1);
  });
});
