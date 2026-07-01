import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createOutboxEvent } from "@support-communication/events";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { channelFixtures, type ConversationMessage, type ConversationRecord } from "./conversation.fixtures.js";
import { ConversationRepository, type ConversationDeliveryReceipt, type ConversationOutboundDescriptor, type RealtimeEvent } from "./conversation.repository.js";
import { createDisabledRealtimeFanoutAdapter, type RealtimeFanoutAdapter } from "./realtime.fanout.js";
import { mergeRealtimeEvents } from "./realtime.merge.js";

const DIALOG_SERVICE = "dialogService";
const CHANNEL_SERVICE = "channelService";
const REALTIME_SERVICE = "realtimeGateway";
const NOW_LABEL = "now";
const supportedStatuses = new Set([
  "new",
  "queued",
  "assigned",
  "active",
  "waiting_client",
  "waiting_operator",
  "transferred",
  "paused",
  "closed",
  "reopened"
]);

interface DialogFilters {
  channel?: string;
  page?: number | string;
  pageSize?: number | string;
  query?: string;
  savedPresetId?: string;
  status?: string;
  topic?: string;
}

interface StatusPayload {
  conversationId: string;
  nextStatus?: string;
  roleMode?: string;
  topic?: string;
}

interface AppendMessagePayload {
  attachments?: Array<Record<string, unknown>>;
  conversationId: string;
  idempotencyKey?: string;
  mode?: "internal" | "reply";
  text?: string;
}

interface UploadPayload {
  channel: string;
  fileName: string;
  idempotencyKey?: string;
  sizeBytes?: number;
}

interface OutboundPayload {
  channel: string;
  clientName?: string;
  idempotencyKey?: string;
  message: string;
  phone: string;
  topic: string;
}

interface InboundPayload {
  conversationId?: string;
  eventId?: string;
  text?: string;
}

interface DeliveryReceiptPayload {
  conversationId?: string;
  idempotencyKey?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
  provider?: string;
  providerEventId?: string;
  receivedAt?: string;
  status?: string;
  tenantId?: string;
  traceId?: string;
}

interface ConversationServiceOptions {
  realtimeFanout?: RealtimeFanoutAdapter;
}

interface TenantScope {
  tenantId?: string;
}

let defaultRealtimeFanout = createDisabledRealtimeFanoutAdapter("realtime_fanout_not_configured");

export class ConversationService {
  private lastRealtimeOccurredAtMs = 0;
  private readonly liveRealtimeEvents: RealtimeEvent[] = [];
  private readonly realtimeFanout: RealtimeFanoutAdapter;

  constructor(
    private readonly conversationRepository = ConversationRepository.default(),
    options: ConversationServiceOptions = {}
  ) {
    this.realtimeFanout = options.realtimeFanout ?? defaultRealtimeFanout;
    void this.realtimeFanout.subscribe((event) => {
      this.liveRealtimeEvents.push(event);
    }).catch(() => {
      // Persisted replay remains available if live fan-out subscription is degraded.
    });
  }

  static useDefaultRealtimeFanout(adapter: RealtimeFanoutAdapter): void {
    defaultRealtimeFanout = adapter;
  }

  async fetchDialogs(filters: DialogFilters = {}, scope: TenantScope = {}): Promise<BackendEnvelope<{
    items: ConversationRecord[];
    pagination: { mode: string; page: number; pageSize: number; total: number };
    savedPresetId: string | null;
  }>> {
    const conversations = await this.conversationRepository.listConversations();
    const filtered = conversations.filter((conversation) => {
      if (!matchesTenantScope(conversation, scope.tenantId)) {
        return false;
      }
      const statusMatches = !filters.status || filters.status === "all" || conversation.status === filters.status;
      const channelMatches = !filters.channel || filters.channel === "all" || conversation.channel.toLowerCase() === String(filters.channel).toLowerCase();
      const topicMatches = !filters.topic || filters.topic === "all" || (filters.topic === "none" ? !conversation.topic : conversation.topic === filters.topic);
      const query = String(filters.query ?? "").trim().toLowerCase();
      const queryMatches = !query || [
        conversation.name,
        conversation.phone,
        conversation.preview,
        conversation.channel,
        conversation.topic,
        conversation.status
      ].some((value) => value.toLowerCase().includes(query));

      return statusMatches && channelMatches && topicMatches && queryMatches;
    });
    const page = toPositiveInt(filters.page, 1);
    const pageSize = toPositiveInt(filters.pageSize, 25);
    const start = (page - 1) * pageSize;

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchDialogs",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchDialogs"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        items: clone(filtered.slice(start, start + pageSize)),
        pagination: {
          mode: "backend-ready",
          page,
          pageSize,
          total: filtered.length
        },
        savedPresetId: filters.savedPresetId ?? null
      }
    });
  }

  async fetchDialogDetail(conversationId: string, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(conversationId);

    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "fetchDialogDetail", "conversation_not_found", `Conversation ${conversationId} was not found.`, { conversationId });
    }

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchDialogDetail",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchDialogDetail"),
      meta: apiMeta({ conversationId }),
      data: {
        conversation: clone(conversation),
        messages: clone(conversation.messages)
      }
    });
  }

  async transitionConversationStatus(payload: StatusPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);
    const nextStatus = String(payload.nextStatus ?? "").trim();

    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    if (!supportedStatuses.has(nextStatus)) {
      return invalidEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "status_unsupported", `Conversation status ${nextStatus || "(empty)"} is not supported.`, {
        conversationId: conversation.id,
        nextStatus
      });
    }

    const nextTopic = String(payload.topic ?? conversation.topic ?? "").trim();

    if (nextStatus === "closed" && !nextTopic) {
      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "transitionConversationStatus",
        traceId: conversationTraceId(DIALOG_SERVICE, "transitionConversationStatus"),
        status: "invalid",
        meta: apiMeta({ conversationId: conversation.id }),
        data: {
          conversationId: conversation.id,
          guard: "role_channel_topic",
          nextStatus,
          roleMode: payload.roleMode,
          topicRequired: true
        },
        error: {
          code: "topic_required",
          message: "A conversation topic is required before closing the dialog."
        }
      });
    }

    const previousStatus = conversation.status;
    conversation.status = nextStatus;
    conversation.topic = nextTopic || conversation.topic;
    conversation.sla = statusSla(nextStatus);
    conversation.slaTone = statusTone(nextStatus);
    conversation.time = NOW_LABEL;
    const auditEvent = {
      id: makeAuditId("dialog"),
      action: "conversation.status.transition",
      from: previousStatus,
      immutable: true,
      target: conversation.id,
      to: nextStatus
    };
    const event = await this.recordRealtimeEvent("conversation.updated", "conversation", conversation.id, {
      fromStatus: previousStatus,
      toStatus: nextStatus,
      topic: conversation.topic
    }, resolveConversationTenantId(conversation));
    conversation.messages.push({
      id: makeMessageId("event"),
      type: "event",
      text: `Status changed: ${previousStatus} -> ${nextStatus}`,
      time: NOW_LABEL
    });
    await this.conversationRepository.saveConversation(conversation);

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "transitionConversationStatus",
      traceId: conversationTraceId(DIALOG_SERVICE, "transitionConversationStatus"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent,
        conversation: clone(conversation),
        guard: "role_channel_topic",
        nextStatus,
        realtimeEvent: event,
        roleMode: payload.roleMode,
        transitionId: makeQueueId("dialog_transition")
      }
    });
  }

  async appendMessage(payload: AppendMessagePayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);

    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "appendMessage", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const text = String(payload.text ?? "").trim();
    const attachments = payload.attachments ?? [];

    if (!text && !attachments.length) {
      return invalidEnvelope(DIALOG_SERVICE, "appendMessage", "message_content_required", "Message text or a ready attachment is required.", {
        conversationId: conversation.id
      });
    }

    const internal = payload.mode === "internal";
    const messageText = internal ? text || "Internal attachment" : text || "Attachment sent";
    const descriptorId = makeQueueId("delivery");
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey, descriptorId);
    const requestFingerprint = createRequestFingerprint("message_delivery", {
      attachments,
      conversationId: conversation.id,
      mode: "reply",
      text: messageText
    });

    if (!internal) {
      const existing = await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          return conflictEnvelope(DIALOG_SERVICE, "appendMessage", "idempotency_key_reused", "Idempotency key was already used for a different outbound message request.", {
            conversationId: conversation.id,
            idempotencyKey
          });
        }

        return createEnvelope({
          service: DIALOG_SERVICE,
          operation: "appendMessage",
          traceId: conversationTraceId(DIALOG_SERVICE, "appendMessage"),
          meta: apiMeta({ conversationId: conversation.id }),
          data: {
            auditEvent: {
              id: existing.auditId,
              action: "message.reply.send",
              immutable: true,
              target: conversation.id
            },
            duplicate: true,
            message: outboundMessageFromDescriptor(existing, messageText, attachments),
            outboundDelivery: outboundDeliveryFromDescriptor(existing),
            realtimeEvent: null
          }
        });
      }
    }

    const message: ConversationMessage = internal
      ? {
          id: makeMessageId("internal"),
          type: "internal",
          text: messageText,
          attachments,
          author: "Ivan P.",
          time: NOW_LABEL
        }
      : {
          id: makeMessageId("agent"),
          side: "agent",
          text: messageText,
          attachments,
          time: NOW_LABEL
        };
    conversation.messages.push(message);
    conversation.preview = message.text;
    conversation.time = NOW_LABEL;

    let event = this.createRealtimeEvent(internal ? "conversation.updated" : "message.created", "conversation", conversation.id, {
      messageId: message.id,
      mode: payload.mode ?? "reply"
    }, resolveConversationTenantId(conversation));
    const auditEvent = {
      id: makeAuditId(internal ? "internal_note" : "message"),
      action: internal ? "message.internal_note.create" : "message.reply.send",
      immutable: true,
      target: conversation.id
    };
    let outboundDelivery: Record<string, unknown> | null = null;

    if (internal) {
      event = await this.appendAndPublishRealtimeEvent(event);
      await this.conversationRepository.saveConversation(conversation);
    } else {
      const descriptor = createConversationOutboundDescriptor({
        auditId: auditEvent.id,
        channel: conversation.channel,
        conversationId: conversation.id,
        deliveryState: "queued",
        id: descriptorId,
        idempotencyKey,
        kind: "message_delivery",
        messageId: String(message.id),
        payload: {
          attachmentCount: attachments.length,
          conversationId: conversation.id,
          messageId: String(message.id),
          queue: "message-delivery",
          text: message.text
        },
        requestFingerprint,
        retryable: true,
        status: "queued",
        traceId: event.traceId
      });
      const outbox = createOutboxEvent({
        aggregateId: conversation.id,
        aggregateType: "conversation",
        payload: {
          channel: conversation.channel,
          conversationId: conversation.id,
          descriptorId: descriptor.id,
          idempotencyKey,
          messageId: String(message.id),
          retryable: true
        },
        queue: "message-delivery",
        traceId: event.traceId,
        type: "message.delivery.requested"
      });
      const queued = await this.conversationRepository.queueOutboundMessageReply({
        conversation,
        descriptor,
        outbox,
        realtimeEvent: event
      });

      event = queued.realtimeEvent;
      await this.publishRealtimeEvent(event);
      outboundDelivery = {
        channel: conversation.channel,
        deliveryState: "queued",
        descriptorId: queued.descriptor.id,
        idempotencyKey,
        outboxEventId: queued.outbox?.id ?? queued.descriptor.outboxEventId,
        queue: queued.outbox?.queue ?? queued.descriptor.payload.queue,
        retryable: true
      };
    }

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "appendMessage",
      traceId: conversationTraceId(DIALOG_SERVICE, "appendMessage"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent,
        message: clone(message),
        outboundDelivery,
        realtimeEvent: event
      }
    });
  }

  async uploadAttachment(payload: UploadPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const channel = String(payload.channel ?? "").trim();
    const fileName = String(payload.fileName ?? "").trim();
    const { idempotencyKey: requestedIdempotencyKey } = payload;
    const sizeBytes = payload.sizeBytes ?? 0;
    if (!channel || !fileName) {
      return invalidEnvelope(DIALOG_SERVICE, "uploadAttachment", "attachment_payload_required", "channel and fileName are required.", {
        channel
      });
    }

    if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
      return invalidEnvelope(DIALOG_SERVICE, "uploadAttachment", "attachment_size_invalid", "sizeBytes must be a non-negative finite number.", {
        channel,
        fileName
      });
    }

    const traceId = conversationTraceId(DIALOG_SERVICE, "uploadAttachment");
    const attachmentId = makeQueueId("attachment");
    const fileId = attachmentId;
    const idempotencyKey = normalizeIdempotencyKey(requestedIdempotencyKey, attachmentId);
    const requestFingerprint = createRequestFingerprint("attachment_upload", {
      channel,
      fileName,
      sizeBytes
    });
    const existing = await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return conflictEnvelope(DIALOG_SERVICE, "uploadAttachment", "idempotency_key_reused", "Idempotency key was already used for a different attachment upload request.", {
          channel,
          idempotencyKey
        });
      }

      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "uploadAttachment",
        traceId,
        meta: apiMeta({ channel }),
        data: {
          ...attachmentUploadDataFromDescriptor(existing),
          duplicate: true
        }
      });
    }

    const auditId = makeAuditId("attachment");
    const descriptor = createConversationOutboundDescriptor({
      auditId,
      channel,
      conversationId: null,
      deliveryState: "not_sent",
      id: attachmentId,
      idempotencyKey,
      kind: "attachment_upload",
      messageId: null,
      payload: {
        antivirusState: "scan_pending",
        channel,
        deliveryState: "not_sent",
        fileId,
        fileName,
        queue: "file-scan",
        sizeBytes,
        storageState: "upload_queued"
      },
      requestFingerprint,
      retryable: true,
      status: "upload_queued",
      traceId
    });
    const outbox = createOutboxEvent({
      aggregateId: attachmentId,
      aggregateType: "attachment",
      payload: {
        channel,
        descriptorId: descriptor.id,
        fileId,
        fileName,
        sizeBytes
      },
      queue: "file-scan",
      traceId,
      type: "attachment.upload.requested"
    });
    const persisted = await this.conversationRepository.recordOutboundDescriptor({ descriptor, outbox });

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "uploadAttachment",
      traceId,
      meta: apiMeta({ channel }),
      data: {
        id: attachmentId,
        fileId,
        channel,
        fileName,
        sizeBytes,
        storageState: "upload_queued",
        antivirusState: "scan_pending",
        deliveryState: "not_sent",
        auditId,
        descriptorId: persisted.descriptor.id,
        outboxEventId: persisted.outbox?.id,
        queue: persisted.outbox?.queue
      }
    });
  }

  async createOutboundConversationRequest(payload: OutboundPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const channel = String(payload.channel ?? "").trim();
    const message = String(payload.message ?? "").trim();
    const phone = String(payload.phone ?? "").trim();
    const topic = String(payload.topic ?? "").trim();
    const clientName = String(payload.clientName ?? "").trim();
    if (!phone || !channel || !message) {
      return invalidEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", "outbound_payload_required", "phone, channel and message are required.", {
        channel,
        phone
      });
    }

    if (!topic) {
      return invalidEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", "topic_required", "topic is required for outbound conversation delivery.", {
        channel,
        phone
      });
    }

    const traceId = conversationTraceId(DIALOG_SERVICE, "createOutboundConversationRequest");
    const backendQueueId = makeQueueId("outbound");
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey, backendQueueId);
    const descriptorPayload = {
      ...(clientName ? { clientName } : {}),
      channel,
      message,
      phone,
      queue: "message-delivery",
      topic
    };
    const requestFingerprint = createRequestFingerprint("outbound_conversation", descriptorPayload);
    const existing = await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return conflictEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", "idempotency_key_reused", "Idempotency key was already used for a different outbound conversation request.", {
          channel,
          idempotencyKey,
          phone
        });
      }

      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "createOutboundConversationRequest",
        traceId,
        meta: apiMeta({ channel }),
        data: {
          ...outboundConversationDataFromDescriptor(existing),
          duplicate: true
        }
      });
    }

    const auditId = makeAuditId("outbound");
    const descriptor = createConversationOutboundDescriptor({
      auditId,
      channel,
      conversationId: null,
      deliveryState: "queued",
      id: backendQueueId,
      idempotencyKey,
      kind: "outbound_conversation",
      messageId: null,
      payload: descriptorPayload,
      requestFingerprint,
      retryable: true,
      status: "queued",
      traceId
    });
    const outbox = createOutboxEvent({
      aggregateId: backendQueueId,
      aggregateType: "conversation_outbound",
      payload: {
        channel,
        descriptorId: descriptor.id,
        phone,
        topic
      },
      queue: "message-delivery",
      traceId,
      type: "conversation.outbound.requested"
    });
    const persisted = await this.conversationRepository.recordOutboundDescriptor({ descriptor, outbox });

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "createOutboundConversationRequest",
      traceId,
      meta: apiMeta({ channel }),
      data: {
        ...clone({
          ...(clientName ? { clientName } : {}),
          channel,
          message,
          phone,
          topic
        }),
        backendQueueId,
        status: "queued",
        consentCheck: "required_before_send",
        auditId,
        descriptorId: persisted.descriptor.id,
        outboxEventId: persisted.outbox?.id,
        queue: persisted.outbox?.queue
      }
    });
  }

  async fetchChannels(): Promise<BackendEnvelope<{ items: typeof channelFixtures }>> {
    return createEnvelope({
      service: CHANNEL_SERVICE,
      operation: "fetchChannels",
      traceId: conversationTraceId(CHANNEL_SERVICE, "fetchChannels"),
      partial: true,
      meta: apiMeta(),
      data: {
        items: clone(channelFixtures)
      }
    });
  }

  async normalizeInboundEvent(channel: string, payload: InboundPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const eventId = String(payload.eventId ?? "").trim();

    if (!eventId) {
      return invalidEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", "event_id_required", "Inbound eventId is required for idempotency.", {
        channel
      });
    }

    if (await this.conversationRepository.findInboundEvent(channel, eventId)) {
      return createEnvelope({
        service: CHANNEL_SERVICE,
        operation: "normalizeInboundEvent",
        traceId: conversationTraceId(CHANNEL_SERVICE, "normalizeInboundEvent"),
        meta: apiMeta({ channel, eventId }),
        data: {
          duplicate: true,
          eventId,
          message: null
        }
      });
    }

    const conversation = await this.conversationRepository.findConversation(payload.conversationId ?? "");

    if (!conversation) {
      return notFoundEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        channel,
        conversationId: payload.conversationId
      });
    }

    const text = String(payload.text ?? "").trim();

    if (!text) {
      return invalidEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", "message_content_required", "Inbound message text is required.", {
        channel,
        conversationId: conversation.id
      });
    }

    const message: ConversationMessage = {
      id: makeMessageId("client"),
      side: "client",
      text,
      time: NOW_LABEL
    };
    conversation.messages.push(message);
    conversation.preview = text;
    conversation.time = NOW_LABEL;
    const event = await this.recordRealtimeEvent("message.created", "conversation", conversation.id, {
      channel,
      eventId,
      messageId: message.id
    }, resolveConversationTenantId(conversation));
    await this.conversationRepository.saveConversation(conversation);
    await this.conversationRepository.recordInboundEvent({
      channel,
      conversationId: conversation.id,
      eventId,
      messageId: String(message.id),
      receivedAt: new Date().toISOString(),
      traceId: event.traceId
    });

    return createEnvelope({
      service: CHANNEL_SERVICE,
      operation: "normalizeInboundEvent",
      traceId: conversationTraceId(CHANNEL_SERVICE, "normalizeInboundEvent"),
      meta: apiMeta({ channel, eventId }),
      data: {
        duplicate: false,
        eventId,
        message: clone(message),
        realtimeEvent: event
      }
    });
  }

  async recordDeliveryReceipt(channel: string, payload: DeliveryReceiptPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const provider = String(payload.provider ?? "").trim();
    const providerEventId = String(payload.providerEventId ?? "").trim();
    const messageId = String(payload.messageId ?? "").trim();
    const status = String(payload.status ?? "").trim();
    const tenantId = payload.tenantId ?? "tenant-volga";

    if (!provider || !providerEventId) {
      return invalidEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", "delivery_receipt_payload_required", "provider, providerEventId, messageId and status are required.", {
        channel,
        messageId,
        provider,
        providerEventId
      });
    }

    const existingReceipt = (await this.conversationRepository.listDeliveryReceipts({ tenantId }))
      .find((receipt) => receipt.provider === provider && receipt.providerEventId === providerEventId);
    if (existingReceipt) {
      return createEnvelope({
        service: CHANNEL_SERVICE,
        operation: "recordDeliveryReceipt",
        traceId: payload.traceId ?? existingReceipt.traceId,
        meta: apiMeta({ channel, messageId, provider, providerEventId }),
        data: {
          duplicate: true,
          receipt: clone(existingReceipt),
          realtimeEvent: null
        }
      });
    }

    if (!messageId || !status) {
      return invalidEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", "delivery_receipt_payload_required", "provider, providerEventId, messageId and status are required.", {
        channel,
        messageId,
        provider,
        providerEventId
      });
    }

    const outboundDescriptors = await this.conversationRepository.listOutboundDescriptors({ channel });
    const matchingDescriptor = outboundDescriptors.find((descriptor) => descriptor.messageId === messageId);
    const conversationId = String(payload.conversationId ?? matchingDescriptor?.conversationId ?? "").trim();
    const conversation = await this.conversationRepository.findConversation(conversationId);

    if (!conversation) {
      return notFoundEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", "conversation_not_found", `Conversation ${conversationId || "(empty)"} was not found.`, {
        channel,
        conversationId,
        messageId
      });
    }

    const traceId = payload.traceId ?? conversationTraceId(CHANNEL_SERVICE, "recordDeliveryReceipt");
    const receiptId = makeQueueId("receipt");
    const receiptInput: ConversationDeliveryReceipt = {
      channel,
      conversationId: conversation.id,
      id: receiptId,
      idempotencyKey: normalizeIdempotencyKey(payload.idempotencyKey, `${provider}:${providerEventId}`),
      messageId,
      payload: payload.payload ?? null,
      provider,
      providerEventId,
      receivedAt: payload.receivedAt ?? new Date().toISOString(),
      status,
      tenantId,
      traceId
    };
    const receipt = await this.conversationRepository.recordDeliveryReceipt(receiptInput);
    if (receipt.id !== receiptId) {
      return createEnvelope({
        service: CHANNEL_SERVICE,
        operation: "recordDeliveryReceipt",
        traceId: payload.traceId ?? receipt.traceId,
        meta: apiMeta({ channel, messageId, provider, providerEventId }),
        data: {
          duplicate: true,
          receipt: clone(receipt),
          realtimeEvent: null
        }
      });
    }

    const realtimeEvent = await this.recordRealtimeEvent("message.delivery.updated", "conversation", conversation.id, {
      channel,
      messageId,
      provider,
      providerEventId,
      receiptId: receipt.id,
      status: receipt.status
    }, receipt.tenantId);

    return createEnvelope({
      service: CHANNEL_SERVICE,
      operation: "recordDeliveryReceipt",
      traceId,
      meta: apiMeta({ channel, messageId, provider, providerEventId }),
      data: {
        duplicate: false,
        receipt: clone(receipt),
        realtimeEvent
      }
    });
  }

  async fetchRealtimeEvents(
    filters: { since?: string } = {},
    scope: TenantScope = {}
  ): Promise<BackendEnvelope<{ events: RealtimeEvent[]; filters: { since?: string } }>> {
    const events = mergeRealtimeEvents([
      await this.conversationRepository.listRealtimeEvents(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      this.liveRealtimeEvents.filter((event) => !scope.tenantId || event.tenantId === scope.tenantId)
    ], filters.since);

    return createEnvelope({
      service: REALTIME_SERVICE,
      operation: "fetchRealtimeEvents",
      traceId: conversationTraceId(REALTIME_SERVICE, "fetchRealtimeEvents"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        events: clone(events),
        filters
      }
    });
  }

  private async recordRealtimeEvent(
    eventName: string,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    tenantId = "tenant-volga"
  ): Promise<RealtimeEvent> {
    return this.appendAndPublishRealtimeEvent(this.createRealtimeEvent(eventName, resourceType, resourceId, data, tenantId));
  }

  private async appendAndPublishRealtimeEvent(event: RealtimeEvent): Promise<RealtimeEvent> {
    const persisted = await this.conversationRepository.appendRealtimeEvent(event);
    await this.publishRealtimeEvent(persisted);
    return persisted;
  }

  private async publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
    try {
      await this.realtimeFanout.publish(event);
    } catch {
      // Persisted replay remains the source of truth when live fan-out is degraded.
    }
  }

  private createRealtimeEvent(
    eventName: string,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    tenantId = "tenant-volga"
  ): RealtimeEvent {
    const occurredAtMs = Math.max(Date.now(), this.lastRealtimeOccurredAtMs + 1);
    this.lastRealtimeOccurredAtMs = occurredAtMs;

    return {
      eventId: makeQueueId("rt"),
      eventName,
      occurredAt: new Date(occurredAtMs).toISOString(),
      resourceId,
      resourceType,
      schemaVersion: "v1",
      tenantId,
      traceId: conversationTraceId(REALTIME_SERVICE, eventName),
      data
    };
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function conversationTraceId(service: string, operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(service, operation);
}

function normalizeIdempotencyKey(value: unknown, fallback: string): string {
  const key = String(value ?? "").trim();
  return key || fallback;
}

function createRequestFingerprint(scope: string, payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify({ payload, scope }))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

type CreateConversationOutboundDescriptorInput = Omit<ConversationOutboundDescriptor, "createdAt" | "outboxEventId" | "tenantId"> & {
  createdAt?: string;
  outboxEventId?: string | null;
  tenantId?: string;
};

function createConversationOutboundDescriptor(input: CreateConversationOutboundDescriptorInput): ConversationOutboundDescriptor {
  return {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
    outboxEventId: input.outboxEventId ?? null,
    tenantId: input.tenantId ?? "tenant-volga"
  };
}

function outboundDeliveryFromDescriptor(descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  return {
    channel: descriptor.channel,
    deliveryState: descriptor.deliveryState ?? descriptor.status,
    descriptorId: descriptor.id,
    idempotencyKey: descriptor.idempotencyKey,
    outboxEventId: descriptor.outboxEventId,
    queue: descriptor.payload.queue,
    retryable: descriptor.retryable
  };
}

function outboundMessageFromDescriptor(descriptor: ConversationOutboundDescriptor, fallbackText: string, fallbackAttachments: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: descriptor.messageId ?? stringValue(descriptor.payload.messageId, descriptor.id),
    side: "agent",
    text: stringValue(descriptor.payload.text, fallbackText),
    attachments: Array.isArray(descriptor.payload.attachments) ? descriptor.payload.attachments : fallbackAttachments,
    time: NOW_LABEL
  };
}

function attachmentUploadDataFromDescriptor(descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  return {
    id: descriptor.id,
    fileId: stringValue(descriptor.payload.fileId, descriptor.id),
    channel: descriptor.channel,
    fileName: stringValue(descriptor.payload.fileName, ""),
    sizeBytes: numberValue(descriptor.payload.sizeBytes, 0),
    storageState: stringValue(descriptor.payload.storageState, descriptor.status),
    antivirusState: stringValue(descriptor.payload.antivirusState, "scan_pending"),
    deliveryState: descriptor.deliveryState ?? stringValue(descriptor.payload.deliveryState, "not_sent"),
    auditId: descriptor.auditId,
    descriptorId: descriptor.id,
    outboxEventId: descriptor.outboxEventId,
    queue: descriptor.payload.queue
  };
}

function outboundConversationDataFromDescriptor(descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  const data: Record<string, unknown> = {
    channel: stringValue(descriptor.payload.channel, descriptor.channel),
    message: stringValue(descriptor.payload.message, ""),
    phone: stringValue(descriptor.payload.phone, ""),
    topic: stringValue(descriptor.payload.topic, ""),
    backendQueueId: descriptor.id,
    status: descriptor.status,
    consentCheck: "required_before_send",
    auditId: descriptor.auditId,
    descriptorId: descriptor.id,
    outboxEventId: descriptor.outboxEventId,
    queue: descriptor.payload.queue
  };

  if (typeof descriptor.payload.clientName === "string") {
    data.clientName = descriptor.payload.clientName;
  }

  return data;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function conflictEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: conversationTraceId(service, operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function invalidEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: conversationTraceId(service, operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: conversationTraceId(service, operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeMessageId(scope: string): string {
  return `msg_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function statusSla(status: string): string {
  if (status === "closed") {
    return "Closed";
  }

  if (status === "paused") {
    return "SLA paused";
  }

  if (status === "queued" || status === "waiting_client" || status === "waiting_operator") {
    return "Waiting";
  }

  return "Active";
}

function statusTone(status: string): string {
  if (status === "closed") {
    return "closed";
  }

  if (status === "transferred" || status === "reopened") {
    return "warn";
  }

  if (status === "queued" || status === "waiting_client" || status === "waiting_operator" || status === "paused") {
    return "hold";
  }

  return "ok";
}

function toPositiveInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function matchesTenantScope(conversation: ConversationRecord, tenantId?: string): boolean {
  if (!tenantId) {
    return true;
  }
  return resolveConversationTenantId(conversation) === tenantId;
}

function resolveConversationTenantId(conversation: ConversationRecord): string {
  return conversation.tenantId ?? "tenant-volga";
}
