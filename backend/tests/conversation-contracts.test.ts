import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import { lastValueFrom, toArray } from "rxjs";
import type { RealtimeFanoutAdapter, RealtimeFanoutEvent } from "../apps/api-gateway/src/conversation/realtime.fanout.ts";
import { ConversationRepository as RuntimeConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { bootstrapConversationState } from "../apps/api-gateway/src/conversation/seed.ts";
import { createRealtimeSseStream } from "../apps/api-gateway/src/conversation/realtime.sse.ts";
import { writeRealtimeWebSocketReplay } from "../apps/api-gateway/src/conversation/realtime.websocket.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { createDeterministicObjectStorageSigner } from "../apps/api-gateway/src/workspace/object-storage.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import { IdentityRepository as RuntimeIdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";

const ConversationRepository = {
  default: () => RuntimeConversationRepository.default(),
  inMemory: () => RuntimeConversationRepository.inMemory(bootstrapConversationState())
};
const IdentityRepository = {
  inMemory: () => RuntimeIdentityRepository.inMemory(bootstrapIdentityState())
};

describe("phase 2 conversation, message, channel and realtime backend contracts", () => {
  beforeEach(() => {
    RuntimeConversationRepository.useDefault(RuntimeConversationRepository.inMemory(bootstrapConversationState()));
  });
  it("assigns a live dialog to an active tenant user and records report activity atomically", async () => {
    const repository = ConversationRepository.inMemory();
    const identityRepository = IdentityRepository.inMemory();
    const conversations = new ConversationService(repository, { identityRepository });
    const assignees = await conversations.fetchAssignees({ tenantId: "tenant-volga" });
    const operator = (assignees.data.items as Array<{ id: string; name: string }>)[0];

    assert.ok(operator);
    const assigned = await conversations.assignConversation({
      conversationId: "maria",
      operatorId: operator.id,
      reason: "Primary queue assignment"
    }, { tenantId: "tenant-volga" });

    assert.equal(assigned.status, "ok");
    assert.equal(assigned.data.action, "assignment");
    assert.equal(assigned.data.conversation.operatorId, operator.id);
    assert.equal(assigned.data.conversation.operatorName, operator.name);
    assert.equal(assigned.data.conversation.status, "assigned");
    assert.match(String(assigned.data.analyticsEventId), /^analytics_assignment_/);
    assert.equal(assigned.data.realtimeEvent.eventName, "conversation.updated");

    const detail = await conversations.fetchDialogDetail("maria", { tenantId: "tenant-volga" });
    const realtime = await repository.listRealtimeEvents({ tenantId: "tenant-volga" });
    assert.equal(detail.data.conversation.operatorId, operator.id);
    assert.equal(realtime.some((event) => event.eventId === assigned.data.realtimeEvent.eventId), true);

    const unchanged = await conversations.assignConversation({
      conversationId: "maria",
      operatorId: operator.id,
      reason: "Repeated queue assignment"
    }, { tenantId: "tenant-volga" });
    assert.equal(unchanged.status, "conflict");
    assert.equal(unchanged.error?.code, "operator_unchanged");
  });

  it("persists an immutable tenant-scoped lifecycle timeline for dialog mutations", async () => {
    const repository = RuntimeConversationRepository.inMemory(bootstrapConversationState());
    const conversations = new ConversationService(repository, { identityRepository: IdentityRepository.inMemory() });
    const scope = {
      actorId: "usr-volga-admin",
      actorName: "Sergey Markin",
      actorType: "operator" as const,
      tenantId: "tenant-volga"
    };

    const status = await conversations.transitionConversationStatus({
      conversationId: "maria",
      nextStatus: "waiting_client",
      reason: "Waiting for customer confirmation"
    }, scope);
    const note = await conversations.appendMessage({
      conversationId: "maria",
      mode: "internal",
      text: "Verify the courier response before replying."
    }, scope);
    const assignees = await conversations.fetchAssignees(scope);
    const operator = (assignees.data.items as Array<{ id: string }>)[0];
    const assignment = await conversations.assignConversation({
      conversationId: "maria",
      operatorId: operator.id,
      reason: "Assign after lifecycle review"
    }, scope);

    assert.equal(status.status, "ok");
    assert.equal(note.status, "ok");
    assert.equal(assignment.status, "ok");
    const events = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" });
    assert.deepEqual(events.map((event) => event.eventType), [
      "status.changed",
      "internal_comment.created",
      "assignment.changed"
    ]);
    assert.ok(events.every((event) => event.actorId === "usr-volga-admin" && event.tenantId === "tenant-volga"));
    assert.equal(events[0].reason, "Waiting for customer confirmation");

    const firstPage = await conversations.fetchConversationTimeline("maria", { limit: 2 }, scope);
    const secondPage = await conversations.fetchConversationTimeline("maria", {
      cursor: String(firstPage.data.nextCursor),
      limit: 2
    }, scope);
    assert.equal(firstPage.data.events.length, 2);
    assert.equal(secondPage.data.events.length, 1);
    assert.equal(secondPage.data.events[0].eventType, "assignment.changed");

    const foreign = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-northstar" });
    assert.deepEqual(foreign, []);
  });

  it("ships a database trigger that rejects lifecycle event updates and deletes", () => {
    const migration = readFileSync(new URL("../prisma/migrations/202607110003_conversation_lifecycle_events/migration.sql", import.meta.url), "utf8");
    assert.match(migration, /BEFORE UPDATE OR DELETE ON "conversation_lifecycle_events"/);
    assert.match(migration, /conversation_lifecycle_events are append-only/);
    assert.match(migration, /FOREIGN KEY \("tenant_id", "conversation_id"\)/);
  });

  it("maps legacy customer lifecycle actors to the canonical client actor", () => {
    const repositorySource = readFileSync(new URL("../apps/api-gateway/src/conversation/conversation.repository.ts", import.meta.url), "utf8");
    assert.match(repositorySource, /value === "customer"[\s\S]*return "client"/);
  });

  it("backfills legacy closed dialogs and enforces resolution outcomes", () => {
    const migration = readFileSync(new URL("../prisma/migrations/202607110006_conversation_resolution_outcome/migration.sql", import.meta.url), "utf8");
    assert.match(migration, /SET "resolution_outcome" = 'legacy_unknown'/);
    assert.match(migration, /conversations_closed_resolution_outcome_check/);
    assert.match(migration, /conversations_tenant_resolution_outcome_updated_idx/);
  });

  it("rejects assignment to an operator outside the active tenant roster", async () => {
    const conversations = new ConversationService(ConversationRepository.inMemory(), {
      identityRepository: IdentityRepository.inMemory()
    });

    const denied = await conversations.assignConversation({
      conversationId: "maria",
      operatorId: "usr-ns-owner",
      reason: "Cross tenant assignment"
    }, { tenantId: "tenant-volga" });

    assert.equal(denied.status, "not_found");
    assert.equal(denied.error?.code, "operator_not_available");
  });

  it("lists dialogs with frontend-compatible pagination and filters", async () => {
    const conversations = new ConversationService();

    const queued = await conversations.fetchDialogs({ status: "queued", page: 1, pageSize: 10 });

    assert.equal(queued.service, "dialogService");
    assert.equal(queued.operation, "fetchDialogs");
    assert.equal(queued.partial, true);
    assert.equal(queued.meta.source, "api");
    assert.equal(queued.data.pagination.mode, "backend-ready");
    assert.equal(queued.data.pagination.page, 1);
    assert.equal(queued.data.pagination.pageSize, 10);
    assert.ok(queued.data.items.length > 0);
    assert.ok(queued.data.items.every((conversation) => conversation.status === "queued"));
    assert.ok(queued.data.items[0].messages.length > 0);
  });

  it("guards close transitions until a topic is selected", async () => {
    const conversations = new ConversationService();

    const missingTopic = await conversations.transitionConversationStatus({
      conversationId: "vladimir",
      nextStatus: "closed",
      roleMode: "admin"
    });
    assert.equal(missingTopic.status, "invalid");
    assert.equal(missingTopic.error?.code, "topic_required");
    assert.equal(missingTopic.data.guard, "role_channel_topic");

    const missingOutcome = await conversations.transitionConversationStatus({
      conversationId: "vladimir",
      nextStatus: "closed",
      topic: "Product / Mismatch"
    });
    assert.equal(missingOutcome.status, "invalid");
    assert.equal(missingOutcome.error?.code, "resolution_outcome_required");

    const closed = await conversations.transitionConversationStatus({
      conversationId: "vladimir",
      nextStatus: "closed",
      resolutionOutcome: "resolved",
      roleMode: "admin",
      topic: "Product / Mismatch"
    });
    assert.equal(closed.status, "ok");
    assert.equal(closed.data.conversation.status, "closed");
    assert.equal(closed.data.conversation.topic, "Product / Mismatch");
    assert.equal(closed.data.conversation.resolutionOutcome, "resolved");
    assert.equal(closed.data.lifecycleEvent.data.resolutionOutcome, "resolved");
    assert.equal(closed.data.auditEvent.immutable, true);
    assert.equal(closed.data.realtimeEvent.eventName, "conversation.updated");

    const duplicateClose = await conversations.transitionConversationStatus({
      conversationId: "vladimir",
      nextStatus: "closed",
      resolutionOutcome: "resolved"
    });
    assert.equal(duplicateClose.status, "conflict");
    assert.equal(duplicateClose.error?.code, "conversation_already_closed");

    const reopened = await conversations.transitionConversationStatus({
      conversationId: "vladimir",
      nextStatus: "reopened"
    });
    assert.equal(reopened.status, "ok");
    assert.equal(reopened.data.conversation.resolutionOutcome, undefined);
  });

  it("keeps internal comments out of outbound delivery", async () => {
    const conversations = new ConversationService();

    const internal = await conversations.appendMessage({
      conversationId: "maria",
      mode: "internal",
      text: "Check courier escalation before replying"
    });
    assert.equal(internal.status, "ok");
    assert.equal(internal.data.message.type, "internal");
    assert.match(String(internal.data.message.createdAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(internal.data.outboundDelivery, null);
    assert.equal(internal.data.auditEvent.action, "message.internal_note.create");

    const reply = await conversations.appendMessage({
      conversationId: "maria",
      mode: "reply",
      text: "We are checking the delivery status now"
    });
    assert.equal(reply.status, "ok");
    assert.equal(reply.data.message.side, "agent");
    assert.match(String(reply.data.message.createdAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(reply.data.outboundDelivery.deliveryState, "queued");
    assert.equal(reply.data.outboundDelivery.channel, "SDK");

    const empty = await conversations.appendMessage({
      conversationId: "maria",
      mode: "reply",
      text: "   "
    });
    assert.equal(empty.status, "invalid");
    assert.equal(empty.error?.code, "message_content_required");
  });

  it("atomically queues one durable Telegram CSAT survey when a dialog is closed", async () => {
    const repository = ConversationRepository.inMemory();
    await repository.saveConversation({
      channel: "Telegram",
      clientSince: "2026-07-11",
      device: "Telegram",
      entry: "Telegram",
      id: "telegram-csat-close",
      initials: "TC",
      language: "ru",
      messages: [],
      name: "Telegram client",
      phone: "111222333",
      preview: "Question resolved",
      previous: [],
      sla: "Active",
      slaTone: "ok",
      status: "active",
      tags: ["telegram", "telegram-chat:987654321"],
      tenantId: "tenant-mygig",
      time: "now",
      topic: "Support / Telegram"
    });
    const conversations = new ConversationService(repository);

    const closed = await conversations.transitionConversationStatus({
      conversationId: "telegram-csat-close",
      nextStatus: "closed",
      resolutionOutcome: "resolved"
    }, { tenantId: "tenant-mygig" });
    const replay = await conversations.transitionConversationStatus({
      conversationId: "telegram-csat-close",
      nextStatus: "closed",
      resolutionOutcome: "resolved"
    }, { tenantId: "tenant-mygig" });
    const descriptors = await repository.listOutboundDescriptors({
      conversationId: "telegram-csat-close",
      kind: "message_delivery"
    });
    const outbox = await repository.listOutboxEvents();

    assert.equal(closed.status, "ok");
    assert.equal(closed.data.conversation.status, "closed");
    assert.equal(closed.data.csatSurveyDelivery.deliveryState, "queued");
    assert.equal(replay.status, "conflict");
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0]?.idempotencyKey, "quality:csat:telegram-csat-close");
    assert.equal(descriptors[0]?.payload.providerConversationId, "987654321");
    assert.deepEqual(descriptors[0]?.payload.replyMarkup, {
      inline_keyboard: [[1, 2, 3, 4, 5].map((score) => ({
        callback_data: `quality:csat:${score}`,
        text: String(score)
      }))]
    });
    assert.equal(outbox.filter((event) => event.payload.descriptorId === descriptors[0]?.id).length, 1);
  });

  it("persists a repeat close after reopen without re-sending the CSAT survey", async () => {
    const repository = ConversationRepository.inMemory();
    await repository.saveConversation({
      channel: "Telegram",
      clientSince: "2026-07-11",
      device: "Telegram",
      entry: "Telegram",
      id: "telegram-csat-reclose",
      initials: "TC",
      language: "ru",
      messages: [],
      name: "Telegram client",
      phone: "111222333",
      preview: "Question resolved",
      previous: [],
      sla: "Active",
      slaTone: "ok",
      status: "active",
      tags: ["telegram", "telegram-chat:987654321"],
      tenantId: "tenant-mygig",
      time: "now",
      topic: "Support / Telegram"
    });
    const conversations = new ConversationService(repository);

    const closed = await conversations.transitionConversationStatus({
      conversationId: "telegram-csat-reclose",
      nextStatus: "closed",
      resolutionOutcome: "resolved"
    }, { tenantId: "tenant-mygig" });
    const reopened = await conversations.transitionConversationStatus({
      conversationId: "telegram-csat-reclose",
      nextStatus: "reopened"
    }, { tenantId: "tenant-mygig" });
    const reclosed = await conversations.transitionConversationStatus({
      conversationId: "telegram-csat-reclose",
      nextStatus: "closed",
      resolutionOutcome: "resolved"
    }, { tenantId: "tenant-mygig" });

    assert.equal(closed.status, "ok");
    assert.equal(reopened.status, "ok");
    assert.equal(reclosed.status, "ok");
    assert.equal(reclosed.data.conversation.status, "closed");
    assert.equal(reclosed.data.csatSurveyDelivery, undefined);

    const stored = await repository.findConversation("telegram-csat-reclose");
    assert.equal(stored?.status, "closed");
    assert.equal(stored?.resolutionOutcome, "resolved");

    const descriptors = await repository.listOutboundDescriptors({
      conversationId: "telegram-csat-reclose",
      kind: "message_delivery"
    });
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0]?.idempotencyKey, "quality:csat:telegram-csat-reclose");

    const lifecycle = await repository.listLifecycleEvents({
      conversationId: "telegram-csat-reclose",
      eventTypes: ["status.changed"],
      tenantId: "tenant-mygig"
    });
    const closes = lifecycle.filter((event) => event.data?.toStatus === "closed");
    assert.equal(closes.length, 2);
  });

  it("keeps the conversation mutation when an outbound reply deduplicates by idempotency key", async () => {
    const repository = ConversationRepository.inMemory();
    const conversation = await repository.findConversation("maria");
    assert.ok(conversation);

    const outboundInput = (suffix: string, status: string) => ({
      conversation: { ...conversation, status, messages: [...conversation.messages] },
      descriptor: {
        auditId: null,
        channel: conversation.channel,
        conversationId: conversation.id,
        createdAt: "2026-07-14T10:00:00.000Z",
        deliveryState: "queued",
        id: `delivery_reclose_${suffix}`,
        idempotencyKey: "quality:csat:maria",
        kind: "message_delivery" as const,
        messageId: `csat-survey:maria-${suffix}`,
        outboxEventId: null,
        payload: { conversationId: conversation.id, queue: "message-delivery", text: "survey" },
        requestFingerprint: `fingerprint_${suffix}`,
        retryable: true,
        status: "queued",
        tenantId: "tenant-volga",
        traceId: `trc_reclose_${suffix}`
      },
      lifecycleEvent: {
        actorId: null,
        actorName: null,
        actorType: "operator" as const,
        conversationId: conversation.id,
        data: { toStatus: status },
        eventType: "status.changed",
        id: `lifecycle_reclose_${suffix}`,
        ingestedAt: "2026-07-14T10:00:00.000Z",
        occurredAt: "2026-07-14T10:00:00.000Z",
        reason: null,
        schemaVersion: "conversation-lifecycle/v1" as const,
        source: "conversation-service",
        sourceEventId: `rt_reclose_${suffix}`,
        tenantId: "tenant-volga",
        traceId: `trc_reclose_${suffix}`
      },
      realtimeEvent: {
        data: { toStatus: status },
        eventId: `rt_reclose_${suffix}`,
        eventName: "conversation.updated",
        occurredAt: "2026-07-14T10:00:00.000Z",
        resourceId: conversation.id,
        resourceType: "conversation",
        schemaVersion: "v1",
        tenantId: "tenant-volga",
        traceId: `trc_reclose_${suffix}`
      }
    });

    const first = await repository.queueOutboundMessageReply(outboundInput("first", "closed"));
    const second = await repository.queueOutboundMessageReply(outboundInput("second", "closed"));

    assert.equal(first.descriptor.id, "delivery_reclose_first");
    assert.equal(second.descriptor.id, "delivery_reclose_first");
    assert.equal((await repository.listOutboundDescriptors({ conversationId: "maria" })).length, 1);
    assert.equal((await repository.findConversation("maria"))?.status, "closed");

    const lifecycle = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" });
    assert.equal(lifecycle.filter((event) => event.id.startsWith("lifecycle_reclose_")).length, 2);

    const replay = await repository.queueOutboundMessageReply(outboundInput("second", "closed"));
    assert.equal(replay.descriptor.id, "delivery_reclose_first");
    assert.equal((await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" }))
      .filter((event) => event.id.startsWith("lifecycle_reclose_")).length, 2);
  });

  it("does not queue a CSAT delivery descriptor for non-Telegram closes", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const closed = await conversations.transitionConversationStatus({
      conversationId: "maria",
      nextStatus: "closed",
      resolutionOutcome: "resolved",
      topic: "Product / Mismatch"
    });

    assert.equal(closed.status, "ok");
    assert.equal(closed.data.csatSurveyDelivery, undefined);
    assert.equal((await repository.listOutboundDescriptors({ conversationId: "maria" })).length, 0);
  });

  it("dispatches Telegram operator replies through the outbound dispatcher", async () => {
    const repository = ConversationRepository.inMemory();
    await repository.saveConversation({
      channel: "Telegram",
      clientSince: "2026-07-02",
      device: "Telegram",
      entry: "Telegram",
      id: "1210145661",
      initials: "АС",
      language: "Unknown",
      messages: [],
      name: "Александр Самойлов",
      phone: "1210145661",
      preview: "",
      previous: [],
      sla: "Active",
      slaTone: "ok",
      status: "active",
      tags: ["telegram"],
      tenantId: "tenant-mygig",
      time: "now",
      topic: "Telegram / Bot"
    });
    const dispatches: Array<Record<string, unknown>> = [];
    const conversations = new ConversationService(repository, {
      outboundMessageDispatcher: {
        async deliverMessage(request) {
          dispatches.push(request);
          return {
            providerMessageId: "tg-provider-message-1",
            status: "delivered"
          };
        }
      }
    });

    const reply = await conversations.appendMessage({
      conversationId: "1210145661",
      mode: "reply",
      text: "Ответ оператора в Telegram"
    }, {
      tenantId: "tenant-mygig"
    });

    assert.equal(reply.status, "ok");
    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0].channel, "Telegram");
    assert.equal(dispatches[0].chatId, "1210145661");
    assert.equal(dispatches[0].tenantId, "tenant-mygig");
    assert.equal(dispatches[0].text, "Ответ оператора в Telegram");
    assert.equal(reply.data.outboundDelivery.deliveryState, "delivered");
    assert.equal(reply.data.outboundDelivery.providerMessageId, "tg-provider-message-1");
  });

  it("replays outbound idempotency keys without duplicating messages or descriptors", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const firstReply = await conversations.appendMessage({
      conversationId: "maria",
      idempotencyKey: "reply-idem-001",
      mode: "reply",
      text: "Idempotent delivery reply"
    });
    const duplicateReply = await conversations.appendMessage({
      conversationId: "maria",
      idempotencyKey: "reply-idem-001",
      mode: "reply",
      text: "Idempotent delivery reply"
    });
    const conflictReply = await conversations.appendMessage({
      conversationId: "maria",
      idempotencyKey: "reply-idem-001",
      mode: "reply",
      text: "Different retry body"
    });
    const detail = await conversations.fetchDialogDetail("maria");
    const outboundDescriptors = await repository.listOutboundDescriptors({ conversationId: "maria", kind: "message_delivery" });
    const outboxEvents = await repository.listOutboxEvents();

    assert.equal(firstReply.status, "ok");
    assert.equal(duplicateReply.status, "ok");
    assert.equal(duplicateReply.data.duplicate, true);
    assert.equal(duplicateReply.data.outboundDelivery.descriptorId, firstReply.data.outboundDelivery.descriptorId);
    assert.equal(conflictReply.status, "conflict");
    assert.equal(conflictReply.error?.code, "idempotency_key_reused");
    assert.equal((detail.data.messages as Array<Record<string, unknown>>).filter((message) => message.text === "Idempotent delivery reply").length, 1);
    assert.equal(outboundDescriptors.filter((descriptor) => descriptor.idempotencyKey === "reply-idem-001").length, 1);
    assert.equal(outboxEvents.filter((event) => event.type === "message.delivery.requested").length, 1);

    const firstUpload = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "idem.pdf",
      idempotencyKey: "upload-idem-001",
      sizeBytes: 1024
    }, { tenantId: "tenant-volga" });
    const duplicateUpload = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "idem.pdf",
      idempotencyKey: "upload-idem-001",
      sizeBytes: 1024
    }, { tenantId: "tenant-volga" });
    const conflictUpload = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "different.pdf",
      idempotencyKey: "upload-idem-001",
      sizeBytes: 1024
    }, { tenantId: "tenant-volga" });

    assert.equal(duplicateUpload.data.duplicate, true);
    assert.equal(duplicateUpload.data.descriptorId, firstUpload.data.descriptorId);
    assert.equal(duplicateUpload.data.fileId, firstUpload.data.fileId);
    assert.equal(conflictUpload.status, "conflict");

    const firstOutbound = await conversations.createOutboundConversationRequest({
      channel: "Telegram",
      idempotencyKey: "outbound-idem-001",
      message: "Hello from support",
      phone: "+7 900 000-00-00",
      topic: "Delivery / Status"
    }, { tenantId: "tenant-volga" });
    const duplicateOutbound = await conversations.createOutboundConversationRequest({
      channel: "Telegram",
      idempotencyKey: "outbound-idem-001",
      message: "Hello from support",
      phone: "+7 900 000-00-00",
      topic: "Delivery / Status"
    }, { tenantId: "tenant-volga" });
    const conflictOutbound = await conversations.createOutboundConversationRequest({
      channel: "Telegram",
      idempotencyKey: "outbound-idem-001",
      message: "Different outbound body",
      phone: "+7 900 000-00-00",
      topic: "Delivery / Status"
    }, { tenantId: "tenant-volga" });

    assert.equal(duplicateOutbound.data.duplicate, true);
    assert.equal(duplicateOutbound.data.descriptorId, firstOutbound.data.descriptorId);
    assert.equal(conflictOutbound.status, "conflict");
  });

  it("passes tenant operator or service-admin tenant context into dialog writes", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/conversation/dialog.controller.ts", import.meta.url), "utf8");

    assert.match(source, /request\.tenantOperatorContext\?\.tenantId[\s\S]*request\.serviceAdminContext\?\.currentTenantId/);
    assert.match(
      source,
      /uploadAttachment\([\s\S]*conversationService\.uploadAttachment\(payload,\s*dialogContextFromRequest\(request\)\)/
    );
    assert.match(
      source,
      /createOutboundConversationRequest\([\s\S]*conversationService\.createOutboundConversationRequest\(payload,\s*dialogContextFromRequest\(request\)\)/
    );
  });

  it("fails closed for tenant-owned conversation writes without tenant context", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const upload = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "tenantless.pdf",
      sizeBytes: 2048
    });
    const outbound = await conversations.createOutboundConversationRequest({
      channel: "SDK",
      message: "Tenantless outbound",
      phone: "+7 900 000-00-00",
      topic: "Delivery / Status"
    });
    const receipt = await conversations.recordDeliveryReceipt("telegram", {
      conversationId: "maria",
      messageId: "msg_tenantless_receipt",
      provider: "telegram-bot-api",
      providerEventId: "tg-tenantless-receipt",
      status: "delivered"
    });

    assert.equal(upload.status, "invalid");
    assert.equal(upload.error?.code, "tenant_context_required");
    assert.equal(outbound.status, "invalid");
    assert.equal(outbound.error?.code, "tenant_context_required");
    assert.equal(receipt.status, "invalid");
    assert.equal(receipt.error?.code, "tenant_context_required");
    assert.deepEqual(await repository.listOutboundDescriptors(), []);
    assert.deepEqual(await repository.listDeliveryReceipts(), []);
  });

  it("persists outbound conversation requests into the dialog read model", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const outbound = await conversations.createOutboundConversationRequest({
      channel: "SDK",
      clientName: "Runtime Outbound Client",
      idempotencyKey: "outbound-dialog-read-model-001",
      message: "Hello from the persisted outbound dialog.",
      phone: "+7 900 300-00-01",
      topic: "Delivery / Status"
    }, { tenantId: "tenant-volga" });

    assert.equal(outbound.status, "ok");
    assert.equal(outbound.data.conversationId, outbound.data.descriptorId);
    assert.match(String(outbound.data.auditId), /^evt_outbound_/);

    const dialogs = await conversations.fetchDialogs({
      page: 1,
      pageSize: 10,
      query: "Runtime Outbound Client"
    }, { tenantId: "tenant-volga" });
    assert.equal(dialogs.data.items.length, 1);
    assert.equal(dialogs.data.items[0].id, outbound.data.conversationId);
    assert.equal(dialogs.data.items[0].status, "queued");
    assert.equal(dialogs.data.items[0].topic, "Delivery / Status");

    const detail = await conversations.fetchDialogDetail(String(outbound.data.conversationId), { tenantId: "tenant-volga" });
    assert.equal(detail.status, "ok");
    assert.equal(detail.data.conversation.id, outbound.data.conversationId);
    assert.match(JSON.stringify(detail.data.messages), new RegExp(String(outbound.data.auditId)));

    const descriptors = await repository.listOutboundDescriptors({
      idempotencyKey: "outbound-dialog-read-model-001",
      kind: "outbound_conversation",
      tenantId: "tenant-volga"
    });
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].conversationId, outbound.data.conversationId);
  });

  it("creates upload and outbound descriptors matching the current dialog adapter", async () => {
    const repository = ConversationRepository.default();
    const conversations = new ConversationService(repository);

    const missingUploadChannel = await conversations.uploadAttachment({
      channel: " ",
      fileName: "invoice.pdf",
      sizeBytes: 2048
    });
    const missingUploadFileName = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: " ",
      sizeBytes: 2048
    });
    const malformedUploadSize = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "invoice.pdf",
      sizeBytes: Number.NaN
    });

    assert.equal(missingUploadChannel.status, "invalid");
    assert.equal(missingUploadChannel.error?.code, "attachment_payload_required");
    assert.equal(missingUploadFileName.status, "invalid");
    assert.equal(missingUploadFileName.error?.code, "attachment_payload_required");
    assert.equal(malformedUploadSize.status, "invalid");
    assert.equal(malformedUploadSize.error?.code, "attachment_size_invalid");

    const upload = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "invoice.pdf",
      sizeBytes: 2048
    }, { tenantId: "tenant-volga" });
    assert.equal(upload.status, "ok");
    assert.equal(upload.data.storageState, "upload_queued");
    assert.equal(upload.data.antivirusState, "scan_pending");
    assert.equal(upload.data.deliveryState, "not_sent");
    assert.deepEqual(upload.data.uploadPolicy, {
      deliveryState: "not_sent",
      queue: "file-scan",
      retryable: true,
      scanState: "scan_pending",
      storageState: "upload_queued"
    });
    assert.match(upload.data.auditId, /^evt_attachment_/);
    assert.match(String(upload.data.fileId), /^attachment_/);
    assert.equal(upload.data.fileId, upload.data.id);

    const uploadDescriptors = await repository.listOutboundDescriptors({ kind: "attachment_upload" });
    const uploadDescriptor = uploadDescriptors.find((descriptor) => descriptor.id === upload.data.descriptorId);
    assert.equal(uploadDescriptor?.payload.fileId, upload.data.fileId);
    const uploadOutbox = await repository.listOutboxEvents();
    assert.equal(upload.data.outboxEventId, null);
    assert.equal(uploadOutbox.some((event) => event.payload.fileId === upload.data.fileId), false);

    const missingOutboundTopic = await conversations.createOutboundConversationRequest({
      channel: "Telegram",
      message: "Hello from support",
      phone: "+7 900 000-00-00",
      topic: " "
    });
    assert.equal(missingOutboundTopic.status, "invalid");
    assert.equal(missingOutboundTopic.error?.code, "topic_required");

    const outbound = await conversations.createOutboundConversationRequest({
      channel: "Telegram",
      clientName: "New Client",
      message: "Hello from support",
      phone: "+7 900 000-00-00",
      topic: "Delivery / Status"
    }, { tenantId: "tenant-volga" });
    assert.equal(outbound.status, "ok");
    assert.equal(outbound.data.status, "queued");
    assert.equal(outbound.data.consentCheck, "required_before_send");
    assert.match(outbound.data.backendQueueId, /^outbound_/);
    assert.equal(outbound.data.conversationId, outbound.data.descriptorId);
  });

  it("creates real workspace file state and safe scanner file access for attachment uploads", async () => {
    const conversationRepository = ConversationRepository.inMemory();
    const workspaceRepository = WorkspaceRepository.inMemory();
    const conversations = new ConversationService(conversationRepository, {
      attachmentStorage: {
        objectStorage: createDeterministicObjectStorageSigner({
          metadata: () => ({ checksum: "sha256-dialog-upload", sizeBytes: 4096 }),
          now: () => new Date("2026-07-09T08:00:00.000Z")
        }),
        workspaceRepository
      }
    });

    const upload = await conversations.uploadAttachment({
      channel: "SDK",
      fileName: "signed-scanner.pdf",
      idempotencyKey: "attachment-upload-signed-scanner",
      sizeBytes: 4096
    }, { tenantId: "tenant-volga" });

    assert.equal(upload.status, "ok");
    assert.equal(upload.data.objectKeyExposed, false);
    assert.deepEqual(upload.data.signedUpload, {
      expiresAt: "2026-07-09T08:15:00.000Z",
      method: "PUT",
      url: `https://storage.example.test/upload/${upload.data.fileId}`
    });

    const storedFile = await workspaceRepository.findFile(String(upload.data.fileId), { tenantId: "tenant-volga" });
    assert.equal(storedFile?.fileName, "signed-scanner.pdf");
    assert.equal(storedFile?.storageState, "upload_descriptor_ready");
    assert.equal(storedFile?.scanState, "pending");

    const [descriptor] = await conversationRepository.listOutboundDescriptors({ kind: "attachment_upload" });
    assert.equal(descriptor?.payload.fileId, upload.data.fileId);
    assert.equal(descriptor?.payload.mimeType, "application/octet-stream");
    assert.deepEqual(descriptor?.payload.signedFile, {
      expiresAt: "2026-07-09T08:15:00.000Z",
      method: "GET",
      url: `https://storage.example.test/download/${upload.data.fileId}`
    });
    assert.equal(JSON.stringify(descriptor?.payload).includes("objectKey"), false);
    assert.equal((await conversationRepository.listOutboxEvents()).some((event) => event.payload.fileId === upload.data.fileId), false);

    const finalized = await conversations.finalizeAttachmentUpload({
      checksum: "sha256-dialog-upload",
      fileId: String(upload.data.fileId)
    }, { tenantId: "tenant-volga" });

    assert.equal(finalized.status, "ok");
    assert.equal(finalized.data.fileId, upload.data.fileId);
    assert.equal(finalized.data.storageState, "uploaded");
    assert.equal(finalized.data.antivirusState, "scan_pending");
    assert.equal(finalized.data.objectKeyExposed, false);
    assert.equal(JSON.stringify(finalized).includes(String(storedFile?.objectKey)), false);
    const scanEvents = (await conversationRepository.listOutboxEvents()).filter((event) => event.payload.fileId === upload.data.fileId);
    assert.equal(scanEvents.length, 1);
    assert.equal(scanEvents[0]?.type, "attachment.upload.requested");

    const finalizedFile = await workspaceRepository.findFile(String(upload.data.fileId), { tenantId: "tenant-volga" });
    assert.equal(finalizedFile?.storageState, "uploaded");
    assert.equal(finalizedFile?.scanState, "scan_pending");

    await workspaceRepository.updateFileScanResult(String(upload.data.fileId), {
      scanCheckedAt: "2026-07-09T08:01:00.000Z",
      scanState: "scan_clean",
      scanVerdict: "clean",
      scanner: "contract-scanner"
    });
    const cleanStatus = await conversations.fetchAttachmentUploadStatus(String(upload.data.fileId), { tenantId: "tenant-volga" });

    assert.equal(cleanStatus.status, "ok");
    assert.equal(cleanStatus.data.storageState, "uploaded");
    assert.equal(cleanStatus.data.antivirusState, "scan_clean");
    assert.equal(cleanStatus.data.deliveryState, "ready");
    assert.deepEqual(cleanStatus.data.downloadPolicy, {
      permissionRequired: "files.read",
      signedUrlAvailable: true
    });
    assert.equal(JSON.stringify(cleanStatus).includes(String(finalizedFile?.objectKey)), false);
  });

  it("exposes dialog attachment finalize and status routes with tenant context", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/conversation/dialog.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@Post\("attachments\/:fileId\/finalize"\)[\s\S]*conversationService\.finalizeAttachmentUpload\(\{\s*\.\.\.payload,\s*fileId\s*\},\s*dialogContextFromRequest\(request\)\)/);
    assert.match(source, /@Get\("attachments\/:fileId\/status"\)[\s\S]*conversationService\.fetchAttachmentUploadStatus\(fileId,\s*dialogContextFromRequest\(request\)\)/);
  });

  it("normalizes inbound channel events idempotently and exposes realtime event feed", async () => {
    const conversations = new ConversationService();

    const first = await conversations.normalizeInboundEvent("telegram", {
      eventId: "tg-event-001",
      conversationId: "dmitry",
      text: "Updated address is ready"
    });
    assert.equal(first.status, "ok");
    assert.equal(first.data.duplicate, false);
    assert.equal(first.data.message.side, "client");
    assert.match(String(first.data.message.createdAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(first.data.realtimeEvent.eventName, "message.created");

    const duplicate = await conversations.normalizeInboundEvent("telegram", {
      eventId: "tg-event-001",
      conversationId: "dmitry",
      text: "Updated address is ready"
    });
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.message, null);

    const sameIdDifferentChannel = await conversations.normalizeInboundEvent("vk", {
      eventId: "tg-event-001",
      conversationId: "alexey",
      text: "Same upstream id from another connector"
    });
    assert.equal(sameIdDifferentChannel.status, "ok");
    assert.equal(sameIdDifferentChannel.data.duplicate, false);
    assert.equal(sameIdDifferentChannel.data.message.side, "client");

    const attachmentOnly = await conversations.normalizeInboundEvent("max", {
      attachments: [{ providerAttachmentId: "max-image-001", type: "image" }],
      eventId: "max-event-attachment-001",
      conversationId: "alexey"
    });
    assert.equal(attachmentOnly.status, "ok");
    assert.equal(attachmentOnly.data.message.text, "Attachment received");
    assert.deepEqual(attachmentOnly.data.message.attachments, [{ providerAttachmentId: "max-image-001", type: "image" }]);

    const events = await conversations.fetchRealtimeEvents({ since: "now-5m" });
    assert.equal(events.status, "ok");
    assert.ok(events.data.events.some((event) => event.eventName === "message.created"));
    assert.ok(events.data.events.every((event) => event.traceId));
  });

  it("publishes persisted realtime events through the configured fan-out adapter", async () => {
    const fanout = new RecordingRealtimeFanoutAdapter();
    const conversations = new ConversationService(ConversationRepository.inMemory(), { realtimeFanout: fanout });

    const first = await conversations.normalizeInboundEvent("telegram", {
      eventId: "tg-fanout-runtime-001",
      conversationId: "dmitry",
      text: "Fan-out runtime update"
    });

    assert.equal(first.status, "ok");
    assert.deepEqual(fanout.published.map((event) => event.eventId), [first.data.realtimeEvent.eventId]);
    assert.equal(fanout.published[0].eventName, "message.created");
  });

  it("publishes appended internal notes and replies through the configured fan-out adapter", async () => {
    const fanout = new RecordingRealtimeFanoutAdapter();
    const conversations = new ConversationService(ConversationRepository.inMemory(), { realtimeFanout: fanout });

    const internal = await conversations.appendMessage({
      conversationId: "maria",
      mode: "internal",
      text: "Publish internal note over Redis"
    });
    const reply = await conversations.appendMessage({
      conversationId: "maria",
      mode: "reply",
      text: "Publish reply over Redis"
    });

    assert.equal(internal.status, "ok");
    assert.equal(reply.status, "ok");
    assert.deepEqual(fanout.published.map((event) => event.eventId), [
      internal.data.realtimeEvent.eventId,
      reply.data.realtimeEvent.eventId
    ]);
    assert.deepEqual(fanout.published.map((event) => event.eventName), ["conversation.updated", "message.created"]);
  });

  it("keeps persisted realtime writes available when fan-out publish fails", async () => {
    const fanout = new FailingRealtimeFanoutAdapter();
    const conversations = new ConversationService(ConversationRepository.inMemory(), { realtimeFanout: fanout });

    const inbound = await conversations.normalizeInboundEvent("telegram", {
      eventId: "tg-fanout-failure-001",
      conversationId: "dmitry",
      text: "Fan-out should not block persisted replay"
    });
    const replay = await conversations.fetchRealtimeEvents({ since: "now-5m" });

    assert.equal(inbound.status, "ok");
    assert.equal(fanout.publishAttempts, 1);
    assert.ok(replay.data.events.some((event) => event.eventId === inbound.data.realtimeEvent.eventId));
  });

  it("merges multi-instance realtime replay and live fanout events in cursor order", async () => {
    const repository = ConversationRepository.inMemory();
    const fanout = new DeterministicLiveRealtimeFanoutAdapter();
    const firstInstance = new ConversationService(repository, { realtimeFanout: fanout });
    const secondInstance = new ConversationService(repository, { realtimeFanout: fanout });
    const RealDate = Date;
    const fixedNow = new RealDate("2026-06-29T10:00:00.000Z");
    let firstPersistedAndLive!: RealtimeFanoutEvent;
    let secondPersistedAndLive!: RealtimeFanoutEvent;

    globalThis.Date = class extends RealDate {
      constructor(value?: string | number | Date) {
        super(value ?? fixedNow);
      }

      static now(): number {
        return fixedNow.getTime();
      }
    } as DateConstructor;

    try {
      const first = await firstInstance.normalizeInboundEvent("telegram", {
        conversationId: "dmitry",
        eventId: "tg-multi-instance-realtime-001",
        text: "First instance persisted and published this event"
      });
      const second = await secondInstance.appendMessage({
        conversationId: "maria",
        mode: "reply",
        text: "Second instance persisted and published this event"
      });

      assert.equal(first.status, "ok");
      assert.equal(second.status, "ok");
      firstPersistedAndLive = first.data.realtimeEvent;
      secondPersistedAndLive = second.data.realtimeEvent;
    } finally {
      globalThis.Date = RealDate;
    }

    const liveOnlyFromSecondInstance = realtimeFanoutEventFixture({
      data: { instance: "second", liveOnly: true },
      eventId: "rt_multi_instance_live_only",
      occurredAt: fixedNow.toISOString(),
      traceId: "trace-multi-instance-live-only"
    });
    await fanout.publish(liveOnlyFromSecondInstance);

    const expectedEvents = canonicalUniqueRealtimeEvents([
      firstPersistedAndLive,
      secondPersistedAndLive,
      ...fanout.published
    ]);
    const mergedReplayAndLive = await firstInstance.fetchRealtimeEvents();

    assert.deepEqual(
      mergedReplayAndLive.data.events.map((event) => event.eventId),
      expectedEvents.map((event) => event.eventId)
    );
    assert.equal(
      new Set(mergedReplayAndLive.data.events.map((event) => event.eventId)).size,
      mergedReplayAndLive.data.events.length
    );

    const cursor = expectedEvents[0];
    const afterCursor = await secondInstance.fetchRealtimeEvents({ since: cursor.eventId });

    assert.deepEqual(
      afterCursor.data.events.map((event) => event.eventId),
      expectedEvents.slice(1).map((event) => event.eventId)
    );
  });

  it("streams merged realtime replay and live fanout events through SSE after Last-Event-ID", async () => {
    const repository = ConversationRepository.inMemory();
    const fanout = new DeterministicLiveRealtimeFanoutAdapter();
    const conversations = new ConversationService(repository, { realtimeFanout: fanout });
    const first = await conversations.normalizeInboundEvent("telegram", {
      conversationId: "dmitry",
      eventId: "tg-sse-merge-001",
      text: "SSE cursor baseline"
    });
    const liveOnly = realtimeFanoutEventFixture({
      data: { liveOnly: true, transport: "sse" },
      eventId: "rt_sse_live_only",
      occurredAt: new Date(Date.parse(first.data.realtimeEvent.occurredAt) + 1).toISOString(),
      traceId: "trace-sse-live-only"
    });
    await fanout.publish(liveOnly);

    const messages = await lastValueFrom(createRealtimeSseStream(conversations, {}, first.data.realtimeEvent.eventId).pipe(toArray()));

    assert.deepEqual(messages.map((message) => message.id), ["rt_sse_live_only"]);
    assert.deepEqual(messages.map((message) => message.type), ["message.created"]);
    assert.deepEqual(messages.map((message) => (message.data as RealtimeFanoutEvent).eventId), ["rt_sse_live_only"]);
  });

  it("can emit an SSE stream handshake without assigning a realtime cursor", async () => {
    const conversations = new ConversationService(ConversationRepository.inMemory());

    const messages = await lastValueFrom(createRealtimeSseStream(
      conversations,
      {},
      undefined,
      { includeHandshake: true }
    ).pipe(toArray()));

    assert.deepEqual(messages, [{
      data: {
        ready: true,
        transport: "sse"
      },
      id: "",
      type: "stream.ready"
    }]);
  });

  it("writes merged realtime replay and live fanout events through WebSocket after Last-Event-ID", async () => {
    const repository = ConversationRepository.inMemory();
    const fanout = new DeterministicLiveRealtimeFanoutAdapter();
    const conversations = new ConversationService(repository, { realtimeFanout: fanout });
    const first = await conversations.normalizeInboundEvent("telegram", {
      conversationId: "dmitry",
      eventId: "tg-ws-merge-001",
      text: "WebSocket cursor baseline"
    });
    const liveOnly = realtimeFanoutEventFixture({
      data: { liveOnly: true, transport: "websocket" },
      eventId: "rt_ws_live_only",
      occurredAt: new Date(Date.parse(first.data.realtimeEvent.occurredAt) + 1).toISOString(),
      traceId: "trace-ws-live-only"
    });
    const socket = new FakeWebSocketReplaySocket();

    await fanout.publish(liveOnly);
    await writeRealtimeWebSocketReplay(conversations, socket, first.data.realtimeEvent.eventId);

    const messages = decodeWebSocketTextFrames(socket.writes).map((message) => JSON.parse(message) as RealtimeFanoutEvent);
    assert.deepEqual(messages.map((message) => message.eventId), ["rt_ws_live_only"]);
    assert.equal(socket.ended, true);
  });

  it("prefers Last-Event-ID over query since when streaming merged SSE events", async () => {
    const repository = ConversationRepository.inMemory();
    const fanout = new DeterministicLiveRealtimeFanoutAdapter();
    const conversations = new ConversationService(repository, { realtimeFanout: fanout });
    const first = await conversations.normalizeInboundEvent("telegram", {
      conversationId: "dmitry",
      eventId: "tg-sse-precedence-001",
      text: "SSE query cursor baseline"
    });
    const second = await conversations.normalizeInboundEvent("telegram", {
      conversationId: "dmitry",
      eventId: "tg-sse-precedence-002",
      text: "SSE Last-Event-ID baseline"
    });
    const liveOnly = realtimeFanoutEventFixture({
      data: { liveOnly: true, transport: "sse" },
      eventId: "rt_sse_precedence_live_only",
      occurredAt: new Date(Date.parse(second.data.realtimeEvent.occurredAt) + 1).toISOString(),
      traceId: "trace-sse-precedence-live-only"
    });
    await fanout.publish(liveOnly);

    const messages = await lastValueFrom(createRealtimeSseStream(
      conversations,
      { since: first.data.realtimeEvent.eventId },
      second.data.realtimeEvent.eventId
    ).pipe(toArray()));

    assert.deepEqual(messages.map((message) => message.id), ["rt_sse_precedence_live_only"]);
  });

  it("orders persisted and live realtime events with identical timestamps by event id", async () => {
    const repository = ConversationRepository.inMemory();
    const fanout = new DeterministicLiveRealtimeFanoutAdapter();
    const conversations = new ConversationService(repository, { realtimeFanout: fanout });
    await repository.appendRealtimeEvent(realtimeFanoutEventFixture({
      data: { source: "persisted" },
      eventId: "rt_same_timestamp_b",
      occurredAt: "2026-06-29T10:30:00.000Z",
      traceId: "trace-same-timestamp-b"
    }));
    await fanout.publish(realtimeFanoutEventFixture({
      data: { source: "live" },
      eventId: "rt_same_timestamp_a",
      occurredAt: "2026-06-29T10:30:00.000Z",
      traceId: "trace-same-timestamp-a"
    }));

    const events = await conversations.fetchRealtimeEvents();

    assert.deepEqual(
      events.data.events
        .filter((event) => event.eventId.startsWith("rt_same_timestamp_"))
        .map((event) => event.eventId),
      ["rt_same_timestamp_a", "rt_same_timestamp_b"]
    );
  });

  it("deduplicates repeated live realtime events before cursor filtering", async () => {
    const repository = ConversationRepository.inMemory();
    const fanout = new DeterministicLiveRealtimeFanoutAdapter();
    const conversations = new ConversationService(repository, { realtimeFanout: fanout });
    const duplicate = realtimeFanoutEventFixture({
      data: { source: "live" },
      eventId: "rt_duplicate_live_event",
      occurredAt: "2026-06-29T10:40:00.000Z",
      traceId: "trace-duplicate-live-event"
    });
    const afterDuplicate = realtimeFanoutEventFixture({
      data: { source: "after-duplicate" },
      eventId: "rt_duplicate_live_event_after",
      occurredAt: "2026-06-29T10:41:00.000Z",
      traceId: "trace-duplicate-live-event-after"
    });
    await fanout.publish(duplicate);
    await fanout.publish({ ...duplicate, data: { source: "duplicate-live-delivery" } });
    await fanout.publish(afterDuplicate);

    const events = await conversations.fetchRealtimeEvents();
    const afterCursor = await conversations.fetchRealtimeEvents({ since: duplicate.eventId });

    assert.deepEqual(
      events.data.events
        .filter((event) => event.eventId === "rt_duplicate_live_event")
        .map((event) => event.data.source),
      ["live"]
    );
    assert.deepEqual(
      afterCursor.data.events
        .filter((event) => event.eventId.startsWith("rt_duplicate_live_event"))
        .map((event) => event.eventId),
      ["rt_duplicate_live_event_after"]
    );
  });

  it("records delivery receipts as message delivery realtime updates", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const receipt = await conversations.recordDeliveryReceipt("telegram", {
      conversationId: "maria",
      messageId: "msg_delivery_runtime_001",
      payload: { providerStatus: "delivered" },
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-runtime-001",
      status: "delivered",
      tenantId: "tenant-volga"
    });
    const receipts = await repository.listDeliveryReceipts({
      channel: "telegram",
      messageId: "msg_delivery_runtime_001",
      tenantId: "tenant-volga"
    });
    const realtime = await conversations.fetchRealtimeEvents({ since: "now-5m" });
    const deliveryEvent = realtime.data.events.find((event) => event.eventName === "message.delivery.updated");

    assert.equal(receipt.status, "ok");
    assert.equal(receipt.service, "channelService");
    assert.equal(receipt.operation, "recordDeliveryReceipt");
    assert.equal(receipt.data.receipt.providerEventId, "tg-delivery-runtime-001");
    assert.equal(receipt.data.receipt.status, "delivered");
    assert.equal(receipt.data.realtimeEvent.eventName, "message.delivery.updated");
    assert.equal(receipts.length, 1);
    assert.ok(deliveryEvent);
    assert.equal(deliveryEvent.resourceId, "maria");
    assert.equal(deliveryEvent.data.messageId, "msg_delivery_runtime_001");
    assert.equal(deliveryEvent.data.provider, "telegram-bot-api");
    assert.equal(deliveryEvent.data.providerEventId, "tg-delivery-runtime-001");
    assert.equal(deliveryEvent.data.status, "delivered");
  });

  it("replays duplicate delivery receipts without duplicating realtime updates", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const first = await conversations.recordDeliveryReceipt("telegram", {
      conversationId: "maria",
      messageId: "msg_delivery_replay_001",
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-replay-001",
      status: "delivered",
      tenantId: "tenant-volga"
    });
    const replay = await conversations.recordDeliveryReceipt("telegram", {
      conversationId: "maria",
      messageId: "msg_delivery_replay_ignored",
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-replay-001",
      status: "failed",
      tenantId: "tenant-volga"
    });
    const realtime = await conversations.fetchRealtimeEvents({ since: "now-5m" });
    const deliveryEvents = realtime.data.events.filter((event) => event.eventName === "message.delivery.updated");

    assert.equal(first.status, "ok");
    assert.equal(first.data.duplicate, false);
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.duplicate, true);
    assert.equal(replay.data.receipt.id, first.data.receipt.id);
    assert.equal(replay.data.receipt.messageId, "msg_delivery_replay_001");
    assert.equal(replay.data.realtimeEvent, null);
    assert.equal(deliveryEvents.length, 1);
    assert.equal(deliveryEvents[0].data.messageId, "msg_delivery_replay_001");
    assert.equal(deliveryEvents[0].data.status, "delivered");
  });

  it("replays existing delivery receipts before validating replay body fields", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const first = await conversations.recordDeliveryReceipt("telegram", {
      conversationId: "maria",
      messageId: "msg_delivery_malformed_replay_001",
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-malformed-replay-001",
      status: "delivered",
      tenantId: "tenant-volga"
    });
    const replay = await conversations.recordDeliveryReceipt("telegram", {
      conversationId: "missing-conversation",
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-malformed-replay-001",
      tenantId: "tenant-volga"
    });
    const realtime = await conversations.fetchRealtimeEvents({ since: "now-5m" });
    const deliveryEvents = realtime.data.events.filter((event) => event.eventName === "message.delivery.updated");

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.duplicate, true);
    assert.equal(replay.data.receipt.id, first.data.receipt.id);
    assert.equal(replay.data.receipt.messageId, "msg_delivery_malformed_replay_001");
    assert.equal(replay.data.realtimeEvent, null);
    assert.equal(deliveryEvents.length, 1);
  });

  it("does not emit realtime when repository receipt insert races with an existing provider event", async () => {
    const baseRepository = ConversationRepository.inMemory();
    const conversations = new ConversationService(baseRepository);

    const existing = await baseRepository.recordDeliveryReceipt({
      channel: "telegram",
      conversationId: "maria",
      id: "receipt_race_existing_001",
      idempotencyKey: "telegram-bot-api:tg-delivery-race-001",
      messageId: "msg_delivery_race_existing_001",
      payload: null,
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-race-001",
      receivedAt: "2026-06-29T11:00:00.000Z",
      status: "delivered",
      tenantId: "tenant-volga",
      traceId: "trace-receipt-race-existing"
    });
    const racingRepository = {
      appendRealtimeEvent: baseRepository.appendRealtimeEvent.bind(baseRepository),
      findConversation: baseRepository.findConversation.bind(baseRepository),
      findInboundEvent: baseRepository.findInboundEvent.bind(baseRepository),
      findOutboundDescriptorByIdempotencyKey: baseRepository.findOutboundDescriptorByIdempotencyKey.bind(baseRepository),
      listConversations: baseRepository.listConversations.bind(baseRepository),
      listDeliveryReceipts: async () => [],
      listOutboundDescriptors: baseRepository.listOutboundDescriptors.bind(baseRepository),
      listOutboxEvents: baseRepository.listOutboxEvents.bind(baseRepository),
      listRealtimeEvents: baseRepository.listRealtimeEvents.bind(baseRepository),
      queueOutboundMessageReply: baseRepository.queueOutboundMessageReply.bind(baseRepository),
      recordDeliveryReceipt: async () => existing,
      recordInboundEvent: baseRepository.recordInboundEvent.bind(baseRepository),
      recordOutboundDescriptor: baseRepository.recordOutboundDescriptor.bind(baseRepository),
      saveConversation: baseRepository.saveConversation.bind(baseRepository)
    } as unknown as RuntimeConversationRepository;
    const racingConversations = new ConversationService(racingRepository);

    const replay = await racingConversations.recordDeliveryReceipt("telegram", {
      conversationId: "maria",
      messageId: "msg_delivery_race_new_body",
      provider: "telegram-bot-api",
      providerEventId: "tg-delivery-race-001",
      status: "failed",
      tenantId: "tenant-volga"
    });
    const realtime = await conversations.fetchRealtimeEvents({ since: "now-5m" });
    const deliveryEvents = realtime.data.events.filter((event) => event.eventName === "message.delivery.updated");

    assert.equal(replay.status, "ok");
    assert.equal(replay.data.duplicate, true);
    assert.equal(replay.data.receipt.id, "receipt_race_existing_001");
    assert.equal(replay.data.realtimeEvent, null);
    assert.equal(deliveryEvents.length, 0);
  });

  it("replays realtime events after timestamp or event-id cursors", async () => {
    const conversations = new ConversationService(ConversationRepository.inMemory());
    const RealDate = Date;
    const fixedNow = new RealDate("2026-06-28T13:00:00.000Z");

    globalThis.Date = class extends RealDate {
      constructor(value?: string | number | Date) {
        super(value ?? fixedNow);
      }

      static now(): number {
        return fixedNow.getTime();
      }
    } as DateConstructor;

    let first: Awaited<ReturnType<ConversationService["normalizeInboundEvent"]>>;
    let second: Awaited<ReturnType<ConversationService["normalizeInboundEvent"]>>;

    try {
      first = await conversations.normalizeInboundEvent("telegram", {
        eventId: "tg-cursor-001",
        conversationId: "dmitry",
        text: "Cursor baseline event"
      });
      second = await conversations.normalizeInboundEvent("telegram", {
        eventId: "tg-cursor-002",
        conversationId: "dmitry",
        text: "Cursor replay event"
      });
    } finally {
      globalThis.Date = RealDate;
    }

    const afterTimestamp = await conversations.fetchRealtimeEvents({ since: first.data.realtimeEvent.occurredAt });
    const afterEventId = await conversations.fetchRealtimeEvents({ since: first.data.realtimeEvent.eventId });

    assert.ok(
      Date.parse(second.data.realtimeEvent.occurredAt) > Date.parse(first.data.realtimeEvent.occurredAt),
      "service-generated realtime events must be monotonic for timestamp cursor replay"
    );
    assert.deepEqual(afterTimestamp.data.events.map((event) => event.eventId), [second.data.realtimeEvent.eventId]);
    assert.deepEqual(afterEventId.data.events.map((event) => event.eventId), [second.data.realtimeEvent.eventId]);

    const repository = ConversationRepository.inMemory();
    await repository.appendRealtimeEvent({
      data: { order: "second" },
      eventId: "rt_same_ms_b",
      eventName: "message.created",
      occurredAt: "2026-06-28T12:45:00.000Z",
      resourceId: "dmitry",
      resourceType: "conversation",
      schemaVersion: "v1",
      tenantId: "tenant-volga",
      traceId: "trc_same_ms_b"
    });
    await repository.appendRealtimeEvent({
      data: { order: "first" },
      eventId: "rt_same_ms_a",
      eventName: "message.created",
      occurredAt: "2026-06-28T12:45:00.000Z",
      resourceId: "dmitry",
      resourceType: "conversation",
      schemaVersion: "v1",
      tenantId: "tenant-volga",
      traceId: "trc_same_ms_a"
    });
    const sameMillisecond = await new ConversationService(repository).fetchRealtimeEvents({ since: "rt_same_ms_a" });

    assert.deepEqual(sameMillisecond.data.events.map((event) => event.eventId), ["rt_same_ms_b"]);
  });
});

class RecordingRealtimeFanoutAdapter implements RealtimeFanoutAdapter {
  readonly published: RealtimeFanoutEvent[] = [];

  async publish(event: RealtimeFanoutEvent): Promise<{ channel: string; status: "published"; subscribers: number }> {
    this.published.push(event);
    return {
      channel: "test:realtime",
      status: "published",
      subscribers: 1
    };
  }

  async subscribe(): Promise<{ close(): Promise<void>; status: "disabled" }> {
    return {
      async close(): Promise<void> {},
      status: "disabled"
    };
  }
}

class DeterministicLiveRealtimeFanoutAdapter implements RealtimeFanoutAdapter {
  readonly published: RealtimeFanoutEvent[] = [];
  private readonly subscribers = new Set<(event: RealtimeFanoutEvent) => void | Promise<void>>();

  async publish(event: RealtimeFanoutEvent): Promise<{ channel: string; status: "published"; subscribers: number }> {
    this.published.push(event);
    await Promise.all([...this.subscribers].map((subscriber) => subscriber(event)));

    return {
      channel: "test:realtime",
      status: "published",
      subscribers: this.subscribers.size
    };
  }

  async subscribe(handler: (event: RealtimeFanoutEvent) => void | Promise<void>): Promise<{ close(): Promise<void>; status: "active" }> {
    for (const event of this.published) {
      await handler(event);
    }
    this.subscribers.add(handler);

    return {
      async close(): Promise<void> {
        this.subscribers.delete(handler);
      },
      status: "active"
    };
  }
}

class FailingRealtimeFanoutAdapter implements RealtimeFanoutAdapter {
  publishAttempts = 0;

  async publish(): Promise<never> {
    this.publishAttempts += 1;
    throw new Error("redis_publish_failed");
  }

  async subscribe(): Promise<{ close(): Promise<void>; status: "disabled" }> {
    return {
      async close(): Promise<void> {},
      status: "disabled"
    };
  }
}

class FakeWebSocketReplaySocket {
  destroyed = false;
  ended = false;
  readonly writes: Buffer[] = [];

  write(value: Buffer | string): boolean {
    this.writes.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

function realtimeFanoutEventFixture(input: Pick<RealtimeFanoutEvent, "eventId" | "occurredAt"> & Partial<RealtimeFanoutEvent>): RealtimeFanoutEvent {
  return {
    data: {},
    eventName: "message.created",
    resourceId: "maria",
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: "tenant-volga",
    traceId: `trace-${input.eventId}`,
    ...input
  };
}

function canonicalUniqueRealtimeEvents(events: RealtimeFanoutEvent[]): RealtimeFanoutEvent[] {
  const byEventId = new Map<string, RealtimeFanoutEvent>();

  for (const event of [...events].sort(compareRealtimeFanoutEvents)) {
    if (!byEventId.has(event.eventId)) {
      byEventId.set(event.eventId, event);
    }
  }

  return [...byEventId.values()];
}

function compareRealtimeFanoutEvents(left: RealtimeFanoutEvent, right: RealtimeFanoutEvent): number {
  const occurredAtComparison = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
  return occurredAtComparison === 0
    ? left.eventId.localeCompare(right.eventId)
    : occurredAtComparison;
}

function decodeWebSocketTextFrames(frames: Buffer[]): string[] {
  const messages: string[] = [];
  for (const frame of frames) {
    const opcode = frame[0] & 0x0f;
    if (opcode === 0x08) {
      continue;
    }

    assert.equal(opcode, 0x01);
    let length = frame[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      length = frame.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      length = Number(frame.readBigUInt64BE(offset));
      offset += 8;
    }

    messages.push(frame.subarray(offset, offset + length).toString("utf8"));
  }

  return messages;
}
