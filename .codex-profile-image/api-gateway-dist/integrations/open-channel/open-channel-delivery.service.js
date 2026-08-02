import { writeStructuredLog } from "@support-communication/observability";
import { OpenChannelRepository } from "./open-channel.repository.js";
import { assertOpenChannelOutboundUrlSafe } from "./outbound-url-policy.js";
export const OPEN_CHANNEL_DELIVERY_DEFAULTS = {
    bot_event: { maxAttempts: 3, retryBackoffMs: 3_000, timeoutMs: 3_000 },
    chat_event: { maxAttempts: 3, retryBackoffMs: 3_000, timeoutMs: 10_000 },
    webhook: { maxAttempts: 3, retryBackoffMs: 5_000, timeoutMs: 10_000 }
};
export class OpenChannelDeliveryService {
    conversationRepository;
    fetcher;
    repository;
    resolveHostname;
    timeoutMsByKind;
    timer = null;
    constructor(options = {}) {
        this.conversationRepository = options.conversationRepository;
        this.fetcher = options.fetcher ?? fetch;
        this.repository = options.repository ?? OpenChannelRepository.default();
        this.resolveHostname = options.resolveHostname;
        this.timeoutMsByKind = options.timeoutMsByKind ?? {};
    }
    enqueue(input) {
        const defaults = OPEN_CHANNEL_DELIVERY_DEFAULTS[input.kind];
        return this.repository.enqueueDelivery({
            body: input.body,
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
            eventName: input.eventName,
            kind: input.kind,
            maxAttempts: defaults.maxAttempts,
            retryBackoffMs: defaults.retryBackoffMs,
            tenantId: input.tenantId,
            url: input.url
        });
    }
    start(intervalMs = 3_000) {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.runOnce().catch((error) => {
                writeStructuredLog("warn", "Open channel delivery pass failed", {
                    errorMessage: error instanceof Error ? error.message : String(error),
                    operation: "openChannelDeliveryRun",
                    service: "api-gateway"
                });
            });
        }, intervalMs);
        this.timer.unref?.();
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async runOnce(now = new Date().toISOString()) {
        const claimed = await this.repository.claimDueDeliveries(now);
        const result = { claimed: claimed.length, deadLettered: 0, delivered: 0, retryScheduled: 0 };
        for (const delivery of claimed) {
            const outcome = await this.attempt(delivery);
            if (outcome.delivered) {
                await this.repository.resolveDelivery(delivery.id, {
                    responseBody: outcome.responseBody,
                    status: "delivered",
                    statusCode: outcome.statusCode
                }, delivery.updatedAt);
                result.delivered += 1;
                if (outcome.responseBody) {
                    await this.applyDeliveryResponse(delivery, outcome.responseBody);
                }
                continue;
            }
            const permanent = outcome.statusCode !== undefined && outcome.statusCode >= 400 && outcome.statusCode < 500;
            const exhausted = permanent || delivery.attempts >= delivery.maxAttempts;
            await this.repository.resolveDelivery(delivery.id, {
                error: outcome.error,
                responseBody: outcome.responseBody,
                status: exhausted ? "dead_lettered" : "pending",
                statusCode: outcome.statusCode
            }, delivery.updatedAt);
            if (exhausted) {
                result.deadLettered += 1;
            }
            else {
                result.retryScheduled += 1;
            }
        }
        return result;
    }
    async attempt(delivery) {
        const timeoutMs = this.timeoutMsByKind[delivery.kind] ?? OPEN_CHANNEL_DELIVERY_DEFAULTS[delivery.kind].timeoutMs;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const safeUrl = await assertOpenChannelOutboundUrlSafe(delivery.url, this.resolveHostname);
            const response = await this.fetcher(safeUrl, {
                body: JSON.stringify(delivery.body),
                headers: { "content-type": "application/json; charset=utf-8" },
                method: "POST",
                redirect: "manual",
                signal: controller.signal
            });
            const responseBody = await response.text().catch(() => "");
            if (!response.ok) {
                return {
                    delivered: false,
                    error: `open_channel_delivery_http_${response.status}`,
                    responseBody,
                    statusCode: response.status
                };
            }
            return { delivered: true, responseBody, statusCode: response.status };
        }
        catch (error) {
            return {
                delivered: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * The webhook consumer may enrich the dialog in the HTTP response:
     * `chat_accepted`/`chat_updated` may return contact_info, custom_data and
     * crm_link that are shown to the agent as if the visitor entered them.
     */
    async applyDeliveryResponse(delivery, responseBody) {
        if (delivery.kind !== "webhook" || !delivery.conversationId || !this.conversationRepository)
            return;
        if (!["chat_accepted", "chat_updated"].includes(delivery.eventName))
            return;
        let parsed;
        try {
            parsed = JSON.parse(responseBody);
        }
        catch {
            return;
        }
        if (!parsed || typeof parsed !== "object" || String(parsed.result ?? "").toLowerCase() !== "ok")
            return;
        const contactInfo = asRecord(parsed.contact_info);
        const customData = Array.isArray(parsed.custom_data)
            ? parsed.custom_data.filter((item) => Boolean(asRecord(item)))
            : [];
        const crmLink = String(parsed.crm_link ?? "").trim();
        if (!contactInfo && !customData.length && !crmLink)
            return;
        const conversation = await this.conversationRepository.findConversation(delivery.conversationId);
        if (!conversation || conversation.tenantId !== delivery.tenantId)
            return;
        applyWebhookEnrichment(conversation, { contactInfo, crmLink, customData });
        await this.repository.mergeConversationState({
            conversationId: conversation.id,
            ...(customData.length ? { customData } : {}),
            tenantId: delivery.tenantId
        });
        await persistEnrichment(this.conversationRepository, conversation, delivery.eventName);
    }
}
function applyWebhookEnrichment(conversation, input) {
    const name = String(input.contactInfo?.name ?? "").trim();
    const phone = String(input.contactInfo?.phone ?? "").trim();
    if (name)
        conversation.name = name;
    if (phone)
        conversation.phone = phone;
    const noteLines = [
        ...(input.contactInfo ? [`Контакты из CRM: ${[name, phone, String(input.contactInfo.email ?? "").trim()].filter(Boolean).join(", ")}`] : []),
        ...input.customData.map((field) => [field.title, field.key, field.content].map((item) => String(item ?? "").trim()).filter(Boolean).join(": ")),
        ...(input.crmLink ? [`CRM: ${input.crmLink}`] : [])
    ].filter(Boolean);
    if (noteLines.length) {
        conversation.messages.push({
            createdAt: new Date().toISOString(),
            id: `och_note_${Date.now().toString(36)}`,
            text: `Данные интеграции (webhook):\n${noteLines.join("\n")}`,
            time: "now",
            type: "event"
        });
    }
}
async function persistEnrichment(repository, conversation, eventName) {
    const occurredAt = new Date().toISOString();
    const traceId = `och-webhook-${eventName}-${Date.now().toString(36)}`;
    const eventId = `rt_och_note_${Date.now().toString(36)}`;
    await repository.saveConversationMutation({
        conversation,
        lifecycleEvent: {
            actorId: null,
            actorName: "Event webhook",
            actorType: "worker",
            conversationId: conversation.id,
            data: { source: eventName },
            eventType: "conversation.updated",
            id: `lifecycle_${eventId}`,
            ingestedAt: occurredAt,
            occurredAt,
            reason: "webhook_enrichment",
            schemaVersion: "conversation-lifecycle/v1",
            source: "open-channel",
            sourceEventId: eventId,
            tenantId: conversation.tenantId,
            traceId
        },
        realtimeEvent: {
            data: { source: eventName },
            eventId,
            eventName: "conversation.updated",
            occurredAt,
            resourceId: conversation.id,
            resourceType: "conversation",
            schemaVersion: "v1",
            tenantId: conversation.tenantId,
            traceId
        }
    });
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
//# sourceMappingURL=open-channel-delivery.service.js.map