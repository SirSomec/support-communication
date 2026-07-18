import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createEnvelope } from "@support-communication/envelope";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";
import { createTelegramOutboundMessageDispatcher } from "../apps/api-gateway/src/integrations/telegram-outbound.dispatcher.ts";
import { loadTelegramPollingRuntimeConfig } from "../apps/api-gateway/src/integrations/telegram-polling.main.ts";
import { pollTelegramUpdatesOnce, startTelegramPollingWorker } from "../apps/api-gateway/src/integrations/telegram-polling.worker.ts";
import { resolveOrCreateTelegramConversation, telegramConversationId } from "../apps/api-gateway/src/integrations/telegram-webhook.route.ts";

describe("telegram polling ingress contracts", () => {
  it("ships a production runtime entrypoint and compose service for polling", () => {
    assert.deepEqual(loadTelegramPollingRuntimeConfig({
      TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test/",
      TELEGRAM_INGRESS_MODE: "polling",
      TELEGRAM_POLLING_ENABLED: "true",
      TELEGRAM_POLLING_INTERVAL_MS: "2500",
      TELEGRAM_POLLING_LIMIT: "25",
      TELEGRAM_POLLING_TIMEOUT_MS: "3000"
    }), {
      apiBaseUrl: "https://telegram.provider.example.test",
      enabled: true,
      ingressMode: "polling",
      intervalMs: 2500,
      limit: 25,
      timeoutMs: 3000
    });
    assert.throws(() => loadTelegramPollingRuntimeConfig({
      TELEGRAM_INGRESS_MODE: "polling",
      TELEGRAM_WEBHOOK_ENABLED: "true"
    }), /telegram_ingress_mode_conflict/);

    const apiMain = readFileSync(new URL("../apps/api-gateway/src/main.ts", import.meta.url), "utf8");
    assert.doesNotMatch(apiMain, /startTelegramPollingWorker|createTelegramOutboundMessageDispatcher/);

    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const releaseChecklist = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");
    assert.match(packageJson.scripts["telegram-polling:worker:once"], /telegram-polling-worker-smoke\.mjs/);
    assert.match(releaseChecklist, /script: "telegram-polling:worker:once"/);
  });

  it("imports bot messages from a token-managed telegram channel connection", async () => {
    const integrationRepository = IntegrationRepository.inMemory();
    const conversationRepository = ConversationRepository.inMemory();
    const conversations = new ConversationService(conversationRepository);
    const requestedUrls: string[] = [];
    const telegramFetch = async (input: string) => {
      requestedUrls.push(input);
      if (input.includes("/getMe")) {
        return {
          json: async () => ({ ok: true, result: { id: 123456, username: "support_bot" } }),
          ok: true,
          status: 200
        };
      }

      if (input.includes("/setWebhook")) {
        return {
          json: async () => ({ ok: true, result: true }),
          ok: true,
          status: 200
        };
      }

      if (input.includes("/getUpdates")) {
        return {
          json: async () => ({
            ok: true,
            result: [{
              message: {
                chat: { id: 99001122, type: "private" },
                from: { first_name: "Anna", id: 12345, username: "anna_client" },
                message_id: 42,
                text: "Где мой заказ?"
              },
              update_id: 9001
            }]
          }),
          ok: true,
          status: 200
        };
      }

      throw new Error(`Unexpected Telegram API URL ${input}`);
    };
    const integrations = new IntegrationService(integrationRepository, { telegramFetch });
    const created = await integrations.createChannelConnection("tenant-polling", {
      credentials: { token: "123456:support_bot_token" },
      name: "Telegram polling",
      type: "telegram"
    });

    assert.equal(created.status, "ok");

    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: conversations,
      fetcher: telegramFetch,
      integrationRepository
    });

    assert.equal(result.accepted, 1);
    assert.equal(result.polled, 1);
    assert.ok(requestedUrls.some((url) => url.includes("/getUpdates")));

    const persistedConnection = await integrationRepository.findTelegramConnectionByTenantIdAsync("tenant-polling");
    assert.equal(persistedConnection?.pollingOffset, 9002);

    requestedUrls.length = 0;
    await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: conversations,
      fetcher: telegramFetch,
      integrationRepository,
      offsets: new Map()
    });
    assert.ok(requestedUrls.some((url) => url.includes("offset=9002")));

    const conversation = await conversationRepository.findConversation(telegramConversationId("tenant-polling", "123456", "99001122"));
    assert.equal(conversation?.tenantId, "tenant-polling");
    assert.equal(conversation?.messages.at(-1)?.text, "Где мой заказ?");
  });

  it("keeps identical Telegram chat and update ids isolated between tenant bots", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: ["tenant-a", "tenant-b"].map((tenantId, index) => ({
        botId: `bot-${index + 1}`,
        botToken: `${100000 + index}:support_bot_token`,
        botUsername: `support_bot_${index + 1}`,
        createdAt: now,
        status: "active" as const,
        tenantId,
        tokenPreview: `${100000 + index}:****`,
        updatedAt: now,
        webhookSecret: `tg_wh_${index + 1}`
      }))
    });
    const conversationRepository = ConversationRepository.inMemory();
    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher: async () => ({
        json: async () => ({
          ok: true,
          result: [{
            message: {
              chat: { id: 424242 },
              from: { first_name: "Shared User" },
              message_id: 7,
              text: "Same provider ids"
            },
            update_id: 99
          }]
        }),
        ok: true,
        status: 200
      }),
      integrationRepository
    });

    assert.equal(result.accepted, 2);
    const tenantA = await conversationRepository.findConversation(telegramConversationId("tenant-a", "bot-1", "424242"));
    const tenantB = await conversationRepository.findConversation(telegramConversationId("tenant-b", "bot-2", "424242"));
    assert.equal(tenantA?.tenantId, "tenant-a");
    assert.equal(tenantB?.tenantId, "tenant-b");
    assert.notEqual(tenantA?.id, tenantB?.id);
  });

  it("continues polling other tenant connections when one Telegram API call fails", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: ["tenant-failing", "tenant-healthy"].map((tenantId, index) => ({
        botId: `isolated-bot-${index}`,
        botToken: `${700000 + index}:isolated_token`,
        botUsername: `isolated_${index}`,
        createdAt: now,
        status: "active" as const,
        tenantId,
        tokenPreview: `${700000 + index}:****`,
        updatedAt: now,
        webhookSecret: `isolated-secret-${index}`
      }))
    });
    const conversationRepository = ConversationRepository.inMemory();
    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher: async (url) => {
        if (url.includes("bot700000:")) {
          throw new Error("telegram_connection_unavailable");
        }
        return {
          json: async () => ({
            ok: true,
            result: [{
              message: { chat: { id: 8080 }, from: { first_name: "Healthy" }, message_id: 1, text: "Delivered" },
              update_id: 1
            }]
          }),
          ok: true,
          status: 200
        };
      },
      integrationRepository
    });

    assert.equal(result.polled, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.accepted, 1);
    assert.equal((await conversationRepository.listConversations({ tenantId: "tenant-healthy" })).length, 1);
  });

  it("backs off only the failing Telegram connection between polling passes", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const connections = ["tenant-failing", "tenant-healthy"].map((tenantId, index) => ({
      botId: `backoff-bot-${index}`,
      botToken: `${800000 + index}:backoff_token`,
      botUsername: `backoff_${index}`,
      createdAt: now.toISOString(),
      status: "active" as const,
      tenantId,
      tokenPreview: `${800000 + index}:****`,
      updatedAt: now.toISOString(),
      webhookSecret: `backoff-secret-${index}`
    }));
    const integrationRepository = {
      listTelegramConnections: () => connections
    };
    const connectionBackoff = new Map<string, { attempts: number; nextAttemptAt: number }>();
    const conversationRepository = ConversationRepository.inMemory();
    const calls = new Map<string, number>();
    const fetcher = async (url: string) => {
      const key = url.includes("bot800000:") ? "failing" : "healthy";
      calls.set(key, (calls.get(key) ?? 0) + 1);
      if (key === "failing") throw new Error("telegram_connection_unavailable");
      return { json: async () => ({ ok: true, result: [] }), ok: true, status: 200 };
    };
    const poll = () => pollTelegramUpdatesOnce({
      backoffBaseMs: 1_000,
      connectionBackoff,
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher,
      integrationRepository,
      now: () => now
    });

    const first = await poll();
    const skipped = await poll();
    now.setTime(now.getTime() + 1_000);
    const retried = await poll();

    assert.equal(first.failed, 1);
    assert.equal(skipped.failed, 0);
    assert.equal(retried.failed, 1);
    assert.deepEqual(Object.fromEntries(calls), { failing: 2, healthy: 3 });
    assert.equal(connectionBackoff.get("tenant-failing:backoff-bot-0")?.attempts, 2);
  });

  it("starts a stoppable polling loop for runtime telegram ingestion", async () => {
    let ticks = 0;
    const worker = startTelegramPollingWorker({
      intervalMs: 5,
      pollOnce: async () => {
        ticks += 1;
        return { accepted: 0, duplicates: 0, failed: 0, polled: 0 };
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    worker.stop();
    const stoppedAt = ticks;
    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.ok(stoppedAt > 0);
    assert.equal(ticks, stoppedAt);
  });

  it("fails closed on an active webhook without deleting provider configuration", async () => {
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: new Date().toISOString(),
        status: "active" as const,
        tenantId: "tenant-webhook-conflict",
        tokenPreview: "123456:****",
        updatedAt: new Date().toISOString(),
        webhookSecret: "tg_wh_test"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();
    const conversations = new ConversationService(conversationRepository);
    const requestedUrls: string[] = [];
    const telegramFetch = async (input: string) => {
      requestedUrls.push(input);
      if (input.includes("/getUpdates")) {
        return {
          json: async () => ({
            description: "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first",
            ok: false
          }),
          ok: false,
          status: 409
        };
      }

      throw new Error(`Unexpected Telegram API URL ${input}`);
    };

    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: conversations,
      fetcher: telegramFetch,
      integrationRepository
    });

    assert.equal(result.failed, 1);
    assert.equal(result.accepted, 0);
    assert.equal(requestedUrls.some((url) => url.includes("/deleteWebhook")), false);
  });

  it("does not advance the durable cursor when message normalization fails", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now,
        pollingOffset: 41,
        status: "active" as const,
        tenantId: "tenant-failed-normalization",
        tokenPreview: "123456:****",
        updatedAt: now,
        webhookSecret: "tg_wh_failed_normalization"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();

    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: {
        normalizeInboundEvent: async () => createEnvelope({
          data: {},
          error: { code: "inbound_failed", message: "Inbound processing failed." },
          operation: "normalizeInboundEvent",
          service: "channel-service",
          status: "error"
        })
      },
      fetcher: async () => ({
        json: async () => ({
          ok: true,
          result: [{
            message: {
              chat: { id: 555 },
              from: { first_name: "Failure" },
              message_id: 8,
              text: "Retry me"
            },
            update_id: 42
          }]
        }),
        ok: true,
        status: 200
      }),
      integrationRepository,
      offsets: new Map()
    });

    assert.equal(result.failed, 1);
    assert.equal((await integrationRepository.findTelegramConnectionByTenantIdAsync("tenant-failed-normalization"))?.pollingOffset, 41);
  });

  it("advances the durable cursor for unsupported updates", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now,
        pollingOffset: 12,
        status: "active" as const,
        tenantId: "tenant-unsupported-update",
        tokenPreview: "123456:****",
        updatedAt: now,
        webhookSecret: "tg_wh_unsupported"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();

    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher: async () => ({
        json: async () => ({ ok: true, result: [{ update_id: 15 }] }),
        ok: true,
        status: 200
      }),
      integrationRepository,
      offsets: new Map()
    });

    assert.equal(result.accepted, 0);
    assert.equal(result.failed, 0);
    assert.equal((await integrationRepository.findTelegramConnectionByTenantIdAsync("tenant-unsupported-update"))?.pollingOffset, 16);
  });

  it("records a CSAT survey callback without opening a follow-up appeal", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now,
        pollingOffset: 100,
        status: "active" as const,
        tenantId: "tenant-rating",
        tokenPreview: "123456:****",
        updatedAt: now,
        webhookSecret: "tg_wh_rating"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456",
      chatId: "445566",
      conversationRepository,
      displayName: "Rated Client",
      tenantId: "tenant-rating"
    });
    assert.ok(conversation);
    await conversationRepository.saveConversation({ ...conversation!, operatorId: "operator-1", status: "closed" });

    const requestedUrls: string[] = [];
    const ratings: Array<Record<string, unknown>> = [];
    const fetcher = async (input: string) => {
      requestedUrls.push(input);
      if (input.includes("/getUpdates")) {
        return {
          json: async () => ({
            ok: true,
            result: [{
              callback_query: { data: "quality:csat:4", id: "cbq-77", message: { chat: { id: 445566 } } },
              update_id: 120
            }]
          }),
          ok: true,
          status: 200
        };
      }
      if (input.includes("/answerCallbackQuery")) {
        return { json: async () => ({ ok: true, result: true }), ok: true, status: 200 };
      }
      throw new Error(`Unexpected Telegram API URL ${input}`);
    };

    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher,
      integrationRepository,
      offsets: new Map(),
      recordQualityRating: async (payload) => {
        ratings.push(payload);
        return { data: { ratingId: "rating-77" }, error: null, meta: {}, operation: "recordClientQualityRating", service: "qualityService", status: "ok", traceId: "trace-rating" } as any;
      }
    });

    assert.equal(result.accepted, 1);
    assert.equal(result.failed, 0);
    assert.equal(ratings.length, 1);
    assert.equal(ratings[0]?.conversationId, conversation!.id);
    assert.equal(ratings[0]?.operator, "operator-1");
    assert.equal(ratings[0]?.score, 4);
    assert.equal(ratings[0]?.scale, "CSAT");
    assert.equal(ratings[0]?.idempotencyKey, "telegram:123456:cbq-77");
    assert.ok(requestedUrls.some((url) => url.includes("/getUpdates") && url.includes("callback_query")));
    assert.ok(requestedUrls.some((url) => url.includes("/answerCallbackQuery") && url.includes("callback_query_id=cbq-77")));
    assert.equal((await conversationRepository.listConversations({ tenantId: "tenant-rating" })).length, 1, "a rating callback must not fork a follow-up appeal");
    assert.equal((await integrationRepository.findTelegramConnectionByTenantIdAsync("tenant-rating"))?.pollingOffset, 121);
  });

  it("hides the survey after a rating, collects the next message as feedback and only then forks a new appeal", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now,
        pollingOffset: 500,
        status: "active" as const,
        tenantId: "tenant-feedback",
        tokenPreview: "123456:****",
        updatedAt: now,
        webhookSecret: "tg_wh_feedback"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456",
      chatId: "445566",
      conversationRepository,
      displayName: "Feedback Client",
      tenantId: "tenant-feedback"
    });
    assert.ok(conversation);
    await conversationRepository.saveConversation({ ...conversation!, operatorId: "operator-1", status: "closed" });

    const updatesQueue: Array<Array<Record<string, unknown>>> = [
      [{
        callback_query: { data: "quality:csat:5", id: "cbq-501", message: { chat: { id: 445566 }, message_id: 901 } },
        update_id: 501
      }],
      [{
        message: { chat: { id: 445566 }, from: { first_name: "Feedback" }, message_id: 902, text: "Спасибо, оператор очень помог" },
        update_id: 502
      }],
      [{
        message: { chat: { id: 445566 }, from: { first_name: "Feedback" }, message_id: 903, text: "У меня новый вопрос" },
        update_id: 503
      }]
    ];
    const requestedUrls: string[] = [];
    const fetcher = async (input: string) => {
      requestedUrls.push(input);
      if (input.includes("/getUpdates")) {
        const batch = updatesQueue.shift() ?? [];
        return { json: async () => ({ ok: true, result: batch }), ok: true, status: 200 };
      }
      return { json: async () => ({ ok: true, result: true }), ok: true, status: 200 };
    };
    const pollInput = {
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher,
      integrationRepository,
      offsets: new Map<string, number>(),
      recordQualityRating: async () => ({ data: { ratingId: "rating-501" }, error: null, meta: {}, operation: "recordClientQualityRating", service: "qualityService", status: "ok", traceId: "trace-rating" } as any)
    };

    // 1. Оценка: опрос скрывается, клиенту предлагают оставить комментарий.
    const ratingPoll = await pollTelegramUpdatesOnce(pollInput);
    assert.equal(ratingPoll.accepted, 1);
    assert.ok(
      requestedUrls.some((url) => url.includes("/deleteMessage") && url.includes("chat_id=445566") && url.includes("message_id=901")),
      "the survey message must be hidden after the rating"
    );
    const promptUrl = requestedUrls.find((url) => url.includes("/sendMessage"));
    assert.ok(promptUrl, "the feedback prompt must be sent");
    assert.ok(decodeURIComponent(promptUrl!).includes("quality:feedback:new_appeal"), "the prompt must offer a new appeal button");
    const awaiting = await conversationRepository.findConversation(conversation!.id);
    assert.equal(awaiting?.metadata?.csatFeedback?.state, "awaiting");
    assert.equal(awaiting?.metadata?.csatFeedback?.ratingId, "rating-501");

    // 2. Следующее сообщение — отзыв: остается в закрытом обращении, без форка.
    requestedUrls.length = 0;
    const feedbackPoll = await pollTelegramUpdatesOnce(pollInput);
    assert.equal(feedbackPoll.accepted, 1);
    const appeals = await conversationRepository.listConversations({ tenantId: "tenant-feedback" });
    assert.equal(appeals.length, 1, "a feedback message must not fork a follow-up appeal");
    const rated = await conversationRepository.findConversation(conversation!.id);
    assert.equal(rated?.status, "closed");
    const feedbackMessage = rated?.messages.at(-1);
    assert.equal(feedbackMessage?.type, "csat_feedback");
    assert.equal(feedbackMessage?.side, "client");
    assert.equal(feedbackMessage?.text, "Спасибо, оператор очень помог");
    assert.equal(rated?.preview, "Отзыв: Спасибо, оператор очень помог");
    assert.equal(rated?.metadata?.csatFeedback?.state, "received");
    assert.ok(
      // URLSearchParams кодирует пробелы как "+": сверяем по слову без пробелов.
      requestedUrls.some((url) => url.includes("/sendMessage") && decodeURIComponent(url).includes("отзыв")),
      "the client must receive a feedback acknowledgement"
    );

    // 3. Отзыв уже получен: новое сообщение открывает новое обращение.
    const followUpPoll = await pollTelegramUpdatesOnce(pollInput);
    assert.equal(followUpPoll.accepted, 1);
    const afterFollowUp = await conversationRepository.listConversations({ tenantId: "tenant-feedback" });
    assert.equal(afterFollowUp.length, 2, "a message after the feedback must open a new appeal");
    const followUp = afterFollowUp.find((item) => item.id !== conversation!.id);
    assert.equal(followUp?.status, "new");
    assert.equal(followUp?.messages.at(-1)?.text, "У меня новый вопрос");
  });

  it("declines the feedback prompt via the new appeal button and forks the next message", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now,
        pollingOffset: 600,
        status: "active" as const,
        tenantId: "tenant-feedback-decline",
        tokenPreview: "123456:****",
        updatedAt: now,
        webhookSecret: "tg_wh_feedback_decline"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456",
      chatId: "556677",
      conversationRepository,
      displayName: "Decline Client",
      tenantId: "tenant-feedback-decline"
    });
    assert.ok(conversation);
    await conversationRepository.saveConversation({ ...conversation!, operatorId: "operator-1", status: "closed" });

    const updatesQueue: Array<Array<Record<string, unknown>>> = [
      [{
        callback_query: { data: "quality:csat:2", id: "cbq-601", message: { chat: { id: 556677 }, message_id: 911 } },
        update_id: 601
      }],
      [{
        callback_query: { data: "quality:feedback:new_appeal", id: "cbq-602", message: { chat: { id: 556677 }, message_id: 912 } },
        update_id: 602
      }],
      [{
        message: { chat: { id: 556677 }, from: { first_name: "Decline" }, message_id: 913, text: "Другая проблема" },
        update_id: 603
      }]
    ];
    const requestedUrls: string[] = [];
    const fetcher = async (input: string) => {
      requestedUrls.push(input);
      if (input.includes("/getUpdates")) {
        const batch = updatesQueue.shift() ?? [];
        return { json: async () => ({ ok: true, result: batch }), ok: true, status: 200 };
      }
      return { json: async () => ({ ok: true, result: true }), ok: true, status: 200 };
    };
    const pollInput = {
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher,
      integrationRepository,
      offsets: new Map<string, number>(),
      recordQualityRating: async () => ({ data: { ratingId: "rating-601" }, error: null, meta: {}, operation: "recordClientQualityRating", service: "qualityService", status: "ok", traceId: "trace-rating" } as any)
    };

    await pollTelegramUpdatesOnce(pollInput);
    assert.equal((await conversationRepository.findConversation(conversation!.id))?.metadata?.csatFeedback?.state, "awaiting");

    // «Новое обращение»: ожидание снято, промпт скрыт, callback подтвержден.
    requestedUrls.length = 0;
    const declinePoll = await pollTelegramUpdatesOnce(pollInput);
    assert.equal(declinePoll.accepted, 1);
    assert.equal((await conversationRepository.findConversation(conversation!.id))?.metadata?.csatFeedback?.state, "declined");
    assert.ok(requestedUrls.some((url) => url.includes("/deleteMessage") && url.includes("message_id=912")), "the feedback prompt must be hidden");
    assert.ok(requestedUrls.some((url) => url.includes("/answerCallbackQuery") && url.includes("callback_query_id=cbq-602")));
    assert.equal((await integrationRepository.findTelegramConnectionByTenantIdAsync("tenant-feedback-decline"))?.pollingOffset, 603);

    const followUpPoll = await pollTelegramUpdatesOnce(pollInput);
    assert.equal(followUpPoll.accepted, 1);
    const appeals = await conversationRepository.listConversations({ tenantId: "tenant-feedback-decline" });
    assert.equal(appeals.length, 2, "a message after the declined feedback must open a new appeal");
    assert.equal(appeals.find((item) => item.id !== conversation!.id)?.messages.at(-1)?.text, "Другая проблема");
  });

  it("attaches a rating to the latest closed appeal and its closing operator when the dialog was never assigned", async () => {
    const now = new Date();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now.toISOString(),
        pollingOffset: 300,
        status: "active" as const,
        tenantId: "tenant-rating-unassigned",
        tokenPreview: "123456:****",
        updatedAt: now.toISOString(),
        webhookSecret: "tg_wh_rating_unassigned"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();
    const created = await resolveOrCreateTelegramConversation({
      botId: "123456",
      chatId: "665544",
      conversationRepository,
      displayName: "Unassigned Client",
      tenantId: "tenant-rating-unassigned"
    });
    assert.ok(created);
    const closedAt = new Date(now.getTime() - 60_000).toISOString();
    await conversationRepository.saveConversationMutation({
      conversation: { ...created!, status: "closed", updatedAt: closedAt },
      lifecycleEvent: {
        actorId: "usr-closer",
        actorName: "Operator Closer",
        actorType: "operator",
        conversationId: created!.id,
        data: { fromStatus: "active", toStatus: "closed" },
        eventType: "status.changed",
        id: "lifecycle-close-1",
        ingestedAt: closedAt,
        occurredAt: closedAt,
        reason: null,
        schemaVersion: "conversation-lifecycle/v1",
        source: "dialog-service",
        sourceEventId: "rt-close-1",
        tenantId: "tenant-rating-unassigned",
        traceId: "trace-close-1"
      },
      realtimeEvent: {
        data: { toStatus: "closed" },
        eventId: "rt-close-1",
        eventName: "conversation.updated",
        occurredAt: closedAt,
        resourceId: created!.id,
        resourceType: "conversation",
        schemaVersion: "v1",
        tenantId: "tenant-rating-unassigned",
        traceId: "trace-close-1"
      }
    });
    const followUp = await resolveOrCreateTelegramConversation({
      botId: "123456",
      chatId: "665544",
      conversationRepository,
      displayName: "Unassigned Client",
      tenantId: "tenant-rating-unassigned"
    });
    assert.ok(followUp);
    assert.notEqual(followUp!.id, created!.id, "a follow-up appeal must fork from the closed anchor");

    const ratings: Array<Record<string, unknown>> = [];
    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher: async (input: string) => ({
        json: async () => input.includes("/getUpdates")
          ? {
              ok: true,
              result: [{
                callback_query: { data: "quality:csat:5", id: "cbq-99", message: { chat: { id: 665544 } } },
                update_id: 305
              }]
            }
          : { ok: true, result: true },
        ok: true,
        status: 200
      }),
      integrationRepository,
      offsets: new Map(),
      recordQualityRating: async (payload) => {
        ratings.push(payload);
        return { data: { ratingId: "rating-99" }, error: null, meta: {}, operation: "recordClientQualityRating", service: "qualityService", status: "ok", traceId: "trace-rating" } as any;
      }
    });

    assert.equal(result.accepted, 1);
    assert.equal(result.failed, 0);
    assert.equal(ratings[0]?.conversationId, created!.id, "the rating belongs to the closed appeal, not the open follow-up");
    assert.equal(ratings[0]?.operator, "usr-closer", "the closing operator from lifecycle history is credited");
    assert.equal((await conversationRepository.listConversations({ tenantId: "tenant-rating-unassigned" })).length, 2, "a rating callback must not create another appeal");
  });

  it("skips a rating callback without jamming the cursor when quality ingestion is not configured", async () => {
    const now = new Date().toISOString();
    const integrationRepository = IntegrationRepository.inMemory({
      ...emptyIntegrationState(),
      telegramConnections: [{
        botId: "123456",
        botToken: "123456:support_bot_token",
        botUsername: "support_bot",
        createdAt: now,
        pollingOffset: 200,
        status: "active" as const,
        tenantId: "tenant-rating-unconfigured",
        tokenPreview: "123456:****",
        updatedAt: now,
        webhookSecret: "tg_wh_rating_unconfigured"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();

    const result = await pollTelegramUpdatesOnce({
      conversationRepository,
      conversationService: new ConversationService(conversationRepository),
      fetcher: async (input: string) => ({
        json: async () => input.includes("/getUpdates")
          ? {
              ok: true,
              result: [{
                callback_query: { data: "quality:csat:5", id: "cbq-88", message: { chat: { id: 998877 } } },
                update_id: 205
              }]
            }
          : { ok: true, result: true },
        ok: true,
        status: 200
      }),
      integrationRepository,
      offsets: new Map()
    });

    assert.equal(result.accepted, 0);
    assert.equal(result.failed, 1);
    assert.equal((await conversationRepository.listConversations({ tenantId: "tenant-rating-unconfigured" })).length, 0);
    assert.equal((await integrationRepository.findTelegramConnectionByTenantIdAsync("tenant-rating-unconfigured"))?.pollingOffset, 206);
  });

  it("sends operator replies through the tenant telegram bot token", async () => {
    const calls: Array<{ body: Record<string, unknown>; headers?: Record<string, string>; signal?: AbortSignal; url: string }> = [];
    const dispatcher = createTelegramOutboundMessageDispatcher({
      apiBaseUrl: "https://telegram.provider.example.test",
      fetcher: async (url: string, init: { body: string; headers?: Record<string, string>; signal?: AbortSignal }) => {
        calls.push({
          body: JSON.parse(init.body),
          headers: init.headers,
          signal: init.signal,
          url
        });
        return {
          json: async () => ({ ok: true, result: { message_id: 77 } }),
          ok: true,
          status: 200
        };
      },
      integrationRepository: {
        listTelegramConnections: () => [{
          channelConnectionId: "telegram-outbound-primary",
          botId: "123456",
          botToken: "123456:support_bot_token",
          botUsername: "support_bot",
          createdAt: new Date().toISOString(),
          status: "active" as const,
          tenantId: "tenant-telegram-outbound",
          tokenPreview: "123456:****",
          updatedAt: new Date().toISOString(),
          webhookSecret: "tg_wh_outbound"
        }]
      }
    });

    const result = await dispatcher.deliverMessage({
      channel: "Telegram",
      chatId: "99001122",
      conversationId: "99001122",
      descriptorId: "delivery-telegram-operator",
      idempotencyKey: "telegram-operator-key",
      messageId: "msg-operator-telegram",
      tenantId: "tenant-telegram-outbound",
      text: "Operator reply",
      traceId: "trc-telegram-operator"
    });

    assert.equal(result?.status, "delivered");
    assert.equal(result?.providerMessageId, "77");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://telegram.provider.example.test/bot123456:support_bot_token/sendMessage");
    assert.equal(calls[0].headers?.["idempotency-key"], "telegram-operator-key");
    assert.ok(calls[0].signal instanceof AbortSignal);
    assert.deepEqual(calls[0].body, {
      chat_id: "99001122",
      disable_web_page_preview: true,
      text: "Operator reply"
    });
  });

  it("sends through the telegram connection that owns the conversation", async () => {
    const urls: string[] = [];
    const connection = (channelConnectionId: string, botToken: string) => ({
      botId: botToken.split(":")[0],
      botToken,
      botUsername: channelConnectionId,
      channelConnectionId,
      createdAt: "2026-07-17T10:00:00.000Z",
      status: "active" as const,
      tenantId: "tenant-telegram-multiple",
      tokenPreview: `${botToken.split(":")[0]}:****`,
      updatedAt: "2026-07-17T10:00:00.000Z",
      webhookSecret: `secret-${channelConnectionId}`
    });
    const dispatcher = createTelegramOutboundMessageDispatcher({
      apiBaseUrl: "https://telegram.provider.example.test",
      fetcher: async (url: string) => {
        urls.push(url);
        return { json: async () => ({ ok: true }), ok: true, status: 200 };
      },
      integrationRepository: {
        listTelegramConnections: () => [
          connection("telegram-first", "111111:first_bot_token"),
          connection("telegram-owner", "222222:owner_bot_token")
        ]
      }
    });
    const request = {
      channel: "Telegram",
      chatId: "99001122",
      conversationId: "conversation-telegram-owner",
      descriptorId: "delivery-telegram-owner",
      idempotencyKey: "telegram-owner-key",
      messageId: "msg-telegram-owner",
      tenantId: "tenant-telegram-multiple",
      text: "Owner bot reply",
      traceId: "trc-telegram-owner"
    };

    const delivered = await dispatcher.deliverMessage({ ...request, channelConnectionId: "telegram-owner" });
    const ambiguous = await dispatcher.deliverMessage(request);

    assert.equal(delivered?.status, "delivered");
    assert.deepEqual(urls, ["https://telegram.provider.example.test/bot222222:owner_bot_token/sendMessage"]);
    assert.deepEqual(ambiguous, { status: "failed", reason: "telegram_connection_not_found" });
  });
});

function emptyIntegrationState() {
  return {
    apiKeyRotationAuditEvents: [],
    apiKeyRotationJobs: [],
    channelConnectionAuditEvents: [],
    channelConnectionEvents: [],
    channelConnections: [],
    publicApiKeys: [],
    publicApiKeyRevealStates: [],
    securitySessions: [],
    webhookDeliveryJournal: [],
    webhookReplayAuditEvents: [],
    webhookReplayJournal: [],
    workspace: {
      apiChangelog: [],
      apiEnvironmentKeys: [],
      channelDetails: [],
      securityAlerts: [],
      securityControls: [],
      webhookDeliveryLog: [],
      webhookEndpoints: []
    }
  };
}
