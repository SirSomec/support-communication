import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOutboxEvent } from "@support-communication/events";
import { configureConversationRepository } from "../apps/api-gateway/src/conversation/bootstrap.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";

describe("Prisma-backed conversation repository contracts", () => {
  it("maps Prisma conversation rows with ordered messages to frontend dialog records", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });

    const conversations = await repository.listConversations();
    const detail = await repository.findConversation("maria");

    assert.equal(conversations.length, 1);
    assert.equal(detail?.id, "maria");
    assert.equal(detail?.name, "Maria K.");
    assert.equal(detail?.messages.length, 2);
    assert.equal(detail?.messages[0].text, "Where is my order?");
    assert.equal(detail?.messages[0].createdAt, "2026-06-28T10:00:00.000Z");
    assert.equal(detail?.messages[1].type, "internal");
    assert.deepEqual(client.calls.conversationFindMany, [{
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" }
    }]);
    assert.deepEqual(client.calls.conversationFindUnique, [{
      include: { messages: { orderBy: { createdAt: "asc" } } },
      where: { id: "maria" }
    }]);
  });

  it("saves conversation records and replaces message rows in one Prisma transaction", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });
    const conversation = await repository.findConversation("maria");
    assert.ok(conversation);

    conversation.status = "closed";
    conversation.topic = "Delivery / Status";
    conversation.messages.push({
      id: "msg_agent_prisma",
      side: "agent",
      text: "Persisted through Prisma",
      time: "now"
    });

    const saved = await repository.saveConversation(conversation);

    assert.equal(client.calls.transactions, 1);
    assert.equal(saved.status, "closed");
    assert.equal(saved.messages.some((message) => message.id === "msg_agent_prisma"), true);
    assert.equal(client.calls.conversationUpserts.length, 1);
    assert.equal(client.calls.conversationMessageDeleteMany.length, 1);
    assert.deepEqual(client.calls.conversationMessageDeleteMany[0], { where: { conversationId: "maria" } });
    assert.equal(client.calls.conversationMessageCreateMany.length, 1);
    assert.equal(client.calls.conversationMessageCreateMany[0].data.length, 3);
    assert.equal(client.calls.conversationMessageCreateMany[0].data[2].id, "msg_agent_prisma");
    assert.equal(client.calls.conversationMessageCreateMany[0].data.every((message) => message.createdAt instanceof Date), true);
    assert.equal(client.calls.conversationMessageCreateMany[0].data[0].createdAt.toISOString(), "2026-06-28T10:00:00.000Z");
    assert.equal(client.calls.conversationMessageCreateMany[0].data[1].createdAt.toISOString(), "2026-06-28T10:01:00.000Z");

    const refetched = await repository.findConversation("maria");
    assert.deepEqual(refetched?.messages.map((message) => message.id), ["msg_1", "msg_2", "msg_agent_prisma"]);
  });

  it("persists assignment, realtime notification and routing analytics in one Prisma transaction", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });
    const conversation = await repository.findConversation("maria");
    assert.ok(conversation);
    conversation.operatorId = "usr-volga-admin";
    conversation.operatorName = "Sergey Markin";
    conversation.status = "assigned";

    const persisted = await repository.assignConversation({
      analyticsRow: {
        channel: "SDK",
        conversationId: "maria",
        eventKind: "assignment",
        fromOperatorId: null,
        id: "analytics_assignment_prisma",
        occurredAt: "2026-07-10T09:00:00.000Z",
        source: "dialog-interface",
        tenantId: "tenant-volga",
        toOperatorId: "usr-volga-admin"
      },
      conversation,
      realtimeEvent: {
        data: { action: "assignment", toOperatorId: "usr-volga-admin" },
        eventId: "rt_assignment_prisma",
        eventName: "conversation.updated",
        occurredAt: "2026-07-10T09:00:00.000Z",
        resourceId: "maria",
        resourceType: "conversation",
        schemaVersion: "v1",
        tenantId: "tenant-volga",
        traceId: "trc_assignment_prisma"
      }
    });

    assert.equal(client.calls.transactions, 1);
    assert.equal(client.calls.conversationUpdateMany.length, 1);
    assert.equal(client.calls.routingAnalyticsRowCreates.length, 1);
    assert.equal(client.calls.routingAnalyticsRowCreates[0].data.occurredAt instanceof Date, true);
    assert.equal(client.calls.conversationRealtimeEventCreates[0].data.eventId, "rt_assignment_prisma");
    assert.equal(persisted.conversation.operatorId, "usr-volga-admin");
    assert.equal(persisted.analyticsRow.id, "analytics_assignment_prisma");
  });

  it("rejects a stale assignment before writing realtime or analytics rows", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });
    const conversation = await repository.findConversation("maria");
    assert.ok(conversation);
    conversation.operatorId = "usr-volga-admin";
    conversation.operatorName = "Sergey Markin";

    await repository.assignConversation({
      analyticsRow: {
        channel: "SDK",
        conversationId: "maria",
        eventKind: "assignment",
        fromOperatorId: null,
        id: "analytics_assignment_first",
        occurredAt: "2026-07-10T09:00:00.000Z",
        source: "dialog-interface",
        tenantId: "tenant-volga",
        toOperatorId: "usr-volga-admin"
      },
      conversation,
      realtimeEvent: assignmentRealtimeEvent("rt_assignment_first")
    });

    const staleConversation = { ...conversation, operatorId: "usr-ns-owner", operatorName: "Mira Volkova" };
    await assert.rejects(() => repository.assignConversation({
      analyticsRow: {
        channel: "SDK",
        conversationId: "maria",
        eventKind: "assignment",
        fromOperatorId: null,
        id: "analytics_assignment_stale",
        occurredAt: "2026-07-10T09:00:01.000Z",
        source: "dialog-interface",
        tenantId: "tenant-volga",
        toOperatorId: "usr-ns-owner"
      },
      conversation: staleConversation,
      realtimeEvent: assignmentRealtimeEvent("rt_assignment_stale")
    }), /assignment changed before commit/);

    assert.equal(client.calls.conversationUpdateMany.length, 2);
    assert.equal(client.calls.routingAnalyticsRowCreates.length, 1);
    assert.equal(client.calls.conversationRealtimeEventCreates.length, 1);
  });

  it("persists inbound idempotency and realtime events through Prisma delegates", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });

    assert.equal(await repository.findInboundEvent("telegram", "tg-prisma-001"), undefined);
    const inbound = await repository.recordInboundEvent({
      channel: "telegram",
      conversationId: "maria",
      eventId: "tg-prisma-001",
      messageId: "msg_client_prisma",
      receivedAt: "2026-06-28T12:00:00.000Z",
      traceId: "trc_conversation_prisma"
    });
    const duplicate = await repository.findInboundEvent("telegram", "tg-prisma-001");

    assert.equal(inbound.eventId, "tg-prisma-001");
    assert.equal(duplicate?.messageId, "msg_client_prisma");
    assert.equal(client.calls.conversationInboundEventCreates.length, 1);
    assert.equal(client.calls.conversationInboundEventCreates[0].data.receivedAt instanceof Date, true);
    assert.deepEqual(client.calls.conversationInboundEventFindUnique[1], {
      where: {
        channel_eventId: {
          channel: "telegram",
          eventId: "tg-prisma-001"
        }
      }
    });

    const realtime = await repository.appendRealtimeEvent({
      data: { messageId: "msg_client_prisma" },
      eventId: "rt_prisma_001",
      eventName: "message.created",
      occurredAt: "2026-06-28T12:00:01.000Z",
      resourceId: "maria",
      resourceType: "conversation",
      schemaVersion: "v1",
      tenantId: "tenant-volga",
      traceId: "trc_conversation_prisma"
    });
    const events = await repository.listRealtimeEvents();
    const tenantEvents = await repository.listRealtimeEvents({ tenantId: "tenant-volga" });

    assert.equal(realtime.eventId, "rt_prisma_001");
    assert.deepEqual(events.map((event) => event.eventId), ["rt_prisma_001"]);
    assert.deepEqual(tenantEvents.map((event) => event.eventId), ["rt_prisma_001"]);
    assert.equal(client.calls.conversationRealtimeEventCreates[0].data.occurredAt instanceof Date, true);
    assert.deepEqual(client.calls.conversationRealtimeEventFindMany, [
      { orderBy: [{ occurredAt: "asc" }, { eventId: "asc" }] },
      { orderBy: [{ occurredAt: "asc" }, { eventId: "asc" }], where: { tenantId: "tenant-volga" } }
    ]);
  });

  it("returns the existing inbound event when a concurrent Prisma create hits the unique key", async () => {
    const { client } = createFakePrismaConversationClient({ inboundCreateUniqueRace: true });
    const repository = ConversationRepository.prisma({ client });

    const inbound = await repository.recordInboundEvent({
      channel: "telegram",
      conversationId: "maria",
      eventId: "tg-raced-001",
      messageId: "msg_raced_prisma",
      receivedAt: "2026-06-28T12:10:00.000Z",
      traceId: "trc_conversation_prisma_race"
    });

    assert.equal(inbound.eventId, "tg-raced-001");
    assert.equal(inbound.messageId, "msg_raced_prisma");
    assert.equal(client.calls.conversationInboundEventCreates.length, 1);
    assert.equal(client.calls.conversationInboundEventFindUnique.length, 2);
  });

  it("records outbound descriptors and outbox events in one Prisma transaction", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });
    const descriptor = {
      auditId: "audit_message_001",
      channel: "SDK",
      conversationId: "maria",
      createdAt: "2026-06-28T12:20:00.000Z",
      deliveryState: "queued",
      id: "delivery_prisma_001",
      idempotencyKey: "delivery_prisma_001",
      kind: "message_delivery" as const,
      messageId: "msg_agent_prisma",
      outboxEventId: null,
      payload: {
        messageId: "msg_agent_prisma",
        text: "Prisma outbound delivery"
      },
      requestFingerprint: "fingerprint_prisma_001",
      retryable: true,
      status: "queued",
      tenantId: "tenant-volga",
      traceId: "trc_conversation_outbound_prisma"
    };
    const outbox = createOutboxEvent({
      aggregateId: "maria",
      aggregateType: "conversation",
      payload: {
        descriptorId: descriptor.id,
        messageId: descriptor.messageId
      },
      queue: "message-delivery",
      traceId: descriptor.traceId,
      type: "message.delivery.requested"
    });

    const persisted = await repository.recordOutboundDescriptor({ descriptor, outbox });
    const descriptors = await repository.listOutboundDescriptors({ conversationId: "maria" });
    const tenantDescriptors = await repository.listOutboundDescriptors({ tenantId: "tenant-volga" });
    const replay = await repository.findOutboundDescriptorByIdempotencyKey("delivery_prisma_001");

    assert.equal(client.calls.transactions, 1);
    assert.equal(persisted.descriptor.outboxEventId, outbox.id);
    assert.equal(descriptors[0].id, "delivery_prisma_001");
    assert.equal(tenantDescriptors[0].id, "delivery_prisma_001");
    assert.equal(replay?.id, "delivery_prisma_001");
    assert.equal(descriptors[0].outboxEventId, outbox.id);
    assert.deepEqual(client.calls.conversationOutboundDescriptorCreates[0].data, {
      ...descriptor,
      createdAt: new Date(descriptor.createdAt),
      outboxEventId: outbox.id
    });
    assert.deepEqual(client.calls.outboxEventCreates[0].data, {
      aggregateId: outbox.aggregateId,
      aggregateType: outbox.aggregateType,
      id: outbox.id,
      occurredAt: new Date(outbox.occurredAt),
      payload: outbox.payload,
      queue: outbox.queue,
      status: "pending",
      traceId: outbox.traceId,
      type: outbox.type
    });
    assert.deepEqual(client.calls.conversationOutboundDescriptorFindMany, [
      {
        orderBy: { createdAt: "desc" },
        where: { conversationId: "maria" }
      },
      {
        orderBy: { createdAt: "desc" },
        where: { tenantId: "tenant-volga" }
      }
    ]);
  });

  it("persists delivery receipts through the Prisma conversation repository with provider replay", async () => {
    const { client } = createFakePrismaConversationClient();
    const repository = ConversationRepository.prisma({ client });
    const receipt = {
      channel: "telegram",
      conversationId: "maria",
      id: "receipt_prisma_001",
      idempotencyKey: "receipt-prisma-001",
      messageId: "msg_agent_prisma",
      payload: { providerStatus: "delivered" },
      provider: "telegram-bot-api",
      providerEventId: "tg-update-prisma-001",
      receivedAt: "2026-06-29T10:00:00.000Z",
      status: "delivered",
      tenantId: "tenant-volga",
      traceId: "trc_receipt_prisma_001"
    };

    const created = await repository.recordDeliveryReceipt(receipt);
    const replay = await repository.recordDeliveryReceipt({
      ...receipt,
      id: "receipt_prisma_replay",
      idempotencyKey: "receipt-prisma-replay",
      payload: { providerStatus: "ignored" },
      receivedAt: "2026-06-29T10:01:00.000Z",
      status: "failed"
    });
    const sameEventFromDifferentProvider = await repository.recordDeliveryReceipt({
      ...receipt,
      id: "receipt_prisma_other_provider",
      idempotencyKey: "receipt-prisma-other-provider",
      provider: "telegram-webhook-proxy",
      status: "read"
    });
    const receipts = await repository.listDeliveryReceipts({
      channel: "telegram",
      messageId: "msg_agent_prisma",
      tenantId: "tenant-volga"
    });

    assert.equal(created.id, "receipt_prisma_001");
    assert.equal(replay.id, "receipt_prisma_001");
    assert.equal(replay.status, "delivered");
    assert.equal(sameEventFromDifferentProvider.id, "receipt_prisma_other_provider");
    assert.deepEqual(receipts.map((item) => item.id), ["receipt_prisma_001", "receipt_prisma_other_provider"]);
    assert.equal(client.calls.channelDeliveryReceiptCreates.length, 2);
    assert.equal(client.calls.channelDeliveryReceiptCreates[0].data.receivedAt instanceof Date, true);
    assert.deepEqual(client.calls.channelDeliveryReceiptFindUnique[1], {
      where: {
        provider_providerEventId: {
          provider: "telegram-bot-api",
          providerEventId: "tg-update-prisma-001"
        }
      }
    });
    assert.deepEqual(client.calls.channelDeliveryReceiptFindMany, [{
      orderBy: { receivedAt: "asc" },
      where: {
        channel: "telegram",
        messageId: "msg_agent_prisma",
        tenantId: "tenant-volga"
      }
    }]);
  });

  it("returns the existing delivery receipt when a concurrent Prisma create hits the provider event unique key", async () => {
    const { client } = createFakePrismaConversationClient({ receiptCreateUniqueRace: true });
    const repository = ConversationRepository.prisma({ client });

    const receipt = await repository.recordDeliveryReceipt({
      channel: "telegram",
      conversationId: "maria",
      id: "receipt_prisma_raced_001",
      idempotencyKey: "receipt-prisma-raced-001",
      messageId: "msg_agent_prisma",
      payload: { providerStatus: "delivered" },
      provider: "telegram-bot-api",
      providerEventId: "tg-update-raced-001",
      receivedAt: "2026-06-29T10:10:00.000Z",
      status: "delivered",
      tenantId: "tenant-volga",
      traceId: "trc_receipt_prisma_raced"
    });

    assert.equal(receipt.id, "receipt_prisma_raced_001");
    assert.equal(receipt.providerEventId, "tg-update-raced-001");
    assert.equal(client.calls.channelDeliveryReceiptCreates.length, 1);
    assert.equal(client.calls.channelDeliveryReceiptFindUnique.length, 2);
  });

  it("bootstraps the default conversation repository from a Prisma client factory", async () => {
    const { client } = createFakePrismaConversationClient();
    const factoryCalls: unknown[] = [];

    const repository = configureConversationRepository({
      CONVERSATION_REPOSITORY: "prisma",
      DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
      NODE_ENV: "test",
      PORT: "4191",
      SERVICE_NAME: "api-gateway"
    }, {
      prismaClientFactory: (options) => {
        factoryCalls.push(options);
        return client;
      }
    });

    assert.equal(ConversationRepository.default(), repository);
    assert.deepEqual(factoryCalls, [{
      datasourceUrl: "postgresql://support:support@127.0.0.1:5432/support_communication"
    }]);

    const conversation = await ConversationRepository.default().findConversation("maria");
    assert.equal(conversation?.preview, "Where is my order?");
  });
});

function createFakePrismaConversationClient(options: { inboundCreateUniqueRace?: boolean; receiptCreateUniqueRace?: boolean } = {}) {
  const conversations = new Map<string, FakeConversationRowWithMessages>([[
    "maria",
    {
      avatar: "https://example.test/maria.png",
      channel: "SDK",
      clientSince: "2024-05-12",
      createdAt: new Date("2026-06-28T10:00:00.000Z"),
      device: "Android",
      entry: "SDK",
      id: "maria",
      initials: "MK",
      language: "Russian",
      messages: [
        {
          attachments: null,
          author: null,
          conversationId: "maria",
          createdAt: new Date("2026-06-28T10:00:00.000Z"),
          id: "msg_1",
          side: "client",
          text: "Where is my order?",
          time: "11:24",
          type: null
        },
        {
          attachments: [],
          author: "Ivan P.",
          conversationId: "maria",
          createdAt: new Date("2026-06-28T10:01:00.000Z"),
          id: "msg_2",
          side: null,
          text: "Check courier service before final reply.",
          time: "11:25",
          type: "internal"
        }
      ],
      name: "Maria K.",
      operatorId: null,
      operatorName: null,
      phone: "+7 999 204-18-44",
      preview: "Where is my order?",
      previous: [["2024-05-05", "Return", "Closed"]],
      sla: "02:15",
      slaTone: "ok",
      status: "active",
      tags: ["delivery", "important"],
      tenantId: "tenant-volga",
      time: "11:24",
      topic: "Delivery / Status",
      unread: true,
      updatedAt: new Date("2026-06-28T10:00:00.000Z")
    }
  ]]);
  const deliveryReceipts = new Map<string, FakeChannelDeliveryReceiptRow>();
  const inboundEvents = new Map<string, FakeConversationInboundEventRow>();
  const outboundDescriptors = new Map<string, FakeConversationOutboundDescriptorRow>();
  const realtimeEvents = new Map<string, FakeConversationRealtimeEventRow>();
  const calls = {
    channelDeliveryReceiptCreates: [] as Array<{ data: FakeChannelDeliveryReceiptCreateInput }>,
    channelDeliveryReceiptFindMany: [] as Array<{ orderBy: { receivedAt: "asc" }; where: Partial<Record<"channel" | "messageId" | "tenantId", string>> }>,
    channelDeliveryReceiptFindUnique: [] as Array<{ where: { provider_providerEventId: { provider: string; providerEventId: string } } }>,
    conversationFindMany: [] as unknown[],
    conversationFindUnique: [] as unknown[],
    conversationInboundEventCreates: [] as Array<{ data: FakeConversationInboundEventCreateInput }>,
    conversationInboundEventFindUnique: [] as Array<{ where: { channel_eventId: { channel: string; eventId: string } } }>,
    conversationMessageCreateMany: [] as Array<{ data: FakeConversationMessageCreateInput[] }>,
    conversationMessageDeleteMany: [] as Array<{ where: { conversationId: string } }>,
    conversationOutboundDescriptorCreates: [] as Array<{ data: FakeConversationOutboundDescriptorCreateInput }>,
    conversationOutboundDescriptorFindMany: [] as Array<{ orderBy: { createdAt: "desc" }; where: Partial<Record<"channel" | "conversationId" | "idempotencyKey" | "kind" | "status" | "tenantId", string>> }>,
    conversationOutboundDescriptorFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    conversationRealtimeEventCreates: [] as Array<{ data: FakeConversationRealtimeEventCreateInput }>,
    conversationRealtimeEventFindMany: [] as unknown[],
    conversationUpserts: [] as Array<{ create: FakeConversationUpsertInput; update: FakeConversationUpsertInput; where: { id: string } }>,
    conversationUpdateMany: [] as Array<{ data: FakeConversationUpsertInput; where: { id: string; operatorId: string | null; tenantId: string } }>,
    outboxEventCreates: [] as Array<{ data: FakeOutboxEventCreateInput }>,
    routingAnalyticsRowCreates: [] as Array<{ data: FakeRoutingAnalyticsRowCreateInput }>,
    transactions: 0
  };

  const delegates = {
    channelDeliveryReceipt: {
      create: async (input: { data: FakeChannelDeliveryReceiptCreateInput }) => {
        calls.channelDeliveryReceiptCreates.push(input);
        const row = {
          ...input.data,
          createdAt: input.data.receivedAt,
          updatedAt: input.data.receivedAt
        };
        deliveryReceipts.set(`${row.provider}:${row.providerEventId}`, row);
        if (options.receiptCreateUniqueRace) {
          const error = new Error("Unique constraint failed on the fields: (`provider`,`provider_event_id`)") as Error & { code?: string };
          error.code = "P2002";
          throw error;
        }

        return row;
      },
      findMany: async (input: { orderBy: { receivedAt: "asc" }; where: Partial<Record<"channel" | "messageId" | "tenantId", string>> }) => {
        calls.channelDeliveryReceiptFindMany.push(input);
        return Array.from(deliveryReceipts.values())
          .filter((receipt) => Object.entries(input.where).every(([key, value]) => receipt[key as keyof FakeChannelDeliveryReceiptRow] === value))
          .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
      },
      findUnique: async (input: { where: { provider_providerEventId: { provider: string; providerEventId: string } } }) => {
        calls.channelDeliveryReceiptFindUnique.push(input);
        const key = input.where.provider_providerEventId;
        return deliveryReceipts.get(`${key.provider}:${key.providerEventId}`) ?? null;
      }
    },
    conversation: {
      findMany: async (input: unknown) => {
        calls.conversationFindMany.push(input);
        return Array.from(conversations.values());
      },
      findUnique: async (input: { where: { id: string } }) => {
        calls.conversationFindUnique.push(input);
        return conversations.get(input.where.id) ?? null;
      },
      updateMany: async (input: { data: FakeConversationUpsertInput; where: { id: string; operatorId: string | null; tenantId: string } }) => {
        calls.conversationUpdateMany.push(input);
        const existing = conversations.get(input.where.id);
        if (!existing
          || existing.tenantId !== input.where.tenantId
          || (existing.operatorId ?? null) !== input.where.operatorId) {
          return { count: 0 };
        }
        conversations.set(input.where.id, { ...existing, ...input.data });
        return { count: 1 };
      },
      upsert: async (input: { create: FakeConversationUpsertInput; update: FakeConversationUpsertInput; where: { id: string } }) => {
        calls.conversationUpserts.push(input);
        const existing = conversations.get(input.where.id);
        const next = {
          ...(existing ?? { messages: [] }),
          ...input.create,
          ...input.update,
          messages: existing?.messages ?? []
        };
        conversations.set(input.where.id, next);
        return next;
      }
    },
    conversationInboundEvent: {
      create: async (input: { data: FakeConversationInboundEventCreateInput }) => {
        calls.conversationInboundEventCreates.push(input);
        if (options.inboundCreateUniqueRace) {
          inboundEvents.set(`${input.data.channel}:${input.data.eventId}`, input.data);
          const error = new Error("Unique constraint failed on the fields: (`channel`,`event_id`)") as Error & { code?: string };
          error.code = "P2002";
          throw error;
        }

        inboundEvents.set(`${input.data.channel}:${input.data.eventId}`, input.data);
        return input.data;
      },
      findUnique: async (input: { where: { channel_eventId: { channel: string; eventId: string } } }) => {
        calls.conversationInboundEventFindUnique.push(input);
        return inboundEvents.get(`${input.where.channel_eventId.channel}:${input.where.channel_eventId.eventId}`) ?? null;
      }
    },
    conversationMessage: {
      createMany: async (input: { data: FakeConversationMessageCreateInput[] }) => {
        calls.conversationMessageCreateMany.push(input);
        const conversation = conversations.get(input.data[0]?.conversationId ?? "");
        if (conversation) {
          conversation.messages = input.data.map((message) => ({ ...message, createdAt: message.createdAt }));
        }
        return { count: input.data.length };
      },
      deleteMany: async (input: { where: { conversationId: string } }) => {
        calls.conversationMessageDeleteMany.push(input);
        const conversation = conversations.get(input.where.conversationId);
        if (conversation) {
          conversation.messages = [];
        }
        return { count: 1 };
      }
    },
    conversationOutboundDescriptor: {
      create: async (input: { data: FakeConversationOutboundDescriptorCreateInput }) => {
        calls.conversationOutboundDescriptorCreates.push(input);
        outboundDescriptors.set(input.data.id, input.data);
        return input.data;
      },
      findMany: async (input: { orderBy: { createdAt: "desc" }; where: Partial<Record<"channel" | "conversationId" | "idempotencyKey" | "kind" | "status" | "tenantId", string>> }) => {
        calls.conversationOutboundDescriptorFindMany.push(input);
        return Array.from(outboundDescriptors.values()).filter((descriptor) => {
          return Object.entries(input.where).every(([key, value]) => descriptor[key as keyof FakeConversationOutboundDescriptorRow] === value);
        });
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.conversationOutboundDescriptorFindUnique.push(input);
        return Array.from(outboundDescriptors.values()).find((descriptor) => descriptor.idempotencyKey === input.where.idempotencyKey) ?? null;
      }
    },
    conversationRealtimeEvent: {
      create: async (input: { data: FakeConversationRealtimeEventCreateInput }) => {
        calls.conversationRealtimeEventCreates.push(input);
        realtimeEvents.set(input.data.eventId, input.data);
        return input.data;
      },
      findMany: async (input: { where?: { tenantId?: string } }) => {
        calls.conversationRealtimeEventFindMany.push(input);
        return Array.from(realtimeEvents.values()).filter((event) => !input.where?.tenantId || event.tenantId === input.where.tenantId);
      }
    },
    outboxEvent: {
      create: async (input: { data: FakeOutboxEventCreateInput }) => {
        calls.outboxEventCreates.push(input);
        return input.data;
      }
    },
    routingAnalyticsRow: {
      create: async (input: { data: FakeRoutingAnalyticsRowCreateInput }) => {
        calls.routingAnalyticsRowCreates.push(input);
        return { ...input.data, createdAt: input.data.occurredAt };
      }
    }
  };

  const client = {
    ...delegates,
    calls,
    $transaction: async <T>(operation: (transactionClient: typeof delegates) => Promise<T>) => {
      calls.transactions += 1;
      return operation(delegates);
    }
  };

  return { client };
}

interface FakeConversationRowWithMessages {
  avatar: string | null;
  channel: string;
  clientSince: string;
  createdAt: Date;
  device: string;
  entry: string;
  id: string;
  initials: string;
  language: string;
  messages: FakeConversationMessageRow[];
  name: string;
  operatorId: string | null;
  operatorName: string | null;
  phone: string;
  preview: string;
  previous: unknown;
  sla: string;
  slaTone: string;
  status: string;
  tags: string[];
  tenantId: string;
  time: string;
  topic: string;
  unread: boolean | null;
  updatedAt: Date;
}

interface FakeConversationMessageRow {
  attachments: unknown;
  author: string | null;
  conversationId: string;
  createdAt: Date;
  id: string;
  side: string | null;
  text: string;
  time: string;
  type: string | null;
}

interface FakeConversationUpsertInput {
  avatar: string | null;
  channel: string;
  clientSince: string;
  device: string;
  entry: string;
  id: string;
  initials: string;
  language: string;
  name: string;
  operatorId: string | null;
  operatorName: string | null;
  phone: string;
  preview: string;
  previous: unknown;
  sla: string;
  slaTone: string;
  status: string;
  tags: string[];
  tenantId: string;
  time: string;
  topic: string;
  unread: boolean;
}

interface FakeRoutingAnalyticsRowCreateInput {
  channel: string;
  conversationId: string;
  eventKind: "assignment" | "transfer";
  fromOperatorId: string | null;
  id: string;
  occurredAt: Date;
  source: string;
  tenantId: string;
  toOperatorId: string;
}

interface FakeConversationMessageCreateInput {
  attachments: unknown;
  author: string | null;
  conversationId: string;
  createdAt: Date;
  id: string;
  side: string | null;
  text: string;
  time: string;
  type: string | null;
}

interface FakeChannelDeliveryReceiptCreateInput {
  channel: string;
  conversationId: string;
  id: string;
  idempotencyKey: string;
  messageId: string;
  payload: Record<string, unknown> | null;
  provider: string;
  providerEventId: string;
  receivedAt: Date;
  status: string;
  tenantId: string;
  traceId: string;
}

interface FakeChannelDeliveryReceiptRow extends FakeChannelDeliveryReceiptCreateInput {
  createdAt: Date;
  updatedAt: Date;
}

interface FakeConversationInboundEventCreateInput {
  channel: string;
  conversationId: string;
  eventId: string;
  id: string;
  messageId: string;
  payload: Record<string, unknown> | null;
  receivedAt: Date;
  traceId: string;
}

type FakeConversationInboundEventRow = FakeConversationInboundEventCreateInput;

interface FakeConversationOutboundDescriptorCreateInput {
  auditId: string | null;
  channel: string;
  conversationId: string | null;
  createdAt: Date;
  deliveryState: string | null;
  id: string;
  idempotencyKey: string | null;
  kind: "attachment_upload" | "message_delivery" | "outbound_conversation";
  messageId: string | null;
  outboxEventId: string | null;
  payload: Record<string, unknown>;
  requestFingerprint: string | null;
  retryable: boolean;
  status: string;
  tenantId: string;
  traceId: string;
}

type FakeConversationOutboundDescriptorRow = FakeConversationOutboundDescriptorCreateInput;

interface FakeConversationRealtimeEventCreateInput {
  data: Record<string, unknown>;
  eventId: string;
  eventName: string;
  id: string;
  occurredAt: Date;
  resourceId: string;
  resourceType: string;
  schemaVersion: string;
  tenantId: string;
  traceId: string;
}

type FakeConversationRealtimeEventRow = FakeConversationRealtimeEventCreateInput;

function assignmentRealtimeEvent(eventId: string) {
  return {
    data: { action: "assignment" },
    eventId,
    eventName: "conversation.updated",
    occurredAt: "2026-07-10T09:00:00.000Z",
    resourceId: "maria",
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: "tenant-volga",
    traceId: `trc_${eventId}`
  };
}

interface FakeOutboxEventCreateInput {
  aggregateId: string;
  aggregateType: string;
  id: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  queue: string;
  status: "pending";
  traceId: string;
  type: string;
}
