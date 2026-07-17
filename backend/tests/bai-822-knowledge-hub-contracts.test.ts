import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AiBotResponseService } from "../apps/api-gateway/src/automation/ai-bot-response.service.ts";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";
import { AgentSessionStateRepository } from "../apps/api-gateway/src/automation/agent-session-state.repository.ts";
import { KnowledgeRetrievalApiService } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-api.service.ts";
import { KnowledgeRetrievalService } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import type { KnowledgeSourceRecord } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.types.ts";
import { KnowledgeSourcesService } from "../apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts";
import { McpConnectorRepository } from "../apps/api-gateway/src/knowledge-sources/mcp-connector.repository.ts";
import {
  UnansweredQuestionRepository,
  type PrismaUnansweredQuestionRow,
  type UnansweredQuestionPrismaClient
} from "../apps/api-gateway/src/knowledge-sources/unanswered-question.repository.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

const TENANT = "tenant-volga";

function readySource(id: string, tenantId = TENANT) {
  return {
    approvalStatus: "approved" as const,
    approvedAt: "2026-07-14T09:00:00.000Z",
    approvedBy: "admin",
    archivedAt: null,
    contentChecksum: "sum",
    createdAt: "2026-07-14T09:00:00.000Z",
    disabledAt: null,
    failedAt: null,
    failureCode: null,
    id,
    kind: "document" as const,
    lastIndexedAt: "2026-07-14T09:00:00.000Z",
    lastIngestedAt: "2026-07-14T09:00:00.000Z",
    metadata: { chunks: [{ content: "Доставка заказа занимает три рабочих дня по будням.", endOffset: 52, id: "chunk_1", startOffset: 0 }], language: "ru" },
    owner: "admin",
    readiness: "ready" as const,
    retentionUntil: null,
    sourceConfig: { articleId: "kb-1" },
    sourceRef: "kb-1",
    status: "ready" as const,
    tenantId,
    title: `Источник ${id}`,
    updatedAt: "2026-07-14T09:00:00.000Z",
    version: 1
  };
}

function serviceWith(sources: KnowledgeSourceRecord[], automation = AutomationRepository.inMemory()) {
  const repository = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources });
  const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), {}, undefined, undefined, automation);
  return { automation, repository, service };
}

describe("BAI-822 source manager operations", () => {
  it("lists sources with scenario usage including draft overlays", async () => {
    const automation = AutomationRepository.inMemory({
      ...createEmptyAutomationState(),
      botScenarios: [
        { channels: ["SDK"], draft: { sourceBindings: [{ sourceId: "src-2" }], updatedAt: "2026-07-14T10:00:00.000Z" }, flowEdges: [], flowNodes: [{ id: "s", type: "message" }], id: "bot-1", name: "Бот-1", schemaVersion: "bot-flow/v1", sourceBindings: [{ sourceId: "src-1" }], status: "published", tenantId: TENANT }
      ]
    });
    const { service } = serviceWith([readySource("src-1"), readySource("src-2")], automation);
    const list = await service.list(TENANT);
    const usage = list.data.usage as Record<string, Array<{ scenarioId: string }>>;
    assert.equal(usage["src-1"]?.[0]?.scenarioId, "bot-1");
    assert.equal(usage["src-2"]?.[0]?.scenarioId, "bot-1");
  });

  it("renames, disables, enables and previews a source", async () => {
    const { service } = serviceWith([readySource("src-1")]);
    const renamed = await service.update(TENANT, "src-1", { title: "Правила доставки" });
    assert.equal((renamed.data.source as { title: string }).title, "Правила доставки");

    await service.disable(TENANT, "src-1");
    const enabled = await service.enable(TENANT, "src-1");
    assert.equal((enabled.data.source as { status: string }).status, "ready");

    const preview = await service.preview(TENANT, "src-1");
    assert.equal(preview.data.chunkCount, 1);
    assert.equal(String((preview.data.chunks as Array<{ content: string }>)[0]?.content).includes("три рабочих дня"), true);
  });

  it("restores an approved MCP source to ready after disable and blocks archived resurrection", async () => {
    McpConnectorRepository.useDefault(McpConnectorRepository.inMemory({
      connectors: [{
        allowedHosts: ["mcp.example.test"],
        approvedAt: "2026-07-14T09:00:00.000Z",
        approvedBy: "service-admin",
        createdAt: "2026-07-14T09:00:00.000Z",
        endpoint: "https://mcp.example.test/rpc",
        id: "mcp-ready",
        rateLimitPerMinute: 60,
        status: "enabled",
        tenantId: TENANT,
        tools: [{ mode: "read", name: "search" }],
        updatedAt: "2026-07-14T09:00:00.000Z"
      }]
    }));
    try {
      const source: KnowledgeSourceRecord = {
        ...readySource("src-mcp"),
        kind: "mcp",
        metadata: { connectorName: "MCP" },
        sourceConfig: { connectorId: "mcp-ready", tool: "search" },
        sourceRef: null
      };
      const { repository, service } = serviceWith([source]);

      await service.disable(TENANT, source.id);
      const enabled = await service.enable(TENANT, source.id);
      assert.equal((enabled.data.source as { readiness: string }).readiness, "ready");
      assert.equal((enabled.data.source as { status: string }).status, "ready");

      await repository.save({ ...(await repository.find(TENANT, source.id))!, status: "archived" });
      const blocked = await service.disable(TENANT, source.id);
      assert.equal(blocked.error?.code, "knowledge_source_transition_invalid");
    } finally {
      McpConnectorRepository.clearDefault();
    }
  });

  it("auto-unbinds a source from scenarios on archive and delete instead of blocking", async () => {
    const automation = AutomationRepository.inMemory({
      ...createEmptyAutomationState(),
      botScenarios: [
        { channels: ["SDK"], flowEdges: [], flowNodes: [{ id: "s", type: "message" }], id: "bot-1", name: "Бот-1", schemaVersion: "bot-flow/v1", sourceBindings: [{ sourceId: "src-1" }, { sourceId: "src-keep" }], draft: { sourceBindings: [{ sourceId: "src-1" }] }, status: "published", tenantId: TENANT }
      ]
    });
    const { repository, service } = serviceWith([readySource("src-1"), readySource("src-keep")], automation);

    // Привязка к боту больше не блокирует: архивация сразу проходит и отвязывает источник.
    const archived = await service.archive(TENANT, "src-1");
    assert.equal((archived.data.source as { status: string }).status, "archived");
    assert.deepEqual(archived.data.unboundScenarios, ["Бот-1"]);

    const scenario = (await automation.readStateAsync()).botScenarios[0]!;
    assert.deepEqual((scenario.sourceBindings ?? []).map((b) => b.sourceId), ["src-keep"]);
    assert.deepEqual((scenario.draft?.sourceBindings ?? []).map((b) => b.sourceId), []);

    const removed = await service.remove(TENANT, "src-1");
    assert.equal(removed.data.deleted, true);
    assert.equal(repository.find(TENANT, "src-1"), undefined);
  });

  it("keeps every operation tenant-scoped", async () => {
    const { service } = serviceWith([readySource("src-1")]);
    for (const result of [
      await service.update("tenant-ladoga", "src-1", { title: "x" }),
      await service.enable("tenant-ladoga", "src-1"),
      await service.archive("tenant-ladoga", "src-1"),
      await service.remove("tenant-ladoga", "src-1"),
      await service.preview("tenant-ladoga", "src-1")
    ]) {
      assert.equal(result.error?.code, "knowledge_source_not_found");
    }
  });

  it("marks document sources when their article publishes a new version", () => {
    const repository = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [readySource("src-1")] });
    const marked = repository.markArticleUpdated(TENANT, "kb-1", "v7");
    assert.equal(marked, 1);
    const source = repository.find(TENANT, "src-1");
    assert.equal(source?.metadata.pendingArticleVersion, "v7");
    assert.equal(typeof source?.metadata.articleUpdatedAt, "string");
  });
});

describe("BAI-825 retrieval by explicit sources", () => {
  it("searches explicit tenant sources and skips non-indexed ones (approval retired)", async () => {
    // Одобрение выведено из эксплуатации: проиндексированный источник используется
    // безусловно, но отключённый/неготовый в retrieval по-прежнему не попадает.
    const sources = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [readySource("src-1"), { ...readySource("src-2"), disabledAt: "2026-07-12T11:00:00.000Z", readiness: "not_ready" as const, status: "disabled" as const }] });
    const api = new KnowledgeRetrievalApiService(new KnowledgeRetrievalService(sources), AutomationRepository.inMemory());
    const result = await api.retrieveScenario({ query: "Сколько занимает доставка заказа?", sourceIds: ["src-1", "src-2"], tenantId: TENANT, tokenBudget: 300 });
    assert.equal(result.status, "ok");
    const passages = result.data.passages as Array<{ citation: { sourceId: string } }>;
    assert.equal(passages.length, 1);
    assert.equal(passages[0]?.citation.sourceId, "src-1");
  });

  it("retrieves object-shaped document chunks (regression)", async () => {
    const sources = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [readySource("src-1")] });
    const result = await new KnowledgeRetrievalService(sources).retrieve({
      query: "доставка заказа",
      sourceBindings: [{ sourceId: "src-1" }],
      tenantId: TENANT
    });
    assert.equal(result.passages.length, 1);
  });
});

describe("BAI-826 unanswered questions", () => {
  beforeEach(() => {
    UnansweredQuestionRepository.clearDefault();
    AiConnectionRepository.clearDefault?.();
  });
  afterEach(() => UnansweredQuestionRepository.clearDefault());

  it("deduplicates repeats, redacts PII and supports dismiss/resolve", () => {
    const repository = UnansweredQuestionRepository.inMemory();
    repository.record({ question: "Как вернуть заказ?", reason: "knowledge_not_ready", tenantId: TENANT });
    repository.record({ question: "как вернуть заказ", reason: "knowledge_not_ready", tenantId: TENANT });
    const again = repository.record({ question: "Как вернуть заказ?!", reason: "knowledge_not_ready", tenantId: TENANT });
    assert.equal(again?.count, 3);
    const withPhone = repository.record({ question: "Перезвоните мне на +7 999 123-45-67 по возврату", reason: "knowledge_not_ready", tenantId: TENANT });
    assert.equal(withPhone?.question.includes("123-45-67"), false);

    const list = repository.list(TENANT);
    assert.equal(list.length, 2);
    assert.equal(repository.list("tenant-ladoga").length, 0);

    const target = list.find((item) => item.count === 3)!;
    const dismissed = repository.setStatus(TENANT, target.id, "dismissed");
    assert.equal(dismissed?.status, "dismissed");
    const resolved = repository.setStatus(TENANT, target.id, "resolved", "kb-9");
    assert.equal(resolved?.resolvedArticleId, "kb-9");
  });

  it("dedups, lists, resolves and keeps tenant scope through the prisma branch", async () => {
    const repository = UnansweredQuestionRepository.prisma({ client: inMemoryPrismaUnansweredClient() });

    await repository.record({ question: "Как вернуть заказ?", reason: "knowledge_not_ready", tenantId: TENANT });
    const again = await repository.record({ question: "как вернуть заказ", reason: "knowledge_not_ready", tenantId: TENANT });
    assert.equal(again?.count, 2);
    await repository.record({ question: "Как отменить подписку?", reason: "knowledge_not_ready", tenantId: TENANT });
    await repository.record({ question: "Foreign tenant question", reason: "knowledge_not_ready", tenantId: "tenant-ladoga" });

    const list = await repository.list(TENANT);
    assert.equal(list.length, 2);
    assert.equal((await repository.list("tenant-ladoga")).length, 1);

    const target = list.find((item) => item.count === 2)!;
    const dismissed = await repository.setStatus(TENANT, target.id, "dismissed");
    assert.equal(dismissed?.status, "dismissed");
    const resolved = await repository.setStatus(TENANT, target.id, "resolved", "kb-9");
    assert.equal(resolved?.resolvedArticleId, "kb-9");
    assert.equal(await repository.setStatus("tenant-ladoga", target.id, "dismissed"), null);
  });

  it("records a question when the bot has no knowledge, but never from the sandbox", async () => {
    const unanswered = UnansweredQuestionRepository.inMemory();
    UnansweredQuestionRepository.useDefault(unanswered);

    const connection = {
      baseUrl: "https://ai.example.test/v1",
      capabilities: ["chat_completion"],
      chatModel: "test-model",
      createdAt: "2026-07-14T09:00:00.000Z",
      disabledAt: null,
      embeddingModel: null,
      id: "conn-1",
      keyVersion: "local-v1",
      lastTestMessage: null,
      lastTestStatus: "passed" as const,
      lastTestedAt: "2026-07-14T09:00:00.000Z",
      limits: {},
      providerType: "openai_compatible" as const,
      retrievalModel: null,
      secret: { authTag: "dGFn", ciphertext: "c2VjcmV0", iv: "aXY=", keyVersion: "local-v1" },
      status: "ready" as const,
      tenantId: TENANT,
      updatedAt: "2026-07-14T09:00:00.000Z"
    };
    const connections = AiConnectionRepository.inMemory({ connections: [connection as never] });
    const responder = new AiBotResponseService(
      connections,
      KnowledgeSourceRepository.inMemory(),
      WorkspaceRepository.inMemory(),
      {} as NodeJS.ProcessEnv,
      AiUsageRepository.inMemory(),
      AgentSessionStateRepository.inMemory()
    );

    // Пустой retrieval для реального вопроса больше не бросает knowledge_not_ready:
    // вопрос копится в очереди, затем AI-вызов падает на фейковом секрете/URL.
    await assert.rejects(() => responder.respond({ conversationId: "conv-1", message: "Где мой заказ №5?", sourceBindings: [{ sourceId: "missing" }], tenantId: TENANT }));
    assert.equal(unanswered.list(TENANT).length, 1);

    // Песочница не копит «вопросы без ответа».
    await assert.rejects(() => responder.respond({ conversationId: "sandbox:sbx-1", message: "Где мой заказ №5?", sourceBindings: [{ sourceId: "missing" }], tenantId: TENANT }));
    assert.equal(unanswered.list(TENANT).length, 1);
  });
});

function inMemoryPrismaUnansweredClient(): UnansweredQuestionPrismaClient {
  const rows = new Map<string, PrismaUnansweredQuestionRow>();
  return {
    unansweredQuestion: {
      create: async ({ data }) => {
        rows.set(data.id, { ...data });
        return { ...data };
      },
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const id of where.id.in) if (rows.delete(id)) count += 1;
        return { count };
      },
      findFirst: async ({ where }) => [...rows.values()].find((row) =>
        (!where.tenantId || row.tenantId === where.tenantId)
        && (!where.status || row.status === where.status)
        && (!where.normalizedKey || row.normalizedKey === where.normalizedKey)) ?? null,
      findMany: async ({ orderBy, where } = {}) => {
        const list = [...rows.values()].filter((row) =>
          (!where?.tenantId || row.tenantId === where.tenantId) && (!where?.status || row.status === where.status));
        if (orderBy?.lastAskedAt) {
          const dir = orderBy.lastAskedAt === "desc" ? -1 : 1;
          list.sort((left, right) => (left.lastAskedAt.getTime() - right.lastAskedAt.getTime()) * dir);
        }
        return list;
      },
      update: async ({ data, where }) => {
        const existing = rows.get(where.id)!;
        const next = { ...existing, ...data } as PrismaUnansweredQuestionRow;
        rows.set(where.id, next);
        return next;
      },
      updateMany: async ({ data, where }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (row.id === where.id && row.tenantId === where.tenantId) {
            rows.set(row.id, { ...row, ...data });
            count += 1;
          }
        }
        return { count };
      }
    }
  };
}
