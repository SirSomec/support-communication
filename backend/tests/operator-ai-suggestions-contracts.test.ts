import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { AiConnectionRepository, type AiConnectionRecord } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";
import { AiProviderError, type ChatCompletionRequest } from "../apps/api-gateway/src/ai-connections/openai-compatible-chat.provider.ts";
import { SecretStore } from "../apps/api-gateway/src/ai-connections/secret-store.ts";
import { ConversationRepository, createEmptyConversationState } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import type { ConversationRecord } from "../apps/api-gateway/src/conversation/conversation.types.ts";
import {
  buildTranscript,
  OperatorAiSuggestionService,
  parseSuggestions,
  type OperatorAiSuggestionProviderFactory
} from "../apps/api-gateway/src/conversation/operator-ai-suggestion.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import type { KnowledgeSourceRecord } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.types.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

const TENANT = "tenant-volga";
const MASTER_KEY = randomBytes(32).toString("base64");
const ENVIRONMENT = { AI_CONNECTIONS_KEY_VERSION: "local-v1", AI_CONNECTIONS_MASTER_KEY: MASTER_KEY } as NodeJS.ProcessEnv;
const SECRET = "provider-secret-never-leaks";

const SUGGESTIONS_JSON = JSON.stringify({
  suggestions: [
    { label: "Коротко", text: "Ваш заказ передан в доставку, курьер приедет завтра до 18:00." },
    { label: "Подробно", text: "Проверил по базе: заказ собран и передан в службу доставки. Курьер привезёт его завтра до 18:00, трек-номер придёт в SMS." },
    { label: "С эмпатией", text: "Понимаю, ожидание волнует. Заказ уже в доставке — завтра до 18:00 он будет у вас. Подсказать трек-номер?" }
  ]
});

describe("operator ai suggestions contracts", () => {
  it("returns three grounded suggestions with citations and records usage", async () => {
    const context = makeContext();
    const requests: ChatCompletionRequest[] = [];
    const factories: Array<{ apiKey: string }> = [];
    const service = makeService(context, (connection) => {
      factories.push({ apiKey: connection.apiKey });
      return fakeProvider((request) => {
        requests.push(request);
        return SUGGESTIONS_JSON;
      });
    });

    const envelope = await service.suggest({ conversationId: "conversation-1", tenantId: TENANT });

    assert.equal(envelope.status, "ok");
    const data = envelope.data as {
      citations: Array<{ sourceId: string; title: string }>;
      knowledgeUsed: boolean;
      suggestions: Array<{ id: string; label: string; text: string }>;
    };
    assert.equal(data.suggestions.length, 3);
    assert.deepEqual(data.suggestions.map((item) => item.id), ["ais_1", "ais_2", "ais_3"]);
    assert.equal(data.suggestions[0]!.label, "Коротко");
    assert.equal(data.knowledgeUsed, true);
    assert.equal(data.citations[0]?.sourceId, "src-delivery");

    // Промпт: знания в system, транскрипт в user, внутренние заметки помечены.
    const [request] = requests;
    assert.ok(request, "provider request captured");
    const system = request!.messages.find((message) => message.role === "system")?.content ?? "";
    const user = request!.messages.find((message) => message.role === "user")?.content ?? "";
    assert.ok(system.includes("Доставка занимает 1-2 дня"), "knowledge passage reaches the system prompt");
    assert.ok(user.includes("Клиент: Когда приедет мой заказ?"), "client message reaches the transcript");
    assert.ok(user.includes("Внутренняя заметка:"), "internal note is labeled");
    assert.ok(!user.includes("Диалог создан"), "event rows are excluded");
    assert.equal(request!.responseFormat, "json_object");

    // Секрет доходит до провайдера, но не в ответ API; расход токенов записан.
    assert.equal(factories[0]?.apiKey, SECRET);
    assert.ok(!JSON.stringify(envelope).includes(SECRET));
    assert.ok(context.usage.current(TENANT, "conn-1").usedTokens > 0);
  });

  it("fails with ai_connection_not_ready when no ready chat connection exists", async () => {
    const context = makeContext({ connections: [] });
    const service = makeService(context, () => fakeProvider(() => SUGGESTIONS_JSON));

    const envelope = await service.suggest({ conversationId: "conversation-1", tenantId: TENANT });

    assert.equal(envelope.status, "conflict");
    assert.equal(envelope.error?.code, "ai_connection_not_ready");
  });

  it("hides conversations of other tenants and requires tenant context", async () => {
    const context = makeContext();
    const service = makeService(context, () => fakeProvider(() => SUGGESTIONS_JSON));

    const foreign = await service.suggest({ conversationId: "conversation-1", tenantId: "tenant-ladoga" });
    assert.equal(foreign.status, "not_found");
    assert.equal(foreign.error?.code, "conversation_not_found");

    const missingTenant = await service.suggest({ conversationId: "conversation-1" });
    assert.equal(missingTenant.status, "invalid");
    assert.equal(missingTenant.error?.code, "tenant_context_required");
  });

  it("rejects dialogs without client messages", async () => {
    const context = makeContext({
      conversationMessages: [
        { id: 1, side: "agent", text: "Здравствуйте! Чем можем помочь?", time: "11:00" },
        { id: 2, text: "Диалог создан", time: "11:01", type: "event" }
      ]
    });
    const service = makeService(context, () => fakeProvider(() => SUGGESTIONS_JSON));

    const envelope = await service.suggest({ conversationId: "conversation-1", tenantId: TENANT });

    assert.equal(envelope.status, "invalid");
    assert.equal(envelope.error?.code, "ai_suggestions_no_client_message");
  });

  it("falls back to a single suggestion when the model returns plain text", async () => {
    const context = makeContext();
    const service = makeService(context, () => fakeProvider(() => "Заказ приедет завтра до 18:00."));

    const envelope = await service.suggest({ conversationId: "conversation-1", tenantId: TENANT });

    assert.equal(envelope.status, "ok");
    const data = envelope.data as { suggestions: Array<{ label: string; text: string }> };
    assert.equal(data.suggestions.length, 1);
    assert.equal(data.suggestions[0]!.label, "Вариант ответа");
  });

  it("maps concurrency limits to rate_limited and releases nothing extra", async () => {
    const context = makeContext({ limits: { maxConcurrentRuns: 1 } });
    const hold = context.usage.reserve({ connectionId: "conn-1", maxConcurrentRuns: 1, tenantId: TENANT, worstCaseTokens: 10 });
    const service = makeService(context, () => fakeProvider(() => SUGGESTIONS_JSON));

    const envelope = await service.suggest({ conversationId: "conversation-1", tenantId: TENANT });
    hold();

    assert.equal(envelope.status, "rate_limited");
    assert.equal(envelope.error?.code, "bot_ai_concurrency_limit_reached");
  });

  it("maps provider failures to a safe error envelope", async () => {
    const context = makeContext();
    const service = makeService(context, () => fakeProvider(() => {
      throw new AiProviderError("provider_timeout", true, "AI provider timed out.");
    }));

    const envelope = await service.suggest({ conversationId: "conversation-1", tenantId: TENANT });

    assert.equal(envelope.status, "error");
    assert.equal(envelope.error?.code, "provider_timeout");
    assert.ok(!JSON.stringify(envelope).includes(SECRET));
  });
});

describe("operator ai suggestions helpers", () => {
  it("buildTranscript keeps roles, skips events and builds the retrieval query from client turns", () => {
    const transcript = buildTranscript([
      { id: 1, text: "Диалог создан", time: "10:00", type: "event" },
      { id: 2, side: "client", text: "Здравствуйте!", time: "10:01" },
      { id: 3, side: "agent", text: "Добрый день!", time: "10:02" },
      { id: 4, text: "VIP-клиент", time: "10:03", type: "internal" },
      { id: 5, side: "client", text: "Когда приедет заказ №5?", time: "10:04" }
    ]);

    assert.equal(transcript.lastClientMessage, "Когда приедет заказ №5?");
    assert.ok(transcript.retrievalQuery.includes("Здравствуйте!"));
    assert.ok(transcript.retrievalQuery.includes("Когда приедет заказ №5?"));
    assert.ok(!transcript.text.includes("Диалог создан"));
    assert.ok(transcript.text.includes("Внутренняя заметка: VIP-клиент"));
  });

  it("parseSuggestions tolerates arrays, fenced JSON and caps at three items", () => {
    const fenced = parseSuggestions("```json\n[{\"text\":\"a\"},{\"text\":\"b\"},{\"text\":\"c\"},{\"text\":\"d\"}]\n```");
    assert.equal(fenced.length, 3);
    assert.deepEqual(fenced.map((item) => item.label), ["Коротко", "Подробно", "С эмпатией"]);

    assert.equal(parseSuggestions("").length, 0);
    assert.equal(parseSuggestions("{\"suggestions\":[]}")[0]?.label, "Вариант ответа");
  });
});

interface TestContext {
  connections: AiConnectionRepository;
  conversations: ConversationRepository;
  sources: KnowledgeSourceRepository;
  usage: AiUsageRepository;
}

function makeService(context: TestContext, providerFactory: OperatorAiSuggestionProviderFactory): OperatorAiSuggestionService {
  return new OperatorAiSuggestionService(
    context.conversations,
    context.connections,
    context.sources,
    WorkspaceRepository.inMemory(),
    ENVIRONMENT,
    context.usage,
    providerFactory,
    { invoke: () => Promise.reject(new Error("mcp_disabled_in_tests")) }
  );
}

function makeContext(overrides: {
  connections?: AiConnectionRecord[];
  conversationMessages?: ConversationRecord["messages"];
  limits?: AiConnectionRecord["limits"];
} = {}): TestContext {
  const conversations = ConversationRepository.inMemory({
    ...createEmptyConversationState(),
    conversations: [conversation(overrides.conversationMessages)]
  });
  const connections = AiConnectionRepository.inMemory({
    connections: overrides.connections ?? [connection(overrides.limits ?? {})]
  });
  return {
    connections,
    conversations,
    sources: KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [knowledgeSource()] }),
    usage: AiUsageRepository.inMemory()
  };
}

function conversation(messages?: ConversationRecord["messages"]): ConversationRecord {
  return {
    channel: "Telegram",
    clientSince: "2026-07-01",
    device: "mobile",
    entry: "inbound",
    id: "conversation-1",
    initials: "МС",
    language: "ru",
    messages: messages ?? [
      { id: 1, text: "Диалог создан", time: "11:20", type: "event" },
      { id: 2, side: "client", text: "Здравствуйте!", time: "11:22" },
      { id: 3, side: "agent", text: "Добрый день! Чем можем помочь?", time: "11:23" },
      { id: 4, text: "Клиент из VIP-сегмента", time: "11:24", type: "internal" },
      { id: 5, side: "client", text: "Когда приедет мой заказ?", time: "11:25" }
    ],
    name: "Мария Соколова",
    operatorId: "operator-1",
    operatorName: "Оператор",
    phone: "+79990000000",
    preview: "Когда приедет мой заказ?",
    previous: [],
    queueId: "queue-support",
    sla: "00:10",
    slaTone: "ok",
    status: "active",
    tags: [],
    tenantId: TENANT,
    time: "11:25",
    topic: "Доставка"
  };
}

function connection(limits: AiConnectionRecord["limits"]): AiConnectionRecord {
  const secret = new SecretStore({ keyVersion: "local-v1", masterKeyBase64: MASTER_KEY }).encrypt(SECRET);
  return {
    baseUrl: "https://ai.example.test/v1",
    capabilities: ["chat_completion"],
    chatModel: "test-model",
    createdAt: "2026-07-14T09:00:00.000Z",
    disabledAt: null,
    embeddingModel: null,
    id: "conn-1",
    keyVersion: "local-v1",
    lastTestMessage: null,
    lastTestStatus: "passed",
    lastTestedAt: "2026-07-14T09:00:00.000Z",
    limits,
    providerType: "openai_compatible",
    secret,
    status: "ready",
    tenantId: TENANT,
    updatedAt: "2026-07-14T09:00:00.000Z"
  };
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
    id: "src-delivery",
    kind: "document",
    lastIndexedAt: "2026-07-14T09:00:00.000Z",
    lastIngestedAt: "2026-07-14T09:00:00.000Z",
    metadata: { chunks: ["Доставка занимает 1-2 дня. Заказ передаётся курьеру, время прибытия до 18:00 следующего дня."] },
    owner: "admin",
    readiness: "ready",
    retentionUntil: null,
    sourceConfig: {},
    sourceRef: null,
    status: "ready",
    tenantId: TENANT,
    title: "Правила доставки",
    updatedAt: "2026-07-14T09:00:00.000Z",
    version: 1
  };
}

function fakeProvider(respond: (request: ChatCompletionRequest) => string) {
  return {
    model: "test-model",
    providerId: "openai-compatible-chat" as const,
    async complete(request: ChatCompletionRequest) {
      return {
        content: respond(request),
        model: "test-model",
        providerId: "openai-compatible-chat" as const,
        providerRequestId: null,
        usage: { totalTokens: 321 }
      };
    }
  };
}
