import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { normalizeAgentPolicy } from "../apps/api-gateway/src/automation/agent-policy.ts";
import { evaluateLlmRetrievalRollout } from "../apps/api-gateway/src/automation/ai-agents-rollout.ts";
import type { FeatureFlag } from "../apps/api-gateway/src/platform/platform.types.ts";
import { AiConnectionRepository, type AiConnectionRecord } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";
import type { ChatCompletionRequest } from "../apps/api-gateway/src/ai-connections/openai-compatible-chat.provider.ts";
import { SecretStore } from "../apps/api-gateway/src/ai-connections/secret-store.ts";
import { buildKnowledgeCorpus } from "../apps/api-gateway/src/knowledge-sources/knowledge-corpus.ts";
import { KnowledgeRetrievalCache } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-cache.ts";
import {
  KnowledgeRetrievalService,
  type LlmKnowledgeSearchInvoker
} from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import { LlmKnowledgeSearchService, selectPassages } from "../apps/api-gateway/src/knowledge-sources/llm-knowledge-search.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import type { KnowledgeSourceRecord } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.types.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

const TENANT = "tenant-volga";
const MASTER_KEY = randomBytes(32).toString("base64");
const ENVIRONMENT = { AI_CONNECTIONS_KEY_VERSION: "local-v1", AI_CONNECTIONS_MASTER_KEY: MASTER_KEY } as NodeJS.ProcessEnv;

describe("BAI-873 knowledge corpus", () => {
  it("builds a byte-identical corpus regardless of entry order (provider cache stability)", () => {
    const a = { source: { id: "src-a", title: "A", version: 2 }, text: "Возврат средств занимает до 10 дней." };
    const b = { source: { id: "src-b", title: "B", version: 1 }, text: "Доставка занимает 1-2 дня." };
    const left = buildKnowledgeCorpus([a, b]);
    const right = buildKnowledgeCorpus([b, a]);
    assert.equal(left.promptText, right.promptText);
    assert.equal(left.checksum, right.checksum);
    assert.equal(left.truncated, false);
    assert.match(left.promptText, /^Knowledge corpus, sources: src-a@v2, src-b@v1\./);
    assert.match(left.promptText, /\[c:src-a:1\] Возврат средств/);
    assert.equal(left.chunks[0]?.sourceVersion, 2);
  });

  it("prefilters by query and flags truncation when the corpus exceeds the ceiling", () => {
    const filler = "Общие сведения о компании и офисах. ".repeat(400);
    const relevant = "Возврат средств делается через личный кабинет за 10 дней.";
    const corpus = buildKnowledgeCorpus(
      [
        { source: { id: "src-filler", title: "Filler", version: 1 }, text: filler },
        { source: { id: "src-refund", title: "Refund", version: 1 }, text: relevant }
      ],
      { maxTokens: 1_000, prefilterQuery: "возврат средств" }
    );
    assert.equal(corpus.truncated, true);
    assert.ok(corpus.tokenEstimate <= 1_100);
    assert.ok(corpus.chunks.some((chunk) => chunk.sourceId === "src-refund"));
  });
});

describe("BAI-874 selector output parsing", () => {
  const chunks = buildKnowledgeCorpus([
    { source: { id: "src-a", title: "A", version: 3 }, text: "Возврат средств занимает до 10 дней. Оформление через личный кабинет." }
  ]).chunks;

  it("maps selected ids to literal passages with citations and clamps confidence", () => {
    const fenced = "```json\n" + JSON.stringify({ chunks: [{ confidence: 7, id: chunks[0]!.chunkId }, { id: "ghost" }], insufficient: false }) + "\n```";
    const passages = selectPassages(fenced, chunks);
    assert.equal(passages.length, 1);
    assert.equal(passages[0]!.content, chunks[0]!.content);
    assert.equal(passages[0]!.score, 1);
    assert.deepEqual(passages[0]!.citation, {
      endOffset: chunks[0]!.endOffset,
      sourceId: "src-a",
      sourceVersion: 3,
      startOffset: chunks[0]!.startOffset,
      title: "A"
    });
  });

  it("treats insufficient as a valid empty answer and broken JSON as an error", () => {
    assert.deepEqual(selectPassages('{"chunks":[],"insufficient":true}', chunks), []);
    assert.throws(() => selectPassages("I think chunk 1 is best", chunks), /llm_retrieval_invalid_response/);
  });

  it("recovers source-id shaped answers copied from the corpus header (mygig incident)", () => {
    const multi = buildKnowledgeCorpus([
      { source: { id: "ks_aaa", title: "Самозанятость", version: 3 }, text: "Кто может стать самозанятым: физлица и ИП без сотрудников. ".repeat(40) },
      { source: { id: "ks_bbb", title: "Магазины", version: 2 }, text: "Служебный вход для магазина в ТЦ." }
    ]).chunks;
    assert.ok(multi.filter((chunk) => chunk.sourceId === "ks_aaa").length > 1, "нужен многочанковый источник");

    // Модель вернула id источника с версией из заголовка корпуса — разворачиваем в чанки источника.
    const headerShaped = selectPassages('{"chunks":[{"id":"ks_aaa@v3","confidence":0.99}],"insufficient":false}', multi);
    assert.ok(headerShaped.length >= 1);
    assert.ok(headerShaped.every((passage) => passage.citation.sourceId === "ks_aaa"));
    assert.equal(headerShaped[0]!.score, 0.99);

    // Прочие формы: голый source-id, «c:source» без номера чанка, скобки вокруг корректного id.
    assert.ok(selectPassages('{"chunks":[{"id":"ks_bbb"}]}', multi).every((passage) => passage.citation.sourceId === "ks_bbb"));
    assert.equal(selectPassages('{"chunks":[{"id":"c:ks_bbb"}]}', multi).length, 1);
    assert.equal(selectPassages(`{"chunks":[{"id":"[${multi[0]!.chunkId}]"}]}`, multi)[0]!.content, multi[0]!.content);
    // Мусорный id по-прежнему отбрасывается молча.
    assert.deepEqual(selectPassages('{"chunks":[{"id":"ghost@v9"}]}', multi), []);
  });
});

describe("BAI-874 LlmKnowledgeSearchService", () => {
  it("sends explicit 1h cache breakpoints for Anthropic-family retrieval models", async () => {
    const requests: ChatCompletionRequest[] = [];
    const usage = AiUsageRepository.inMemory();
    const corpus = buildKnowledgeCorpus([
      { source: { id: "src-a", title: "A", version: 1 }, text: "Возврат средств занимает до 10 дней." }
    ]);
    const service = new LlmKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [connection({ retrievalModel: "claude-sonnet-4-5" })] }),
      ENVIRONMENT,
      usage,
      () => fakeProvider((request) => {
        requests.push(request);
        return JSON.stringify({ chunks: [{ confidence: 0.9, id: corpus.chunks[0]!.chunkId }], insufficient: false });
      })
    );

    const result = await service.search({ corpus, query: "как вернуть деньги?", scenarioId: "bot-1", tenantId: TENANT });

    assert.equal(result.passages.length, 1);
    assert.equal(result.cachedTokens, 120);
    const request = requests[0]!;
    assert.equal(request.temperature, 0);
    assert.equal(request.responseFormat, "json_object");
    assert.equal(request.systemBlocks?.length, 2);
    assert.deepEqual(request.systemBlocks?.[1]?.cacheControl, { ttl: "1h" });
    assert.equal(request.systemBlocks?.[1]?.text, corpus.promptText);
    assert.match(String(request.sessionId), new RegExp(`^kr:${TENANT}:bot-1:${corpus.checksum.slice(0, 16)}$`));
    assert.equal(String(request.sessionId).includes("вернуть"), false);
    assert.equal((await usage.current(TENANT, "conn-retrieval")).usedTokens > 0, true);
  });

  it("sends a plain stable system prefix (automatic caching) for OpenAI-family retrieval models", async () => {
    // Регрессия инцидента 2026-07-17: Anthropic-стиль cache_control, отправленный
    // OpenAI-семейству через агрегатор, ломал автоматическое кеширование —
    // каждый запрос оплачивал полный корпус.
    const requests: ChatCompletionRequest[] = [];
    const corpus = buildKnowledgeCorpus([
      { source: { id: "src-a", title: "A", version: 1 }, text: "Возврат средств занимает до 10 дней." }
    ]);
    const service = new LlmKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [connection({ retrievalModel: "gpt-5.6-luna-pro" })] }),
      ENVIRONMENT,
      AiUsageRepository.inMemory(),
      () => fakeProvider((request) => {
        requests.push(request);
        return JSON.stringify({ chunks: [{ confidence: 0.9, id: corpus.chunks[0]!.chunkId }], insufficient: false });
      })
    );

    await service.search({ corpus, query: "как вернуть деньги?", scenarioId: "bot-1", tenantId: TENANT });

    const request = requests[0]!;
    assert.equal(request.systemBlocks, undefined);
    assert.equal(request.cacheControl, undefined);
    assert.equal(request.messages.length, 2);
    assert.equal(request.messages[0]!.role, "system");
    assert.equal(request.messages[0]!.content, request.messages[0]!.content.trim());
    assert.equal(request.messages[0]!.content.endsWith(corpus.promptText), true);
    assert.match(String(request.sessionId), new RegExp(`^kr:${TENANT}:bot-1:${corpus.checksum.slice(0, 16)}$`));
  });

  it("fails loudly when no ready connection has a retrieval model (caller falls back)", async () => {
    const service = new LlmKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [connection({ retrievalModel: null })] }),
      ENVIRONMENT,
      AiUsageRepository.inMemory(),
      () => fakeProvider(() => "{}")
    );
    const corpus = buildKnowledgeCorpus([{ source: { id: "s", title: "S", version: 1 }, text: "текст" }]);
    await assert.rejects(service.search({ corpus, query: "q", tenantId: TENANT }), /llm_retrieval_connection_not_ready/);
  });
});

describe("BAI-875 retrieval strategy", () => {
  it("uses the LLM selector in llm mode and keeps the mode in the result cache", async () => {
    const invoker: LlmKnowledgeSearchInvoker = {
      search: async ({ corpus }) => ({
        cachedTokens: 500,
        passages: selectPassages(JSON.stringify({ chunks: [{ confidence: 0.9, id: corpus.chunks[0]!.chunkId }], insufficient: false }), corpus.chunks)
      })
    };
    const retrieval = makeRetrieval(invoker);
    const first = await retrieval.retrieve({ mode: "llm", query: "как оформить возврат средств?", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(first.cache, "miss");
    assert.equal(first.mode, "llm");
    assert.equal(first.cachedTokens, 500);
    assert.equal(first.passages.length, 1);
    assert.match(first.passages[0]!.content, /Возврат средств/);

    const second = await retrieval.retrieve({ mode: "llm", query: "как оформить возврат средств?", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(second.cache, "hit");
    assert.equal(second.mode, "llm");
  });

  it("falls back to lexical retrieval with a visible reason when the selector fails", async () => {
    const invoker: LlmKnowledgeSearchInvoker = {
      search: async () => { throw new Error("llm_retrieval_connection_not_ready"); }
    };
    const retrieval = makeRetrieval(invoker);
    const result = await retrieval.retrieve({ mode: "llm", query: "возврат средств", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(result.mode, "llm_fallback");
    assert.equal(result.fallbackReason, "llm_retrieval_connection_not_ready");
    assert.equal(result.passages.length, 1);
    assert.match(result.passages[0]!.content, /Возврат средств/);
  });

  it("stays lexical when mode is omitted even with an injected selector", async () => {
    let called = false;
    const invoker: LlmKnowledgeSearchInvoker = {
      search: async () => { called = true; return { passages: [] }; }
    };
    const retrieval = makeRetrieval(invoker);
    const result = await retrieval.retrieve({ query: "возврат средств", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(result.mode, "lexical");
    assert.equal(called, false);
    assert.equal(result.passages.length, 1);
  });

  it("returns an empty llm result (not a failure) when no eligible source has text", async () => {
    const invoker: LlmKnowledgeSearchInvoker = {
      search: async () => { throw new Error("should_not_be_called"); }
    };
    const retrieval = new KnowledgeRetrievalService(
      KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [] }),
      WorkspaceRepository.inMemory(),
      new KnowledgeRetrievalCache(),
      undefined,
      invoker
    );
    const result = await retrieval.retrieve({ mode: "llm", query: "возврат", sourceBindings: [{ sourceId: "missing" }], tenantId: TENANT });
    assert.equal(result.mode, "llm");
    assert.deepEqual(result.passages, []);
  });
});

describe("BAI-877 policy fields and tenant rollout", () => {
  it("normalizes retrievalMode and maxResponseTokens with safe defaults and clamps", () => {
    const defaults = normalizeAgentPolicy(undefined);
    assert.equal(defaults.retrievalMode, "lexical");
    assert.equal(defaults.maxResponseTokens, 1_000);
    const explicit = normalizeAgentPolicy({ maxResponseTokens: 99_999, retrievalMode: "llm" } as never);
    assert.equal(explicit.retrievalMode, "llm");
    assert.equal(explicit.maxResponseTokens, 4_000);
    assert.equal(normalizeAgentPolicy({ retrievalMode: "semantic" } as never).retrievalMode, "lexical");
  });

  it("gates llm retrieval by the ai_llm_retrieval tenant flag", () => {
    assert.equal(evaluateLlmRetrievalRollout({ flags: [], tenantId: TENANT }).eligible, false);
    const flag: FeatureFlag = {
      id: "flag-ai-llm-retrieval",
      key: "ai_llm_retrieval",
      name: "AI bot LLM knowledge retrieval",
      status: "on",
      environment: "production",
      scope: "tenant",
      rollout: 0,
      owner: "AI team",
      segments: [],
      enabledTenantIds: [TENANT],
      variants: [{ id: "enabled", weight: 100 }],
      killSwitch: true,
      updatedAt: "2026-07-17T00:00:00.000Z"
    };
    const allowed = evaluateLlmRetrievalRollout({ flags: [flag], tenantId: TENANT });
    assert.equal(allowed.eligible, true);
    assert.equal(evaluateLlmRetrievalRollout({ flags: [flag], tenantId: "tenant-other" }).eligible, false);
  });
});

function makeRetrieval(invoker: LlmKnowledgeSearchInvoker): KnowledgeRetrievalService {
  return new KnowledgeRetrievalService(
    KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [knowledgeSource()] }),
    WorkspaceRepository.inMemory(),
    new KnowledgeRetrievalCache(),
    undefined,
    invoker
  );
}

function knowledgeSource(): KnowledgeSourceRecord {
  return {
    approvalStatus: "approved",
    approvedAt: "2026-07-14T09:00:00.000Z",
    approvedBy: "admin",
    archivedAt: null,
    contentChecksum: null,
    createdAt: "2026-07-14T09:00:00.000Z",
    disabledAt: null,
    failedAt: null,
    failureCode: null,
    id: "src-refund",
    kind: "document",
    lastIndexedAt: "2026-07-14T09:00:00.000Z",
    lastIngestedAt: "2026-07-14T09:00:00.000Z",
    metadata: { chunks: ["Возврат средств занимает до 10 дней. Оформление через личный кабинет, деньги возвращаются на карту."] },
    owner: "admin",
    readiness: "ready",
    retentionUntil: null,
    sourceConfig: {},
    sourceRef: null,
    status: "ready",
    tenantId: TENANT,
    title: "Правила возврата",
    updatedAt: "2026-07-14T09:00:00.000Z",
    version: 1
  };
}

function connection(overrides: Partial<AiConnectionRecord> = {}): AiConnectionRecord {
  const secret = new SecretStore({ keyVersion: "local-v1", masterKeyBase64: MASTER_KEY }).encrypt("sk-aitunnel-test");
  return {
    baseUrl: "https://api.aitunnel.ru/v1",
    capabilities: ["chat_completion", "retrieval"],
    chatModel: "cheap-model",
    createdAt: "2026-07-17T09:00:00.000Z",
    disabledAt: null,
    embeddingModel: null,
    id: "conn-retrieval",
    keyVersion: "local-v1",
    lastTestMessage: null,
    lastTestStatus: "passed",
    lastTestedAt: "2026-07-17T09:00:00.000Z",
    limits: {},
    providerType: "openai_compatible",
    retrievalModel: "expensive-model",
    secret,
    status: "ready",
    tenantId: TENANT,
    updatedAt: "2026-07-17T09:00:00.000Z",
    ...overrides
  };
}

function fakeProvider(respond: (request: ChatCompletionRequest) => string) {
  return {
    model: "expensive-model",
    providerId: "openai-compatible-chat" as const,
    async complete(request: ChatCompletionRequest) {
      return {
        content: respond(request),
        model: "expensive-model",
        providerId: "openai-compatible-chat" as const,
        providerRequestId: "req-1",
        usage: { cachedTokens: 120, cacheWriteTokens: 0, inputTokens: 200, outputTokens: 30, totalTokens: 230 }
      };
    }
  };
}
