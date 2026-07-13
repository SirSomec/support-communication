import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import { runBotRuntimeReconciliationOnce } from "../apps/api-gateway/src/automation/bot-runtime-reconciliation.worker.ts";
import { ConversationRepository, createEmptyConversationState } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { InMemoryOutboxStore } from "@support-communication/events";

function automation(kind: "handoff" | "message") {
  const state = createEmptyAutomationState();
  const target = kind === "message" ? { id: "reply", type: "message", title: "Hello" } : { config: { queueId: "queue-priority" }, id: "handoff", type: "handoff", title: "Priority" };
  const nodes = [{ id: "start", type: "condition" }, target];
  const edges = [{ from: "start", to: target.id }];
  state.botScenarios.push({ activeVersionId: "v1", channels: ["SDK"], flowEdges: edges, flowNodes: nodes, id: "bot-1", name: "Bot", schemaVersion: "bot-flow/v1", status: "published", tenantId: "tenant-1" });
  state.botScenarioVersions.push({ createdAt: "2026-07-11T10:00:00.000Z", flowEdges: edges, flowNodes: nodes, scenarioId: "bot-1", status: "published", tenantId: "tenant-1", versionId: "v1" });
  return AutomationRepository.inMemory(state);
}

function conversations() {
  const state = createEmptyConversationState();
  state.conversations.push({ channel: "SDK", clientSince: "today", device: "web", entry: "widget", id: "conv-1", initials: "CU", language: "ru", messages: [], name: "Customer", operatorId: "operator-1", operatorName: "Operator", phone: "provider-chat-42", preview: "", previous: [], queueId: "queue-general", sla: "", slaTone: "", status: "assigned", tags: [], tenantId: "tenant-1", time: "", topic: "Support" });
  return ConversationRepository.inMemory(state);
}

async function createStep(repository: AutomationRepository) {
  return new BotRuntimeService(repository, { now: () => new Date("2026-07-11T11:00:00.000Z") }).handleInboundEvent({ channel: "SDK", conversationId: "conv-1", eventId: "evt-1", scenarioId: "bot-1", tenantId: "tenant-1", traceId: "trace-1" });
}

describe("bot runtime side-effect reconciliation", () => {
  it("recovers a crash after real descriptor+outbox commit without creating duplicates", async () => {
    const automationRepository = automation("message");
    const conversationRepository = conversations();
    await createStep(automationRepository);
    let crash = true;
    const crashingRepository = {
      findConversation: conversationRepository.findConversation.bind(conversationRepository),
      findOutboundDescriptorByIdempotencyKey: conversationRepository.findOutboundDescriptorByIdempotencyKey.bind(conversationRepository),
      listLifecycleEvents: conversationRepository.listLifecycleEvents.bind(conversationRepository),
      saveConversationMutation: conversationRepository.saveConversationMutation.bind(conversationRepository),
      recordOutboundDescriptor: conversationRepository.recordOutboundDescriptor.bind(conversationRepository),
      async queueOutboundMessageReply(input: Parameters<ConversationRepository["queueOutboundMessageReply"]>[0]) {
        const saved = await conversationRepository.queueOutboundMessageReply(input);
        if (crash) {
          crash = false;
          throw new Error("simulated_crash_after_conversation_commit");
        }
        return saved;
      }
    };
    const first = await runBotRuntimeReconciliationOnce({ automationRepository, conversationRepository: crashingRepository, maxAttempts: 3, now: "2026-07-11T11:00:01.000Z", retryBackoffMs: 1_000 });
    assert.equal(first.failed, 1);
    assert.equal((await conversationRepository.listOutboundDescriptors()).length, 1);
    const outboxAfterCrash = await conversationRepository.listOutboxEvents();
    assert.equal(outboxAfterCrash.length, 1);
    assert.equal(outboxAfterCrash[0]?.type, "message.delivery.requested");
    const second = await runBotRuntimeReconciliationOnce({ automationRepository, conversationRepository: crashingRepository, now: "2026-07-11T11:00:03.000Z" });
    assert.equal(second.delivered, 1);
    assert.equal((await conversationRepository.listOutboundDescriptors()).length, 1);
    assert.equal((await conversationRepository.listOutboxEvents()).length, 1);
    assert.equal(automationRepository.readState().botRuntimeSideEffects[0]?.status, "delivered");
  });

  it("persists the bot reply into conversation messages for the operator UI", async () => {
    const automationRepository = automation("message");
    const conversationRepository = conversations();
    await createStep(automationRepository);
    const published: string[] = [];
    const result = await runBotRuntimeReconciliationOnce({
      automationRepository,
      conversationRepository,
      now: "2026-07-11T11:00:01.000Z",
      realtimeFanout: {
        async publish(event) {
          published.push(event.eventName);
          return { channel: "test", status: "published", subscribers: 1 };
        }
      }
    });
    assert.equal(result.delivered, 1);
    const conversation = await conversationRepository.findConversation("conv-1");
    assert.equal(conversation?.messages.length, 1);
    assert.equal(conversation?.messages[0]?.side, "agent");
    assert.equal(conversation?.messages[0]?.text, "Hello");
    assert.equal(conversation?.messages[0]?.author, "Бот «Bot»");
    assert.equal(conversation?.preview, "Hello");
    const events = await conversationRepository.listLifecycleEvents({ conversationId: "conv-1", tenantId: "tenant-1" });
    assert.equal(events.filter((event) => event.eventType === "message.sent").length, 1);
    assert.deepEqual(published, ["message.created"]);
  });

  it("passes the reconciled outbox event through the real handler registry", async () => {
    const automationRepository = automation("message");
    const conversationRepository = conversations();
    await createStep(automationRepository);
    await runBotRuntimeReconciliationOnce({ automationRepository, conversationRepository, now: "2026-07-11T11:00:01.000Z" });
    const [event] = await conversationRepository.listOutboxEvents();
    assert.ok(event);
    const eventStore = new InMemoryOutboxStore();
    await eventStore.append(event);
    const deliveries: Array<Record<string, unknown>> = [];
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const handlers = worker.createDefaultOutboxHandlers({
      channelConnectors: { SDK: { async deliverMessage(request) { deliveries.push(request as unknown as Record<string, unknown>); }, async startConversation() {} } },
      outboundDescriptorStore: {
        async findOutboundDescriptorById(id: string) { return (await conversationRepository.listOutboundDescriptors()).find((item) => item.id === id); }
      },
      writeLog: () => undefined
    });
    const handled = await worker.runOutboxWorker({ handlers, once: true, queue: "message-delivery", store: eventStore });
    assert.equal(handled.published, 1);
    assert.equal(handled.failed, 0);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.conversationId, "provider-chat-42");
    assert.equal(deliveries[0]?.text, "Hello");
  });

  it("reconciles handoff into canonical conversation queue and one lifecycle event", async () => {
    const automationRepository = automation("handoff");
    const conversationRepository = conversations();
    await createStep(automationRepository);
    const result = await runBotRuntimeReconciliationOnce({ automationRepository, conversationRepository, now: "2026-07-11T11:00:01.000Z" });
    assert.equal(result.delivered, 1);
    const conversation = await conversationRepository.findConversation("conv-1");
    assert.equal(conversation?.status, "queued");
    assert.equal(conversation?.queueId, "queue-priority");
    assert.equal(conversation?.operatorId, undefined);
    const events = await conversationRepository.listLifecycleEvents({ conversationId: "conv-1", tenantId: "tenant-1" });
    assert.equal(events.filter((event) => event.eventType === "bot.handoff.created").length, 1);
  });
});
