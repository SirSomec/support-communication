import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { resolveOrForkAppealConversation } from "../conversation/appeal-lifecycle.js";
import { CSAT_FEEDBACK_ACK_TEXT, conversationCsatFeedback, csatFeedbackConversationMutation, isAwaitingCsatFeedback, withCsatFeedback } from "../quality/csat-feedback.js";
import { AI_CLOSED_CONVERSATION_OPERATOR } from "../quality/quality.types.js";
import { resolvePublicApiRequest } from "./public-api-auth.js";
const INTEGRATION_SERVICE = "integrationService";
const VISITOR_TOKEN_TTL_SECONDS = 60 * 15;
export async function resolveOrCreatePublicSdkConversation(input) {
    return (await resolvePublicSdkInboundConversation(input)).conversation;
}
export async function resolvePublicSdkInboundConversation(input) {
    const externalId = String(input.externalId ?? "").trim();
    if (!externalId) {
        return { conversation: null, csatFeedbackAwaiting: false };
    }
    const requestedConversationId = String(input.conversationId ?? "").trim();
    if (requestedConversationId) {
        const requestedConversation = await input.conversationRepository.findConversation(requestedConversationId);
        if (requestedConversation && (resolveConversationTenantId(requestedConversation) !== input.tenantId
            || String(requestedConversation.providerConversationId ?? "").trim() !== externalId)) {
            return { conversation: null, csatFeedbackAwaiting: false };
        }
    }
    const anchorId = `sdk_${createHash("sha256")
        .update(`${input.tenantId}:${externalId}`)
        .digest("hex")
        .slice(0, 24)}`;
    const resolved = await resolveOrForkAppealConversation({
        anchorId,
        conversationRepository: input.conversationRepository,
        interceptCsatFeedback: true,
        createInitial: () => ({
            channel: "SDK",
            clientSince: new Date().toISOString().slice(0, 10),
            device: "Web",
            entry: "SDK",
            id: anchorId,
            initials: initialsFromExternalId(externalId),
            language: "Unknown",
            messages: [],
            name: `Visitor ${externalId}`,
            // Виджет не знает телефона посетителя: поле остается пустым для ручного
            // заполнения оператором, а externalId живет в providerConversationId и теге external:*.
            phone: "",
            preview: "",
            previous: [],
            providerConversationId: externalId,
            ...(input.queueId?.trim() ? { queueId: input.queueId.trim() } : {}),
            sla: "Active",
            slaTone: "ok",
            status: "active",
            tags: compactTags(["sdk", `external:${externalId}`, input.pageUrl ? `page:${input.pageUrl}` : ""]),
            tenantId: input.tenantId,
            time: "now",
            topic: "SDK / Web widget",
            updatedAt: new Date().toISOString()
        }),
        createMutation: (conversation, eventType = "conversation.created") => conversationCreatedMutation(conversation, "sdk", eventType),
        providerConversationId: externalId,
        tenantId: input.tenantId
    });
    return {
        conversation: resolved?.conversation ?? null,
        csatFeedbackAwaiting: Boolean(resolved?.csatFeedbackAwaiting)
    };
}
function conversationCreatedMutation(conversation, channel, eventType = "conversation.created") {
    const occurredAt = new Date().toISOString();
    const traceId = getCurrentTraceId() ?? createRequestTraceId(INTEGRATION_SERVICE, eventType);
    const realtimeEvent = {
        data: {
            channel,
            direction: "inbound",
            ...(conversation.metadata?.isRepeatAppeal ? { isRepeatAppeal: true } : {}),
            ...(conversation.metadata?.parentConversationId ? { parentConversationId: conversation.metadata.parentConversationId } : {}),
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
        source: "integration-service",
        sourceEventId: realtimeEvent.eventId,
        tenantId: conversation.tenantId,
        traceId
    };
    return { conversation, lifecycleEvent, realtimeEvent };
}
export async function handlePublicSdkMessageIngressFromRoute(input) {
    const auth = await resolvePublicApiRequest({
        authorization: input.authorization,
        environment: input.environment,
        lookup: input.lookup,
        requiredScope: "conversations:write"
    });
    if (!auth.allowed) {
        return deniedEnvelope("sendPublicSdkMessage", auth.code, publicApiAuthMessage(auth.code), {
            conversationId: null
        });
    }
    const text = String(input.body.text ?? "").trim();
    const attachments = normalizePublicSdkAttachments(input.body.attachments);
    if (!text && !attachments.length) {
        return invalidEnvelope("sendPublicSdkMessage", "message_content_required", "Inbound message text or attachment is required.", {
            conversationId: input.body.conversationId ?? null
        });
    }
    const queueId = input.resolveQueueId
        ? await input.resolveQueueId(auth.context.tenantId, auth.context.channelConnectionId)
        : undefined;
    if (input.resolveQueueId && !queueId) {
        return deniedEnvelope("sendPublicSdkMessage", "sdk_routing_queue_unresolved", "The API key is not linked to an active SDK connection and routing queue.", { keyId: auth.context.keyId });
    }
    const resolved = await resolvePublicSdkInboundConversation({
        conversationId: input.body.conversationId,
        conversationRepository: input.conversationRepository,
        externalId: input.body.externalId,
        pageUrl: input.body.pageUrl,
        queueId,
        tenantId: auth.context.tenantId
    });
    const conversation = resolved.conversation;
    if (!conversation) {
        return deniedEnvelope("sendPublicSdkMessage", "sdk_conversation_tenant_mismatch", "Conversation does not belong to the authenticated tenant.", { conversationId: input.body.conversationId ?? null });
    }
    const isNewConversation = conversation.messages.length === 0;
    const csatFeedback = resolved.csatFeedbackAwaiting;
    const eventId = `sdk_evt_${randomUUID()}`;
    const normalized = await input.conversationService.normalizeInboundEvent("sdk", {
        conversationId: conversation.id,
        csatFeedback,
        eventId,
        text,
        attachments
    });
    const normalizedMessage = normalized.data?.message;
    const messageId = normalizedMessage?.id ? String(normalizedMessage.id) : null;
    // Отзыв к CSAT-оценке не конвертирует проактивные показы, не будит бота и
    // не назначает оператора: обращение остается закрытым.
    const proactiveConversion = normalized.status === "ok" && !csatFeedback && input.recordProactiveConversion
        ? await input.recordProactiveConversion.recordMessageConversion({ conversationId: conversation.id, messageId,
            occurredAt: new Date().toISOString(), tenantId: auth.context.tenantId })
        : null;
    const botRuntime = normalized.status === "ok" && !csatFeedback && input.runBotRuntime
        ? await tryBotRuntime(input.runBotRuntime, { channel: "SDK", conversationId: conversation.id, eventId, payload: { attachments, isNewConversation, text }, tenantId: auth.context.tenantId, traceId: normalized.traceId })
        : null;
    const needsOperator = !botRuntime || ["handoff", "dead_lettered"].includes(String(botRuntime.instance?.status ?? ""));
    const autoAssignment = normalized.status === "ok" && !csatFeedback && needsOperator && input.autoAssignConversation
        ? await tryAutoAssignment(input.autoAssignConversation, conversation.id, auth.context.tenantId)
        : null;
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation: "sendPublicSdkMessage",
        status: normalized.status === "ok" ? "ok" : normalized.status,
        meta: {
            source: "api",
            apiVersion: "v1",
            channel: "sdk",
            tenantId: auth.context.tenantId
        },
        data: {
            accepted: normalized.status === "ok",
            autoAssignment: autoAssignment?.data ?? null,
            botRuntime: botRuntime ? { outcome: botRuntime.outcome ?? null, status: botRuntime.instance?.status ?? null } : null,
            conversationId: conversation.id,
            duplicate: normalized.data?.duplicate === true,
            eventId,
            messageId,
            proactiveConversion: proactiveConversion ? { exposureId: proactiveConversion.exposureId, ruleId: proactiveConversion.ruleId,
                variant: proactiveConversion.variant } : null,
            ...(csatFeedback ? { recordedAsFeedback: normalized.status === "ok", feedbackAck: CSAT_FEEDBACK_ACK_TEXT } : {}),
            visitorSessionToken: createVisitorSessionToken({
                conversationId: conversation.id,
                tenantId: auth.context.tenantId
            })
        },
        ...(normalized.status === "ok"
            ? {}
            : {
                error: {
                    code: String(normalized.error?.code ?? "sdk_message_rejected"),
                    message: String(normalized.error?.message ?? "SDK message request was rejected.")
                }
            })
    });
}
function normalizePublicSdkAttachments(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
            return [];
        const fileId = String(item.fileId ?? "").trim();
        const fileName = String(item.fileName ?? "").trim();
        if (!fileId || !fileName)
            return [];
        const sizeBytes = Number(item.sizeBytes ?? 0);
        return [{
                id: fileId,
                fileId,
                fileName: fileName.slice(0, 255),
                mimeType: String(item.mimeType ?? "application/octet-stream").slice(0, 255),
                status: "scan_pending",
                ...(Number.isFinite(sizeBytes) && sizeBytes >= 0 ? { sizeBytes } : {})
            }];
    });
}
export async function handlePublicSdkMessagesPollFromRoute(input) {
    const auth = await resolvePublicApiRequest({
        authorization: input.authorization,
        environment: input.environment,
        lookup: input.lookup,
        requiredScope: "conversations:write"
    });
    if (!auth.allowed) {
        return deniedEnvelope("pollPublicSdkMessages", auth.code, publicApiAuthMessage(auth.code), {
            conversationId: input.conversationId
        });
    }
    const conversationId = String(input.conversationId ?? "").trim();
    const conversation = await input.conversationRepository.findConversation(conversationId);
    if (!conversation || resolveConversationTenantId(conversation) !== auth.context.tenantId) {
        return notFoundEnvelope("pollPublicSdkMessages", "conversation_not_found", `Conversation ${conversationId} was not found.`, {
            conversationId
        });
    }
    const tokenValidation = validateVisitorSessionToken(input.visitorSessionToken, {
        conversationId,
        tenantId: auth.context.tenantId
    });
    if (!tokenValidation.valid) {
        return deniedEnvelope("pollPublicSdkMessages", tokenValidation.code, "visitorSessionToken is invalid for this conversation or has expired.", { conversationId });
    }
    const since = String(input.since ?? "").trim();
    const replies = await operatorRepliesFromConversation(conversation, since, input.resolveDeliveryAttachments, auth.context.tenantId);
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation: "pollPublicSdkMessages",
        meta: {
            source: "api",
            apiVersion: "v1",
            channel: "sdk",
            conversationId
        },
        data: {
            conversationId,
            conversationStatus: conversation.status,
            count: replies.length,
            ...(publicSdkCsatSurvey(conversation) ? { csatSurvey: publicSdkCsatSurvey(conversation) } : {}),
            messages: replies,
            since: since || null,
            visitorSessionToken: createVisitorSessionToken({
                conversationId,
                tenantId: auth.context.tenantId
            })
        }
    });
}
function publicSdkCsatSurvey(conversation) {
    if (String(conversation.channel).toLowerCase() !== "sdk" || conversation.status !== "closed") {
        return null;
    }
    const feedback = conversationCsatFeedback(conversation);
    if (!feedback) {
        return { scale: "CSAT", scores: [1, 2, 3, 4, 5], state: "rating" };
    }
    if (feedback.state === "awaiting" && isAwaitingCsatFeedback(conversation)) {
        return {
            declineAvailable: true,
            prompt: "Спасибо за оценку! Оставьте комментарий следующим сообщением — мы передадим его команде.",
            state: "feedback"
        };
    }
    return { state: feedback.state };
}
export async function handlePublicSdkQualityRatingFromRoute(input) {
    const auth = await resolvePublicApiRequest({
        authorization: input.authorization,
        environment: input.environment,
        lookup: input.lookup,
        requiredScope: "conversations:write"
    });
    if (!auth.allowed) {
        return deniedEnvelope("recordPublicSdkQualityRating", auth.code, publicApiAuthMessage(auth.code), {
            accepted: false, conversationId: input.conversationId
        });
    }
    const conversationId = String(input.conversationId ?? "").trim();
    const conversation = await input.conversationRepository.findConversation(conversationId);
    if (!conversation || resolveConversationTenantId(conversation) !== auth.context.tenantId) {
        return notFoundEnvelope("recordPublicSdkQualityRating", "conversation_not_found", `Conversation ${conversationId} was not found.`, {
            accepted: false, conversationId
        });
    }
    const tokenValidation = validateVisitorSessionToken(input.body.visitorSessionToken, {
        conversationId,
        tenantId: auth.context.tenantId
    });
    if (!tokenValidation.valid) {
        return deniedEnvelope("recordPublicSdkQualityRating", tokenValidation.code, "visitorSessionToken is invalid for this conversation or has expired.", { accepted: false, conversationId });
    }
    const scale = String(input.body.scale ?? "").trim().toUpperCase();
    const score = input.body.score;
    if ((scale !== "CSAT" && scale !== "CSI") || !Number.isInteger(score) || Number(score) < 1 || Number(score) > 5) {
        return invalidEnvelope("recordPublicSdkQualityRating", "quality_rating_invalid", "scale must be CSAT or CSI and score must be an integer from 1 to 5.", { accepted: false, conversationId });
    }
    const idempotencyKey = String(input.body.idempotencyKey ?? "").trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
        return invalidEnvelope("recordPublicSdkQualityRating", "idempotency_key_invalid", "idempotencyKey is required and must not exceed 200 characters.", { accepted: false, conversationId });
    }
    // Обращение, закрытое ботом ([[RESOLVED]] AI-агента), оператора не имеет:
    // оценка засчитывается автоматике, чтобы CSAT и комментарий работали.
    const operator = String(conversation.operatorId ?? "").trim()
        || (conversation.status === "closed" ? AI_CLOSED_CONVERSATION_OPERATOR : "");
    if (!operator) {
        return invalidEnvelope("recordPublicSdkQualityRating", "quality_rating_operator_unresolved", "The conversation does not have an assigned operator.", { accepted: false, conversationId });
    }
    const clientId = publicSdkClientId(conversation);
    const recorded = await input.recordQualityRating({
        channel: conversation.channel,
        clientId,
        conversationId,
        idempotencyKey: `sdk:${conversationId}:${idempotencyKey}`,
        operator,
        scale,
        score: Number(score),
        topic: conversation.topic
    }, { actorId: clientId, actorType: "client", tenantId: auth.context.tenantId });
    // Оценка принята по закрытому обращению: блок оценки в виджете скрывается,
    // а следующее сообщение клиента станет отзывом, не открывая новое обращение.
    let feedbackOffered = false;
    if (recorded.status === "ok" && conversation.status === "closed") {
        const current = conversationCsatFeedback(conversation);
        const alreadyAwaiting = isAwaitingCsatFeedback(conversation);
        const ratingId = String(recorded.data?.ratingId ?? "") || `sdk:${conversationId}:${idempotencyKey}`;
        const updated = withCsatFeedback(conversation, {
            offeredAt: alreadyAwaiting && current ? current.offeredAt : new Date().toISOString(),
            ratingId,
            state: "awaiting"
        });
        await input.conversationRepository.saveConversationMutation(csatFeedbackConversationMutation(updated, "quality.feedback.offered", { ratingId }));
        feedbackOffered = true;
    }
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation: "recordPublicSdkQualityRating",
        status: recorded.status,
        meta: { source: "api", apiVersion: "v1", channel: "sdk", conversationId },
        data: {
            accepted: recorded.status === "ok",
            conversationId,
            feedback: { offered: feedbackOffered },
            ratingId: recorded.data?.ratingId ?? null
        },
        ...(recorded.error ? { error: recorded.error } : {})
    });
}
// Клиент не хочет оставлять отзыв («Новое обращение» в виджете): снимаем
// ожидание комментария — следующее сообщение снова откроет новое обращение.
export async function handlePublicSdkCsatFeedbackDeclineFromRoute(input) {
    const auth = await resolvePublicApiRequest({
        authorization: input.authorization,
        environment: input.environment,
        lookup: input.lookup,
        requiredScope: "conversations:write"
    });
    if (!auth.allowed) {
        return deniedEnvelope("declinePublicSdkCsatFeedback", auth.code, publicApiAuthMessage(auth.code), {
            conversationId: input.conversationId, declined: false
        });
    }
    const conversationId = String(input.conversationId ?? "").trim();
    const conversation = await input.conversationRepository.findConversation(conversationId);
    if (!conversation || resolveConversationTenantId(conversation) !== auth.context.tenantId) {
        return notFoundEnvelope("declinePublicSdkCsatFeedback", "conversation_not_found", `Conversation ${conversationId} was not found.`, {
            conversationId, declined: false
        });
    }
    const tokenValidation = validateVisitorSessionToken(input.body.visitorSessionToken, {
        conversationId,
        tenantId: auth.context.tenantId
    });
    if (!tokenValidation.valid) {
        return deniedEnvelope("declinePublicSdkCsatFeedback", tokenValidation.code, "visitorSessionToken is invalid for this conversation or has expired.", { conversationId, declined: false });
    }
    let declined = false;
    if (isAwaitingCsatFeedback(conversation)) {
        const current = conversationCsatFeedback(conversation);
        const updated = withCsatFeedback(conversation, {
            offeredAt: current?.offeredAt ?? new Date().toISOString(),
            ratingId: current?.ratingId ?? "",
            state: "declined"
        });
        await input.conversationRepository.saveConversationMutation(csatFeedbackConversationMutation(updated, "quality.feedback.declined", { ratingId: current?.ratingId ?? null }));
        declined = true;
    }
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation: "declinePublicSdkCsatFeedback",
        meta: { source: "api", apiVersion: "v1", channel: "sdk", conversationId },
        data: { conversationId, declined }
    });
}
async function tryBotRuntime(run, event) {
    try {
        return await run(event);
    }
    catch {
        return null;
    }
}
async function operatorRepliesFromConversation(conversation, since, resolveDeliveryAttachments, tenantId) {
    const agentReplies = conversation.messages.filter((message) => message.side === "agent" && message.type !== "internal");
    const startIndex = since ? agentReplies.findIndex((message) => String(message.id) === since) : -1;
    const slice = startIndex >= 0 ? agentReplies.slice(startIndex + 1) : agentReplies;
    return Promise.all(slice.map((message) => toPublicReplyRecord(message, resolveDeliveryAttachments, tenantId)));
}
async function toPublicReplyRecord(message, resolveDeliveryAttachments, tenantId) {
    const attachments = Array.isArray(message.attachments) && message.attachments.length && resolveDeliveryAttachments
        ? await resolveDeliveryAttachments(message.attachments, tenantId)
        : [];
    return {
        id: String(message.id),
        text: message.text,
        time: message.time,
        ...(attachments.length ? { attachments: attachments.map(toPublicAttachmentRecord) } : {})
    };
}
function toPublicAttachmentRecord(attachment) {
    const signedFile = attachment.signedFile && typeof attachment.signedFile === "object" && !Array.isArray(attachment.signedFile)
        ? attachment.signedFile
        : {};
    return {
        download: {
            expiresAt: String(signedFile.expiresAt ?? ""),
            url: String(signedFile.url ?? "")
        },
        fileId: String(attachment.fileId ?? ""),
        fileName: String(attachment.fileName ?? ""),
        mimeType: String(attachment.mimeType ?? ""),
        sizeBytes: Number(attachment.sizeBytes ?? 0)
    };
}
export function createVisitorSessionToken(payload) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const body = {
        conversationId: payload.conversationId,
        exp: nowSeconds + VISITOR_TOKEN_TTL_SECONDS,
        tenantId: payload.tenantId
    };
    const encodedBody = encodeBase64Url(JSON.stringify(body));
    const signature = signVisitorToken(encodedBody);
    return `${encodedBody}.${signature}`;
}
export function validateVisitorSessionToken(token, expected) {
    const value = String(token ?? "").trim();
    if (!value) {
        return { valid: false, code: "visitor_session_token_required" };
    }
    const [encodedBody, encodedSignature] = value.split(".");
    if (!encodedBody || !encodedSignature) {
        return { valid: false, code: "visitor_session_token_malformed" };
    }
    const expectedSignature = signVisitorToken(encodedBody);
    if (!safeEqualText(encodedSignature, expectedSignature)) {
        return { valid: false, code: "visitor_session_token_invalid" };
    }
    const parsed = decodeVisitorTokenBody(encodedBody);
    if (!parsed) {
        return { valid: false, code: "visitor_session_token_malformed" };
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (parsed.exp <= nowSeconds) {
        return { valid: false, code: "visitor_session_token_expired" };
    }
    if (parsed.conversationId !== expected.conversationId || parsed.tenantId !== expected.tenantId) {
        return { valid: false, code: "visitor_session_token_scope_mismatch" };
    }
    return { valid: true };
}
function decodeVisitorTokenBody(encodedBody) {
    try {
        const decoded = decodeBase64Url(encodedBody);
        const parsed = JSON.parse(decoded);
        const conversationId = String(parsed.conversationId ?? "").trim();
        const tenantId = String(parsed.tenantId ?? "").trim();
        const exp = Number(parsed.exp);
        if (!conversationId || !tenantId || !Number.isFinite(exp)) {
            return null;
        }
        return {
            conversationId,
            exp,
            tenantId
        };
    }
    catch {
        return null;
    }
}
function signVisitorToken(encodedBody) {
    return encodeBase64Url(createHmac("sha256", visitorTokenSecret()).update(encodedBody).digest());
}
function visitorTokenSecret() {
    // PILOT_VISITOR_TOKEN_SECRET — устаревшее имя, поддерживается один релиз.
    const configured = String(process.env.SDK_VISITOR_TOKEN_SECRET ?? process.env.PILOT_VISITOR_TOKEN_SECRET ?? "").trim();
    if (configured) {
        return configured;
    }
    const fallback = String(process.env.DEMO_SERVICE_ADMIN_KEY ?? "").trim();
    return fallback || "sdk-visitor-session-secret";
}
function encodeBase64Url(value) {
    return Buffer.from(value).toString("base64url");
}
function decodeBase64Url(value) {
    return Buffer.from(value, "base64url").toString("utf8");
}
function safeEqualText(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function initialsFromExternalId(externalId) {
    const compact = externalId.replace(/[^a-z0-9]/gi, "");
    return (compact.slice(0, 2).toUpperCase() || "VS");
}
function compactTags(tags) {
    return tags.map((tag) => tag.trim()).filter(Boolean);
}
function resolveConversationTenantId(conversation) {
    return conversation.tenantId;
}
function publicSdkClientId(conversation) {
    const externalTag = conversation.tags.find((tag) => tag.startsWith("external:"));
    return externalTag?.slice("external:".length).trim()
        || conversation.providerConversationId?.trim()
        // phone — legacy-фолбэк: раньше externalId посетителя хранился в нем.
        || conversation.phone.trim()
        || conversation.id;
}
async function tryAutoAssignment(assign, conversationId, tenantId) {
    try {
        return await assign(conversationId, tenantId);
    }
    catch {
        return null;
    }
}
function publicApiAuthMessage(code) {
    return code === "public_api_key_required"
        ? "Bearer public API key is required."
        : code === "public_api_key_invalid"
            ? "Public API key is invalid."
            : code === "public_api_key_environment_mismatch"
                ? "Public API key is not valid for this environment."
                : "Public API key does not include the required scope.";
}
function invalidEnvelope(operation, code, message, data) {
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation,
        status: "invalid",
        meta: {
            source: "api",
            apiVersion: "v1"
        },
        data,
        error: { code, message }
    });
}
function deniedEnvelope(operation, code, message, data) {
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation,
        status: "denied",
        meta: {
            source: "api",
            apiVersion: "v1"
        },
        data,
        error: { code, message }
    });
}
function notFoundEnvelope(operation, code, message, data) {
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation,
        status: "not_found",
        meta: {
            source: "api",
            apiVersion: "v1"
        },
        data,
        error: { code, message }
    });
}
//# sourceMappingURL=public-sdk-messages.route.js.map