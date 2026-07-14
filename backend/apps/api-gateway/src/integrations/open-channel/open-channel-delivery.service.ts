import { writeStructuredLog } from "@support-communication/observability";
import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import type { ConversationRecord } from "../../conversation/conversation.types.js";
import {
  OpenChannelRepository,
  type OpenChannelDeliveryKind,
  type OpenChannelDeliveryRecord
} from "./open-channel.repository.js";

/**
 * Delivers queued external-integration events (event webhooks, Open Channel
 * chat events, bot events) with per-kind retry budgets that match consumer
 * expectations: chat events — up to 3 attempts spaced 3–60 s, bot events —
 * 3 s timeout with 2 retries, webhooks — best effort with retries.
 */

export interface OpenChannelDeliveryFetch {
  (url: string, init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
    signal?: AbortSignal;
  }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

export interface OpenChannelDeliveryServiceOptions {
  conversationRepository?: Pick<ConversationRepository, "findConversation" | "saveConversationMutation" | "listConversations">;
  fetcher?: OpenChannelDeliveryFetch;
  repository?: OpenChannelRepository;
  timeoutMsByKind?: Partial<Record<OpenChannelDeliveryKind, number>>;
}

export interface OpenChannelDeliveryRunResult {
  claimed: number;
  deadLettered: number;
  delivered: number;
  retryScheduled: number;
}

export const OPEN_CHANNEL_DELIVERY_DEFAULTS: Record<OpenChannelDeliveryKind, { maxAttempts: number; retryBackoffMs: number; timeoutMs: number }> = {
  bot_event: { maxAttempts: 3, retryBackoffMs: 3_000, timeoutMs: 3_000 },
  chat_event: { maxAttempts: 3, retryBackoffMs: 3_000, timeoutMs: 10_000 },
  webhook: { maxAttempts: 3, retryBackoffMs: 5_000, timeoutMs: 10_000 }
};

export class OpenChannelDeliveryService {
  private readonly conversationRepository?: OpenChannelDeliveryServiceOptions["conversationRepository"];
  private readonly fetcher: OpenChannelDeliveryFetch;
  private readonly repository: OpenChannelRepository;
  private readonly timeoutMsByKind: Partial<Record<OpenChannelDeliveryKind, number>>;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: OpenChannelDeliveryServiceOptions = {}) {
    this.conversationRepository = options.conversationRepository;
    this.fetcher = options.fetcher ?? (fetch as unknown as OpenChannelDeliveryFetch);
    this.repository = options.repository ?? OpenChannelRepository.default();
    this.timeoutMsByKind = options.timeoutMsByKind ?? {};
  }

  enqueue(input: {
    body: Record<string, unknown>;
    conversationId?: string;
    eventName: string;
    kind: OpenChannelDeliveryKind;
    tenantId: string;
    url: string;
  }): OpenChannelDeliveryRecord {
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

  start(intervalMs = 3_000): void {
    if (this.timer) return;
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

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(now = new Date().toISOString()): Promise<OpenChannelDeliveryRunResult> {
    const claimed = this.repository.claimDueDeliveries(now);
    const result: OpenChannelDeliveryRunResult = { claimed: claimed.length, deadLettered: 0, delivered: 0, retryScheduled: 0 };

    for (const delivery of claimed) {
      const outcome = await this.attempt(delivery);
      if (outcome.delivered) {
        this.repository.resolveDelivery(delivery.id, {
          responseBody: outcome.responseBody,
          status: "delivered",
          statusCode: outcome.statusCode
        });
        result.delivered += 1;
        if (outcome.responseBody) {
          await this.applyDeliveryResponse(delivery, outcome.responseBody);
        }
        continue;
      }

      const permanent = outcome.statusCode !== undefined && outcome.statusCode >= 400 && outcome.statusCode < 500;
      const exhausted = permanent || delivery.attempts >= delivery.maxAttempts;
      this.repository.resolveDelivery(delivery.id, {
        error: outcome.error,
        responseBody: outcome.responseBody,
        status: exhausted ? "dead_lettered" : "pending",
        statusCode: outcome.statusCode
      });
      if (exhausted) {
        result.deadLettered += 1;
      } else {
        result.retryScheduled += 1;
      }
    }

    return result;
  }

  private async attempt(delivery: OpenChannelDeliveryRecord): Promise<{
    delivered: boolean;
    error?: string;
    responseBody?: string;
    statusCode?: number;
  }> {
    const timeoutMs = this.timeoutMsByKind[delivery.kind] ?? OPEN_CHANNEL_DELIVERY_DEFAULTS[delivery.kind].timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(delivery.url, {
        body: JSON.stringify(delivery.body),
        headers: { "content-type": "application/json; charset=utf-8" },
        method: "POST",
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
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * The webhook consumer may enrich the dialog in the HTTP response:
   * `chat_accepted`/`chat_updated` may return contact_info, custom_data and
   * crm_link that are shown to the agent as if the visitor entered them.
   */
  private async applyDeliveryResponse(delivery: OpenChannelDeliveryRecord, responseBody: string): Promise<void> {
    if (delivery.kind !== "webhook" || !delivery.conversationId || !this.conversationRepository) return;
    if (!["chat_accepted", "chat_updated"].includes(delivery.eventName)) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseBody) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object" || String(parsed.result ?? "").toLowerCase() !== "ok") return;

    const contactInfo = asRecord(parsed.contact_info);
    const customData = Array.isArray(parsed.custom_data)
      ? parsed.custom_data.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
      : [];
    const crmLink = String(parsed.crm_link ?? "").trim();
    if (!contactInfo && !customData.length && !crmLink) return;

    const conversation = await this.conversationRepository.findConversation(delivery.conversationId);
    if (!conversation || conversation.tenantId !== delivery.tenantId) return;

    applyWebhookEnrichment(conversation, { contactInfo, crmLink, customData });
    this.repository.mergeConversationState({
      conversationId: conversation.id,
      ...(customData.length ? { customData } : {}),
      tenantId: delivery.tenantId
    });
    await persistEnrichment(this.conversationRepository, conversation, delivery.eventName);
  }
}

function applyWebhookEnrichment(conversation: ConversationRecord, input: {
  contactInfo?: Record<string, unknown>;
  crmLink: string;
  customData: Array<Record<string, unknown>>;
}): void {
  const name = String(input.contactInfo?.name ?? "").trim();
  const phone = String(input.contactInfo?.phone ?? "").trim();
  if (name) conversation.name = name;
  if (phone) conversation.phone = phone;

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

async function persistEnrichment(
  repository: NonNullable<OpenChannelDeliveryServiceOptions["conversationRepository"]>,
  conversation: ConversationRecord,
  eventName: string
): Promise<void> {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
