import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeRetrievalService } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { KnowledgeRetrievalApiService } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-api.service.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { KnowledgeRetrievalCache } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-cache.ts";

const source = (tenantId: string, id: string, approvalStatus: "approved" | "pending" = "approved") => ({ approvalStatus, approvedAt: approvalStatus === "approved" ? "2026-07-12T10:00:00.000Z" : null, approvedBy: approvalStatus === "approved" ? "admin" : null, archivedAt: null, contentChecksum: "sum", createdAt: "2026-07-12T10:00:00.000Z", disabledAt: null, failedAt: null, failureCode: null, id, kind: "url" as const, lastIndexedAt: "2026-07-12T10:00:00.000Z", lastIngestedAt: "2026-07-12T10:00:00.000Z", metadata: { extractedText: "Доставка заказа занимает три рабочих дня. Возврат оформляется через оператора." }, owner: "admin", readiness: approvalStatus === "approved" ? "ready" as const : "stale" as const, retentionUntil: null, sourceConfig: {}, sourceRef: null, status: "ready" as const, tenantId, title: id, updatedAt: "2026-07-12T10:00:00.000Z", version: 2 });

describe("knowledge retrieval", () => {
  it("returns only bound, approved tenant sources with versioned offset citations and budget", async () => {
    const repository = KnowledgeSourceRepository.inMemory({ sources: [source("tenant-a", "ready"), source("tenant-a", "pending", "pending"), { ...source("tenant-a", "disabled"), disabledAt: "2026-07-12T11:00:00.000Z", readiness: "not_ready", status: "disabled" }, { ...source("tenant-a", "failed"), failedAt: "2026-07-12T11:00:00.000Z", readiness: "not_ready", status: "failed" }, source("tenant-b", "foreign")] });
    const result = await new KnowledgeRetrievalService(repository).retrieve({ query: "Сколько занимает доставка заказа?", sourceBindings: [{ sourceId: "ready", sourceVersion: "2" }, { sourceId: "pending" }, { sourceId: "disabled" }, { sourceId: "failed" }, { sourceId: "foreign" }], tenantId: "tenant-a", tokenBudget: 200 });
    assert.equal(result.passages.length, 1); assert.equal(result.passages[0]?.citation.sourceId, "ready"); assert.equal(result.passages[0]?.citation.sourceVersion, 2);
    assert.equal(typeof result.passages[0]?.citation.startOffset, "number"); assert.ok(result.tokensUsed <= result.tokenBudget);
  });

  it("rejects stale pinned versions and irrelevant material", async () => {
    const repository = KnowledgeSourceRepository.inMemory({ sources: [source("tenant-a", "ready")] });
    const service = new KnowledgeRetrievalService(repository);
    assert.equal((await service.retrieve({ query: "доставка", sourceBindings: [{ sourceId: "ready", sourceVersion: "1" }], tenantId: "tenant-a" })).passages.length, 0);
    assert.equal((await service.retrieve({ query: "космический корабль", sourceBindings: [{ sourceId: "ready" }], tenantId: "tenant-a" })).passages.length, 0);
  });

  it("does not reuse cached passages across different score thresholds", async () => {
    const repository = KnowledgeSourceRepository.inMemory({ sources: [source("tenant-a", "ready")] });
    const cache = new KnowledgeRetrievalCache();
    const service = new KnowledgeRetrievalService(repository, undefined, cache);
    const permissive = await service.retrieve({
      query: "доставка неизвестное",
      scoreThreshold: 0.05,
      sourceBindings: [{ sourceId: "ready" }],
      tenantId: "tenant-a"
    });
    const strict = await service.retrieve({
      query: "доставка неизвестное",
      scoreThreshold: 0.99,
      sourceBindings: [{ sourceId: "ready" }],
      tenantId: "tenant-a"
    });

    assert.equal(permissive.passages.length, 1);
    assert.equal(strict.cache, "miss");
    assert.equal(strict.passages.length, 0);
  });

  it("takes bindings from the tenant scenario instead of trusting caller-provided source ids", async () => {
    const sources = KnowledgeSourceRepository.inMemory({ sources: [source("tenant-a", "ready"), source("tenant-b", "foreign")] });
    const automation = AutomationRepository.inMemory();
    await automation.saveBotScenario({ channels: ["SDK"], flowEdges: [], flowNodes: [], id: "bot-a", name: "Bot", schemaVersion: "bot-flow/v1", sourceBindings: [{ sourceId: "ready" }], status: "published", tenantId: "tenant-a" });
    const api = new KnowledgeRetrievalApiService(new KnowledgeRetrievalService(sources), automation);
    const result = await api.retrieveScenario({ query: "доставка заказа", scenarioId: "bot-a", tenantId: "tenant-a", tokenBudget: 200 });
    const foreign = await api.retrieveScenario({ query: "доставка заказа", scenarioId: "bot-a", tenantId: "tenant-b", tokenBudget: 200 });
    assert.equal(result.status, "ok"); assert.equal((result.data.passages as Array<unknown>).length, 1);
    assert.equal(foreign.error?.code, "knowledge_retrieval_scenario_not_found");
  });
});
