import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { normalizeAgentPolicy } from "../apps/api-gateway/src/automation/agent-policy.ts";
import { evaluateSemanticRetrievalRollout } from "../apps/api-gateway/src/automation/ai-agents-rollout.ts";
import type { FeatureFlag } from "../apps/api-gateway/src/platform/platform.types.ts";
import { AiConnectionRepository, type AiConnectionRecord } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";
import {
  buildEmbeddingRequestBody,
  createOpenAiCompatibleEmbeddingProvider
} from "../apps/api-gateway/src/ai-connections/openai-compatible-embedding.provider.ts";
import { SecretStore } from "../apps/api-gateway/src/ai-connections/secret-store.ts";
import { buildKnowledgeCorpus } from "../apps/api-gateway/src/knowledge-sources/knowledge-corpus.ts";
import { KnowledgeRetrievalCache } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-cache.ts";
import {
  KnowledgeRetrievalService,
  type KnowledgeRetrievalPassage,
  type SemanticKnowledgeSearchInvoker
} from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import {
  cosineSimilarity,
  EmbeddingVectorCache,
  SemanticKnowledgeSearchService,
  type SemanticSearchProviderFactory
} from "../apps/api-gateway/src/knowledge-sources/semantic-knowledge-search.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import type { KnowledgeSourceRecord } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.types.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

const TENANT = "tenant-volga";
const MASTER_KEY = randomBytes(32).toString("base64");
const ENVIRONMENT = { AI_CONNECTIONS_KEY_VERSION: "local-v1", AI_CONNECTIONS_MASTER_KEY: MASTER_KEY } as NodeJS.ProcessEnv;

describe("openai-compatible embedding provider", () => {
  it("posts {input, model} to /embeddings and maps vectors by provider index", async () => {
    const calls: Array<{ body: Record<string, unknown>; url: string }> = [];
    const provider = createOpenAiCompatibleEmbeddingProvider(
      { apiKey: "sk-test", baseUrl: "https://api.aitunnel.ru/v1/", model: "text-embedding-test" },
      {
        fetch: (async (url: string, init: { body: string }) => {
          calls.push({ body: JSON.parse(init.body) as Record<string, unknown>, url: String(url) });
          return jsonResponse({
            data: [
              { embedding: [0, 1], index: 1 },
              { embedding: [1, 0], index: 0 }
            ],
            id: "emb-1",
            model: "text-embedding-test",
            usage: { prompt_tokens: 8, total_tokens: 8 }
          });
        }) as unknown as typeof fetch
      }
    );

    const result = await provider.embed(["первый текст", "второй текст"]);

    assert.equal(calls[0]!.url, "https://api.aitunnel.ru/v1/embeddings");
    assert.deepEqual(calls[0]!.body, { input: ["первый текст", "второй текст"], model: "text-embedding-test" });
    // Провайдер вернул data в обратном порядке — векторы сопоставлены по index.
    assert.deepEqual(result.vectors, [[1, 0], [0, 1]]);
    assert.equal(result.usage.totalTokens, 8);
    assert.equal(result.providerRequestId, "emb-1");
  });

  it("treats a vector-count mismatch or a broken vector as invalid_response", async () => {
    const shortData = createOpenAiCompatibleEmbeddingProvider(
      { apiKey: "sk-test", baseUrl: "https://api.aitunnel.ru/v1", maxRetries: 0, model: "text-embedding-test" },
      { fetch: (async () => jsonResponse({ data: [{ embedding: [1], index: 0 }] })) as unknown as typeof fetch }
    );
    await assert.rejects(shortData.embed(["a", "b"]), /invalid response/);

    const nanVector = createOpenAiCompatibleEmbeddingProvider(
      { apiKey: "sk-test", baseUrl: "https://api.aitunnel.ru/v1", maxRetries: 0, model: "text-embedding-test" },
      { fetch: (async () => jsonResponse({ data: [{ embedding: ["not-a-number"], index: 0 }] })) as unknown as typeof fetch }
    );
    await assert.rejects(nanVector.embed(["a"]), /invalid response/);
  });

  it("retries transient provider failures before succeeding", async () => {
    let attempts = 0;
    const provider = createOpenAiCompatibleEmbeddingProvider(
      { apiKey: "sk-test", baseUrl: "https://api.aitunnel.ru/v1", maxRetries: 1, model: "text-embedding-test" },
      {
        fetch: (async () => {
          attempts += 1;
          if (attempts === 1) return jsonResponse({}, 503);
          return jsonResponse({ data: [{ embedding: [0.5, 0.5], index: 0 }] });
        }) as unknown as typeof fetch,
        sleep: async () => {}
      }
    );
    const result = await provider.embed(["текст"]);
    assert.equal(attempts, 2);
    assert.deepEqual(result.vectors, [[0.5, 0.5]]);
  });

  it("validates inputs before any network call", () => {
    assert.throws(() => buildEmbeddingRequestBody([], "m"), /ai_embedding_inputs_required/);
    assert.throws(() => buildEmbeddingRequestBody(["   "], "m"), /ai_embedding_input_invalid/);
    const body = buildEmbeddingRequestBody(["  укоротить  "], "m") as { input: string[] };
    assert.deepEqual(body.input, ["укоротить"]);
  });
});

describe("embedding vector cache and cosine", () => {
  it("evicts least recently used vectors at the cap and scopes keys by model", () => {
    const cache = new EmbeddingVectorCache(2);
    cache.set("model-a", "hash-1", [1]);
    cache.set("model-a", "hash-2", [2]);
    cache.get("model-a", "hash-1"); // touch: hash-1 свежее hash-2
    cache.set("model-a", "hash-3", [3]);
    assert.deepEqual(cache.get("model-a", "hash-1"), [1]);
    assert.equal(cache.get("model-a", "hash-2"), undefined);
    assert.deepEqual(cache.get("model-a", "hash-3"), [3]);
    assert.equal(cache.get("model-b", "hash-1"), undefined);
  });

  it("computes cosine similarity defensively", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.equal(cosineSimilarity([1, 0], [1]), 0); // размерности разошлись — не сравниваем
    assert.equal(cosineSimilarity([0, 0], [1, 0]), 0); // нулевая норма
  });
});

describe("SemanticKnowledgeSearchService", () => {
  it("ranks chunks by meaning without shared words and reuses cached chunk vectors", async () => {
    const corpus = buildKnowledgeCorpus([
      { source: { id: "src-delivery", title: "Доставка", version: 1 }, text: "Доставка по Москве занимает 1-2 дня." },
      { source: { id: "src-refund", title: "Возврат", version: 2 }, text: "Возврат средств зачисляется обратно на карту в течение 10 дней." }
    ]);
    const calls: string[][] = [];
    const usage = AiUsageRepository.inMemory();
    const service = new SemanticKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [embeddingConnection()] }),
      ENVIRONMENT,
      usage,
      fakeEmbeddingFactory(calls),
      new EmbeddingVectorCache()
    );

    // «куда пропали мои деньги» не делит ни одного слова с чанком о возврате — лексика тут слепа.
    const first = await service.search({ corpus, query: "куда пропали мои деньги", scenarioId: "bot-1", tenantId: TENANT });
    // Вопрос уходит отдельным маленьким вызовом, недостающие чанки — следом порцией.
    assert.deepEqual(calls.map((call) => call.length), [1, 2]);
    assert.equal(first.passages[0]!.citation.sourceId, "src-refund");
    assert.equal(first.passages[0]!.citation.sourceVersion, 2);
    assert.ok(first.passages[0]!.score > (first.passages[1]?.score ?? 0));
    assert.equal((await usage.current(TENANT, "conn-embedding")).usedTokens > 0, true);

    const second = await service.search({ corpus, query: "куда пропали мои деньги", tenantId: TENANT });
    assert.deepEqual(calls.map((call) => call.length), [1, 2, 1]); // векторы чанков пришли из кеша — эмбеддится только вопрос
    assert.equal(second.passages[0]!.citation.sourceId, "src-refund");
  });

  it("keeps warmup progress and usage accounting when a later batch fails", async () => {
    const corpus = fortyChunkCorpus();
    const calls: string[][] = [];
    let failing = true;
    const factory: SemanticSearchProviderFactory = () => ({
      model: "text-embedding-test",
      providerId: "openai-compatible-embedding",
      async embed(inputs: string[]) {
        calls.push([...inputs]);
        // Третий вызов — вторая порция чанков: провайдер «падает» на середине прогрева.
        if (failing && calls.length === 3) throw new Error("provider_unavailable");
        return {
          model: "text-embedding-test",
          providerId: "openai-compatible-embedding" as const,
          providerRequestId: null,
          usage: { totalTokens: inputs.length * 5 },
          vectors: inputs.map(vectorFor)
        };
      }
    });
    const usage = AiUsageRepository.inMemory();
    const service = new SemanticKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [embeddingConnection()] }),
      ENVIRONMENT,
      usage,
      factory,
      new EmbeddingVectorCache()
    );

    await assert.rejects(service.search({ corpus, query: "сроки доставки", tenantId: TENANT }), /provider_unavailable/);
    // Холодный кеш: вопрос (1), первая порция (32), упавшая вторая (8).
    assert.deepEqual(calls.map((call) => call.length), [1, 32, 8]);
    // Оплаченное учтено даже при сбое: вопрос 1×5 + успешная порция 32×5.
    assert.equal((await usage.current(TENANT, "conn-embedding")).usedTokens, 165);

    failing = false;
    const result = await service.search({ corpus, query: "сроки доставки", tenantId: TENANT });
    // Прогресс не выброшен: доэмбеддились только вопрос и 8 недостающих чанков.
    assert.deepEqual(calls.map((call) => call.length), [1, 32, 8, 1, 8]);
    assert.ok(result.passages.length > 0);
  });

  it("pauses cold-cache warmup on the time budget and resumes on the next message", async (t) => {
    const corpus = fortyChunkCorpus();
    const calls: string[][] = [];
    const service = new SemanticKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [embeddingConnection()] }),
      ENVIRONMENT,
      AiUsageRepository.inMemory(),
      fakeEmbeddingFactory(calls),
      new EmbeddingVectorCache()
    );

    // Каждый вызов Date.now() «проматывает» 10 секунд — бюджет прогрева (8с)
    // исчерпан уже перед второй порцией.
    let now = 0;
    t.mock.method(Date, "now", () => { now += 10_000; return now; });
    await assert.rejects(service.search({ corpus, query: "сроки доставки", tenantId: TENANT }), /semantic_warmup_in_progress/);
    t.mock.restoreAll();
    // Первая порция гарантированно уходит даже при нулевом бюджете — прогрев двигается всегда.
    assert.deepEqual(calls.map((call) => call.length), [1, 32]);

    const result = await service.search({ corpus, query: "сроки доставки", tenantId: TENANT });
    assert.deepEqual(calls.map((call) => call.length), [1, 32, 1, 8]);
    assert.ok(result.passages.length > 0);
  });

  it("fails loudly when no ready connection has an embedding model (caller falls back)", async () => {
    const corpus = buildKnowledgeCorpus([{ source: { id: "s", title: "S", version: 1 }, text: "текст" }]);
    const service = new SemanticKnowledgeSearchService(
      AiConnectionRepository.inMemory({ connections: [embeddingConnection({ capabilities: ["chat_completion"], embeddingModel: null })] }),
      ENVIRONMENT,
      AiUsageRepository.inMemory(),
      fakeEmbeddingFactory([]),
      new EmbeddingVectorCache()
    );
    await assert.rejects(service.search({ corpus, query: "q", tenantId: TENANT }), /semantic_retrieval_connection_not_ready/);
  });
});

describe("semantic retrieval strategy", () => {
  it("returns meaning-adjacent passages end to end and drops unrelated chunks", async () => {
    const retrieval = new KnowledgeRetrievalService(
      KnowledgeSourceRepository.inMemory({
        ingestionJobs: [],
        sources: [
          knowledgeSource("src-refund", "Правила возврата", "Возврат средств зачисляется обратно на карту в течение 10 дней."),
          knowledgeSource("src-delivery", "Доставка", "Доставка по Москве занимает 1-2 дня.")
        ]
      }),
      WorkspaceRepository.inMemory(),
      new KnowledgeRetrievalCache(),
      undefined,
      undefined,
      undefined,
      new SemanticKnowledgeSearchService(
        AiConnectionRepository.inMemory({ connections: [embeddingConnection()] }),
        ENVIRONMENT,
        AiUsageRepository.inMemory(),
        fakeEmbeddingFactory([]),
        new EmbeddingVectorCache()
      )
    );

    const result = await retrieval.retrieve({
      mode: "semantic",
      query: "куда пропали мои деньги",
      sourceBindings: [{ sourceId: "src-refund" }, { sourceId: "src-delivery" }],
      tenantId: TENANT
    });

    assert.equal(result.mode, "semantic");
    // Экономия контекста: боту ушёл ровно один близкий по смыслу чанк, шум отсеян порогами.
    assert.equal(result.passages.length, 1);
    assert.equal(result.passages[0]!.citation.sourceId, "src-refund");
    assert.ok(result.tokensUsed > 0 && result.tokensUsed <= result.tokenBudget);

    const cached = await retrieval.retrieve({
      mode: "semantic",
      query: "куда пропали мои деньги",
      sourceBindings: [{ sourceId: "src-refund" }, { sourceId: "src-delivery" }],
      tenantId: TENANT
    });
    assert.equal(cached.cache, "hit");
    assert.equal(cached.mode, "semantic");
  });

  it("prunes weak and relatively weak passages so the bot context stays small", async () => {
    const scores = [0.8, 0.5, 0.15];
    const invoker: SemanticKnowledgeSearchInvoker = {
      search: async ({ corpus }) => ({
        passages: corpus.chunks.map((chunk, index) => passageFor(chunk.content, chunk.sourceId, scores[index] ?? 0))
      })
    };
    const retrieval = makeSemanticRetrieval(invoker, [
      knowledgeSource("src-a", "A", "Возврат средств занимает до 10 дней."),
      knowledgeSource("src-b", "B", "Доставка по Москве занимает 1-2 дня."),
      knowledgeSource("src-c", "C", "Часы работы офиса: с 9 до 18 по будням.")
    ]);
    const result = await retrieval.retrieve({
      mode: "semantic",
      query: "любой вопрос",
      sourceBindings: [{ sourceId: "src-a" }, { sourceId: "src-b" }, { sourceId: "src-c" }],
      tenantId: TENANT
    });
    // 0.15 ниже абсолютного порога 0.2; 0.5 проходит и абсолютный, и относительный (0.8 * 0.6 = 0.48).
    assert.deepEqual(result.passages.map((passage) => passage.score), [0.8, 0.5]);

    const strict = await retrieval.retrieve({
      mode: "semantic",
      query: "любой вопрос",
      scoreThreshold: 0.6,
      sourceBindings: [{ sourceId: "src-a" }, { sourceId: "src-b" }, { sourceId: "src-c" }],
      tenantId: TENANT
    });
    // Явный policy-threshold ужесточает семантический отсев.
    assert.deepEqual(strict.passages.map((passage) => passage.score), [0.8]);
  });

  it("falls back to lexical retrieval with a visible reason when embeddings fail", async () => {
    const invoker: SemanticKnowledgeSearchInvoker = {
      search: async () => { throw new Error("semantic_retrieval_connection_not_ready"); }
    };
    const retrieval = makeSemanticRetrieval(invoker, [knowledgeSource("src-refund", "Правила возврата", "Возврат средств занимает до 10 дней.")]);
    const result = await retrieval.retrieve({
      mode: "semantic",
      query: "возврат средств",
      sourceBindings: [{ sourceId: "src-refund" }],
      tenantId: TENANT
    });
    assert.equal(result.mode, "semantic_fallback");
    assert.equal(result.fallbackReason, "semantic_retrieval_connection_not_ready");
    assert.equal(result.passages.length, 1);
    assert.match(result.passages[0]!.content, /Возврат средств/);
  });

  it("stays lexical when mode is omitted even with an injected semantic ranker", async () => {
    let called = false;
    const invoker: SemanticKnowledgeSearchInvoker = {
      search: async () => { called = true; return { passages: [] }; }
    };
    const retrieval = makeSemanticRetrieval(invoker, [knowledgeSource("src-refund", "Правила возврата", "Возврат средств занимает до 10 дней.")]);
    const result = await retrieval.retrieve({ query: "возврат средств", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(result.mode, "lexical");
    assert.equal(called, false);
    assert.equal(result.passages.length, 1);
  });

  it("caches an empty semantic result (deterministic, unlike the llm selector)", async () => {
    let searches = 0;
    const invoker: SemanticKnowledgeSearchInvoker = {
      search: async () => { searches += 1; return { passages: [] }; }
    };
    const retrieval = makeSemanticRetrieval(invoker, [knowledgeSource("src-refund", "Правила возврата", "Возврат средств занимает до 10 дней.")]);
    const first = await retrieval.retrieve({ mode: "semantic", query: "о чём-то постороннем", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(first.cache, "miss");
    assert.equal(first.mode, "semantic");
    assert.deepEqual(first.passages, []);
    const second = await retrieval.retrieve({ mode: "semantic", query: "о чём-то постороннем", sourceBindings: [{ sourceId: "src-refund" }], tenantId: TENANT });
    assert.equal(second.cache, "hit");
    assert.equal(searches, 1);
  });
});

describe("semantic policy fields and tenant rollout", () => {
  it("normalizes retrievalMode semantic and keeps unknown values lexical", () => {
    assert.equal(normalizeAgentPolicy({ retrievalMode: "semantic" } as never).retrievalMode, "semantic");
    assert.equal(normalizeAgentPolicy({ retrievalMode: "hybrid" } as never).retrievalMode, "lexical");
    assert.equal(normalizeAgentPolicy(undefined).retrievalMode, "lexical");
  });

  it("gates semantic retrieval by the ai_semantic_retrieval tenant flag", () => {
    assert.equal(evaluateSemanticRetrievalRollout({ flags: [], tenantId: TENANT }).eligible, false);
    const flag: FeatureFlag = {
      id: "flag-ai-semantic-retrieval",
      key: "ai_semantic_retrieval",
      name: "AI bot semantic (embedding) knowledge retrieval",
      status: "on",
      environment: "production",
      scope: "tenant",
      rollout: 0,
      owner: "AI team",
      segments: [],
      enabledTenantIds: [TENANT],
      variants: [{ id: "enabled", weight: 100 }],
      killSwitch: true,
      updatedAt: "2026-07-18T00:00:00.000Z"
    };
    assert.equal(evaluateSemanticRetrievalRollout({ flags: [flag], tenantId: TENANT }).eligible, true);
    assert.equal(evaluateSemanticRetrievalRollout({ flags: [flag], tenantId: "tenant-other" }).eligible, false);
  });
});

function makeSemanticRetrieval(invoker: SemanticKnowledgeSearchInvoker, sources: KnowledgeSourceRecord[]): KnowledgeRetrievalService {
  return new KnowledgeRetrievalService(
    KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources }),
    WorkspaceRepository.inMemory(),
    new KnowledgeRetrievalCache(),
    undefined,
    undefined,
    undefined,
    invoker
  );
}

/** 40 уникальных однобайтово-разных чанков: холодный прогрев режется на порции 32 + 8. */
function fortyChunkCorpus() {
  return buildKnowledgeCorpus(Array.from({ length: 40 }, (_, index) => ({
    source: { id: `src-${String(index).padStart(2, "0")}`, title: `Источник ${index}`, version: 1 },
    text: `Факт номер ${index}: доставка по региону ${index} занимает ${index + 1} дней.`
  })));
}

function passageFor(content: string, sourceId: string, score: number): KnowledgeRetrievalPassage {
  return {
    citation: { endOffset: content.length, sourceId, sourceVersion: 1, startOffset: 0, title: sourceId },
    content,
    score
  };
}

/**
 * Детерминированные «смысловые» векторы для тестов: вопрос клиента о пропавших
 * деньгах близок к чанку о возврате (без единого общего слова) и ортогонален
 * чанку о доставке.
 */
function fakeEmbeddingFactory(calls: string[][]): SemanticSearchProviderFactory {
  return () => ({
    model: "text-embedding-test",
    providerId: "openai-compatible-embedding",
    async embed(inputs: string[]) {
      calls.push([...inputs]);
      return {
        model: "text-embedding-test",
        providerId: "openai-compatible-embedding" as const,
        providerRequestId: "emb-test",
        usage: { inputTokens: inputs.length * 5, totalTokens: inputs.length * 5 },
        vectors: inputs.map(vectorFor)
      };
    }
  });
}

function vectorFor(text: string): number[] {
  if (/пропали|деньги/iu.test(text)) return [1, 0, 0];
  if (/возврат|средств/iu.test(text)) return [0.9, 0.1, 0];
  if (/доставка/iu.test(text)) return [0, 1, 0];
  return [0, 0, 1];
}

function knowledgeSource(id: string, title: string, chunk: string): KnowledgeSourceRecord {
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
    id,
    kind: "document",
    lastIndexedAt: "2026-07-14T09:00:00.000Z",
    lastIngestedAt: "2026-07-14T09:00:00.000Z",
    metadata: { chunks: [chunk] },
    owner: "admin",
    readiness: "ready",
    retentionUntil: null,
    sourceConfig: {},
    sourceRef: null,
    status: "ready",
    tenantId: TENANT,
    title,
    updatedAt: "2026-07-14T09:00:00.000Z",
    version: 1
  };
}

function embeddingConnection(overrides: Partial<AiConnectionRecord> = {}): AiConnectionRecord {
  const secret = new SecretStore({ keyVersion: "local-v1", masterKeyBase64: MASTER_KEY }).encrypt("sk-aitunnel-test");
  return {
    baseUrl: "https://api.aitunnel.ru/v1",
    capabilities: ["chat_completion", "embeddings"],
    chatModel: "cheap-model",
    createdAt: "2026-07-18T09:00:00.000Z",
    disabledAt: null,
    embeddingModel: "text-embedding-test",
    id: "conn-embedding",
    keyVersion: "local-v1",
    lastTestMessage: null,
    lastTestStatus: "passed",
    lastTestedAt: "2026-07-18T09:00:00.000Z",
    limits: {},
    providerType: "openai_compatible",
    retrievalModel: null,
    secret,
    status: "ready",
    tenantId: TENANT,
    updatedAt: "2026-07-18T09:00:00.000Z",
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200): { json(): Promise<unknown>; ok: boolean; status: number } {
  return { json: async () => payload, ok: status >= 200 && status < 300, status };
}
