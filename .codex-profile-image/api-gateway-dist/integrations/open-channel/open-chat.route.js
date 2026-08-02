import { createHash } from "node:crypto";
import { resolveOrForkAppealConversation } from "../../conversation/appeal-lifecycle.js";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { randomUUID } from "node:crypto";
import { OpenChannelRepository } from "./open-channel.repository.js";
/**
 * Open Channel chat — the symmetric {sender, recipient, message} event
 * protocol for custom channels, wire-compatible with the format used by
 * popular live-chat platforms. We accept POST events on
 * `/open-channel/:token` and answer 2xx/4xx by the same convention, so
 * customer servers keep their retry logic unchanged.
 */
export const OPEN_CHAT_CHANNEL = "CHATAPI";
const MEDIA_MESSAGE_TYPES = new Set(["audio", "document", "photo", "sticker", "video"]);
const ACK_MESSAGE_TYPES = new Set(["seen", "typein"]);
export async function handleOpenChatInbound(input) {
    const repository = input.repository ?? OpenChannelRepository.default();
    const channel = await repository.findChatChannelByToken(input.channelToken);
    if (!channel || channel.status !== "active") {
        return plain(404, "channel_not_found");
    }
    const message = input.body?.message;
    const type = String(message?.type ?? "").trim().toLowerCase();
    if (!message || !type) {
        return plain(400, "message_type_required");
    }
    const clientId = String(input.body?.sender?.id ?? "").trim();
    if (!clientId) {
        return plain(400, "sender_id_required");
    }
    const conversation = await resolveOrCreateOpenChatConversation({
        channel,
        clientId,
        conversationRepository: input.conversationRepository,
        sender: input.body.sender ?? {}
    });
    if (!conversation) {
        return plain(400, "conversation_create_failed");
    }
    await repository.mergeConversationState({
        chatChannelId: channel.id,
        clientId,
        conversationId: conversation.id,
        tenantId: channel.tenantId
    });
    if (ACK_MESSAGE_TYPES.has(type) || type === "start") {
        // start resumes a stopped dialog (the conversation is already re-created
        // above); seen/typein are acknowledged without persisting a message.
        return okJson();
    }
    if (type === "stop") {
        if (conversation.status !== "closed") {
            await input.conversationService.transitionConversationStatus({
                conversationId: conversation.id,
                nextStatus: "closed",
                reason: "chat_api_stop",
                resolutionOutcome: "resolved",
                topic: conversation.topic || "Chat API"
            }, { actorType: "client", tenantId: channel.tenantId });
        }
        return okJson();
    }
    if (type === "rate") {
        const score = normalizeOpenChatRate(message.value);
        if (score !== null && conversation.operatorId && input.recordQualityRating) {
            await input.recordQualityRating({
                channel: conversation.channel,
                clientId,
                conversationId: conversation.id,
                idempotencyKey: `open-chat:${conversation.id}:${String(message.id ?? message.value)}`,
                operator: conversation.operatorId,
                scale: "CSAT",
                score,
                topic: conversation.topic
            }, { actorId: clientId, actorType: "client", tenantId: channel.tenantId });
        }
        return okJson();
    }
    const text = openChatMessageText(type, message);
    if (!text) {
        return plain(400, `message_payload_invalid:${type}`);
    }
    const eventId = String(message.id ?? "").trim() || contentEventId(channel.id, clientId, type, message);
    const isNewConversation = conversation.messages.length === 0;
    const normalized = await input.conversationService.normalizeInboundEvent("chat-api", {
        attachments: openChatMessageAttachments(type, message),
        conversationId: conversation.id,
        eventId: `${channel.tenantId}:${channel.id}:${eventId}`,
        text
    });
    if (normalized.status !== "ok") {
        return plain(400, String(normalized.error?.code ?? "message_rejected"));
    }
    const runtimeEventId = `${channel.tenantId}:${channel.id}:${eventId}`;
    const botRuntimeEvent = {
        channel: OPEN_CHAT_CHANNEL,
        conversationId: conversation.id,
        eventId: runtimeEventId,
        payload: { isNewConversation, text },
        tenantId: channel.tenantId,
        traceId: getCurrentTraceId() ?? createRequestTraceId("open-chat")
    };
    const botRuntimeQueued = Boolean(input.runBotRuntime);
    // Chat API clients have a short request timeout.  Bot generation may take
    // several seconds, so it must not delay the acknowledgement of a valid
    // inbound event.  The runtime persists its side effects independently and
    // reconciliation delivers the resulting reply to the channel callback.
    if (input.runBotRuntime) {
        void Promise.resolve()
            .then(() => input.runBotRuntime(botRuntimeEvent))
            .catch(() => undefined);
    }
    if (!botRuntimeQueued && input.botBridge) {
        await input.botBridge.forwardClientMessage({
            channel: OPEN_CHAT_CHANNEL,
            clientId,
            conversation,
            pageUrl: input.body.sender?.url,
            senderName: input.body.sender?.name,
            tenantId: channel.tenantId,
            text
        }).catch(() => undefined);
    }
    return okJson({
        botRuntime: botRuntimeQueued ? { outcome: null, status: "queued" } : null,
        duplicate: normalized.data?.duplicate === true
    });
}
export async function handleOpenChatStatus(input) {
    const repository = input.repository ?? OpenChannelRepository.default();
    const channel = await repository.findChatChannelByToken(input.channelToken);
    if (!channel || channel.status !== "active") {
        return plain(404, "channel_not_found");
    }
    const conversations = await input.conversationRepository.listConversations({
        tenantId: channel.tenantId,
        take: 100,
        messageTake: 1
    });
    const active = conversations.some((conversation) => conversation.tenantId === channel.tenantId
        && conversation.channel === OPEN_CHAT_CHANNEL
        && conversation.tags.includes(`connection:${channel.id}`)
        && conversation.status !== "closed");
    return plain(200, active ? "1" : "0");
}
export async function resolveOrCreateOpenChatConversation(input) {
    const displayName = String(input.sender.name ?? "").trim() || `Client ${input.clientId}`;
    const anchorId = openChatConversationKey(input.channel.tenantId, input.channel.id, input.clientId);
    const resolved = await resolveOrForkAppealConversation({
        anchorId,
        conversationRepository: input.conversationRepository,
        // The compat channel id intentionally stays out of channelConnectionId:
        // that column is FK-bound to the platform channel_connections table in the
        // Prisma profile. The link lives in the connection:<id> tag and the
        // open-channel conversation state instead.
        createInitial: () => ({
            channel: OPEN_CHAT_CHANNEL,
            clientSince: new Date().toISOString().slice(0, 10),
            device: "Chat API",
            entry: "Chat API",
            id: anchorId,
            initials: initials(displayName),
            language: "Unknown",
            messages: [],
            name: displayName,
            // Без телефона в профиле отправителя поле остается пустым: clientId —
            // не телефон, адресация ответов держится на providerConversationId и теге external:*.
            phone: String(input.sender.phone ?? "").trim(),
            preview: "",
            previous: [],
            providerConversationId: input.clientId,
            providerUserId: input.clientId,
            ...(input.channel.routingQueueId ? { queueId: input.channel.routingQueueId } : {}),
            sla: "Active",
            slaTone: "ok",
            status: "active",
            tags: compact([
                "chat-api",
                `connection:${input.channel.id}`,
                `external:${input.clientId}`,
                input.sender.email ? `email:${String(input.sender.email).trim()}` : "",
                input.sender.url ? `page:${String(input.sender.url).trim()}` : ""
            ]),
            tenantId: input.channel.tenantId,
            time: "now",
            topic: String(input.sender.intent ?? "").trim() || "Chat API"
        }),
        createMutation: (conversation, eventType = "conversation.created") => openChatConversationMutation(conversation, eventType),
        providerConversationId: input.clientId,
        tenantId: input.channel.tenantId
    });
    return resolved?.conversation ?? null;
}
export function openChatConversationKey(tenantId, channelId, clientId) {
    const digest = createHash("sha256").update(`${tenantId}\0${channelId}\0${clientId}`).digest("base64url").slice(0, 32);
    return `openchat_${digest}`;
}
/** Renders any inbound Chat API message into the plain-text dialog transcript. */
export function openChatMessageText(type, message) {
    if (type === "text") {
        return String(message.text ?? "").trim();
    }
    if (MEDIA_MESSAGE_TYPES.has(type)) {
        const file = String(message.file ?? "").trim();
        if (!file)
            return "";
        return [String(message.text ?? "").trim(), file].filter(Boolean).join("\n");
    }
    if (type === "location") {
        const latitude = Number(message.latitude);
        const longitude = Number(message.longitude);
        if (!isFiniteInRange(latitude, -90, 90) || !isFiniteInRange(longitude, -180, 180))
            return "";
        return [String(message.text ?? "").trim(), `Location: ${latitude},${longitude}`].filter(Boolean).join("\n");
    }
    if (type === "keyboard") {
        // A keyboard event from the client carries the selected key(s).
        const selected = (message.keyboard ?? [])
            .map((key) => String(key.text ?? key.id ?? "").trim())
            .filter(Boolean);
        return selected.join(", ");
    }
    return "";
}
export function openChatMessageAttachments(type, message) {
    if (!MEDIA_MESSAGE_TYPES.has(type))
        return [];
    return [{
            ...(message.file ? { file: message.file } : {}),
            ...(message.file_name ? { fileName: message.file_name } : {}),
            ...(message.file_size !== undefined ? { sizeBytes: message.file_size } : {}),
            ...(message.mime_type ? { mimeType: message.mime_type } : {}),
            ...(message.thumb ? { thumb: message.thumb } : {}),
            type
        }];
}
/** 0 → declined (null), positive → 5, negative → 1 (CSAT scale 1..5). */
export function normalizeOpenChatRate(value) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate === 0)
        return null;
    return rate > 0 ? 5 : 1;
}
/** Builds an outbound Chat API event ({sender: agent, recipient: client, message}). */
export function buildOpenChatOutboundEvent(input) {
    return {
        ...(input.operatorName ? { sender: { id: "agent", name: input.operatorName } } : {}),
        recipient: { id: input.clientId },
        message: {
            date: input.timestamp ?? Math.floor(Date.now() / 1000),
            id: input.messageId,
            text: input.text,
            type: "text"
        }
    };
}
function openChatConversationMutation(conversation, eventType = "conversation.created") {
    const occurredAt = new Date().toISOString();
    const traceId = getCurrentTraceId() ?? createRequestTraceId("integrationService", eventType);
    const realtimeEvent = {
        data: {
            channel: "chat-api",
            channelConnectionId: conversation.channelConnectionId,
            direction: "inbound",
            ...(conversation.metadata?.isRepeatAppeal ? { isRepeatAppeal: true } : {}),
            ...(conversation.queueId ? { queueId: conversation.queueId } : {})
        },
        eventId: `rt_${randomUUID()}`,
        eventName: eventType === "conversation.updated" ? "conversation.updated" : "conversation.created",
        occurredAt,
        resourceId: conversation.id,
        resourceType: "conversation",
        schemaVersion: "v1",
        tenantId: conversation.tenantId,
        traceId
    };
    const lifecycleEvent = {
        actorId: null,
        actorName: null,
        actorType: "client",
        conversationId: conversation.id,
        data: realtimeEvent.data,
        eventType,
        id: `lifecycle_${randomUUID()}`,
        ingestedAt: occurredAt,
        occurredAt,
        reason: eventType === "conversation.created" && conversation.metadata?.isRepeatAppeal ? "repeat_appeal" : null,
        schemaVersion: "conversation-lifecycle/v1",
        source: "open-channel",
        sourceEventId: realtimeEvent.eventId,
        tenantId: conversation.tenantId,
        traceId
    };
    return { conversation, lifecycleEvent, realtimeEvent };
}
function contentEventId(channelId, clientId, type, message) {
    const digest = createHash("sha256")
        .update(`${channelId}\0${clientId}\0${type}\0${JSON.stringify(message)}\0${Date.now()}`)
        .digest("hex")
        .slice(0, 24);
    return `content_${digest}`;
}
function isFiniteInRange(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}
function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
function compact(values) {
    return values.map((value) => value.trim()).filter(Boolean);
}
function okJson(extra = {}) {
    return { body: { result: "ok", ...extra }, contentType: "application/json; charset=utf-8", statusCode: 200 };
}
function plain(statusCode, body) {
    return { body, contentType: "text/plain; charset=utf-8", statusCode };
}
//# sourceMappingURL=open-chat.route.js.map