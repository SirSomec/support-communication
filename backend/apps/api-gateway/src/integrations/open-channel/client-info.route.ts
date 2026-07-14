import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import type { ConversationRecord } from "../../conversation/conversation.types.js";
import {
  resolvePublicApiRequest,
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "../public-api-auth.js";
import { resolveOrCreatePublicSdkConversation } from "../public-sdk-messages.route.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import type { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import { stableNumericId, compatWebhookEventBase } from "./open-channel-payload.js";

/**
 * Widget-facing endpoint behind sw_api.setContactInfo / setCustomData /
 * setUserToken / setClientAttributes. Stores the client card, mirrors the
 * data to the agent as a dialog event and emits the
 * `chat_updated` / `client_attribute_updated` event webhooks.
 */

export interface WidgetClientInfoBody {
  attributes?: Record<string, unknown>;
  contactInfo?: { description?: string; email?: string; name?: string; phone?: string };
  conversationId?: string;
  customData?: Array<{ content?: string; key?: string; link?: string; title?: string }>;
  externalId?: string;
  pageTitle?: string;
  pageUrl?: string;
  userToken?: string;
}

export interface WidgetClientInfoRouteInput {
  authorization?: string;
  body: WidgetClientInfoBody;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  delivery?: Pick<OpenChannelDeliveryService, "enqueue">;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  repository?: OpenChannelRepository;
}

export async function handleWidgetClientInfoFromRoute(input: WidgetClientInfoRouteInput): Promise<BackendEnvelope<Record<string, unknown>>> {
  const auth = await resolvePublicApiRequest({
    authorization: input.authorization,
    environment: input.environment,
    lookup: input.lookup,
    requiredScope: "conversations:write"
  });
  if (!auth.allowed) {
    return createEnvelope({
      service: "integrationService",
      operation: "updatePublicSdkClientInfo",
      status: "denied",
      meta: { source: "api", apiVersion: "v1" },
      data: { accepted: false },
      error: { code: auth.code, message: "Public API key was rejected." }
    });
  }

  const repository = input.repository ?? OpenChannelRepository.default();
  const conversation = await resolveOrCreatePublicSdkConversation({
    conversationId: input.body.conversationId,
    conversationRepository: input.conversationRepository,
    externalId: input.body.externalId,
    pageUrl: input.body.pageUrl,
    tenantId: auth.context.tenantId
  });
  if (!conversation) {
    return createEnvelope({
      service: "integrationService",
      operation: "updatePublicSdkClientInfo",
      status: "invalid",
      meta: { source: "api", apiVersion: "v1" },
      data: { accepted: false },
      error: { code: "external_id_required", message: "externalId is required to resolve the visitor conversation." }
    });
  }

  const contact = input.body.contactInfo ?? {};
  const customData = (input.body.customData ?? [])
    .slice(0, 10)
    .map((field) => ({
      ...(field.content ? { content: String(field.content).slice(0, 2_000) } : {}),
      ...(field.key ? { key: String(field.key).slice(0, 200) } : {}),
      ...(field.link ? { link: String(field.link).slice(0, 2_048) } : {}),
      ...(field.title ? { title: String(field.title).slice(0, 200) } : {})
    }));
  const attributes = normalizeAttributes(input.body.attributes);
  const userToken = String(input.body.userToken ?? "").trim();

  const changedContact = applyContactInfo(conversation, contact);
  const changedPage = applyPage(conversation, input.body.pageUrl, input.body.pageTitle);
  if (customData.length) {
    appendCustomDataEvent(conversation, customData);
  }

  const state = repository.mergeConversationState({
    ...(attributes ? { attributes } : {}),
    conversationId: conversation.id,
    ...(customData.length ? { customData } : {}),
    tenantId: auth.context.tenantId,
    ...(userToken ? { userToken } : {})
  });

  if (changedContact || changedPage || customData.length) {
    await persistClientInfoMutation(input.conversationRepository, conversation);
  }

  if (input.delivery) {
    const widgetId = conversation.channelConnectionId ?? conversation.channel.toLowerCase();
    if (changedContact || customData.length) {
      for (const subscription of repository.listActiveWebhookSubscriptionsForEvent(auth.context.tenantId, "chat_updated")) {
        input.delivery.enqueue({
          body: {
            ...compatWebhookEventBase("chat_updated", conversation, state, widgetId),
            analytics: {}
          },
          conversationId: conversation.id,
          eventName: "chat_updated",
          kind: "webhook",
          tenantId: auth.context.tenantId,
          url: subscription.url
        });
      }
    }
    if (attributes) {
      for (const subscription of repository.listActiveWebhookSubscriptionsForEvent(auth.context.tenantId, "client_attribute_updated")) {
        input.delivery.enqueue({
          body: {
            attributes,
            client_id: stableNumericId(String(input.body.externalId ?? conversation.id)),
            event_name: "client_attribute_updated",
            user_token: state.userToken ?? null,
            widget_id: widgetId
          },
          conversationId: conversation.id,
          eventName: "client_attribute_updated",
          kind: "webhook",
          tenantId: auth.context.tenantId,
          url: subscription.url
        });
      }
    }
  }

  return createEnvelope({
    service: "integrationService",
    operation: "updatePublicSdkClientInfo",
    meta: { source: "api", apiVersion: "v1", channel: "sdk", tenantId: auth.context.tenantId },
    data: {
      accepted: true,
      conversationId: conversation.id,
      visitorNumber: stableNumericId(String(input.body.externalId ?? conversation.id))
    }
  });
}

export async function handleAgentsOnlineStatus(input: {
  authorization?: string;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  resolveAgentsOnline: (tenantId: string) => Promise<boolean> | boolean;
}): Promise<BackendEnvelope<Record<string, unknown>>> {
  const auth = await resolvePublicApiRequest({
    authorization: input.authorization,
    environment: input.environment,
    lookup: input.lookup,
    requiredScope: "conversations:write"
  });
  if (!auth.allowed) {
    return createEnvelope({
      service: "integrationService",
      operation: "fetchCompatAgentsOnline",
      status: "denied",
      meta: { source: "api", apiVersion: "v1" },
      data: { agentsOnline: false },
      error: { code: auth.code, message: "Public API key was rejected." }
    });
  }

  let agentsOnline = false;
  try {
    agentsOnline = Boolean(await input.resolveAgentsOnline(auth.context.tenantId));
  } catch {
    agentsOnline = false;
  }

  return createEnvelope({
    service: "integrationService",
    operation: "fetchCompatAgentsOnline",
    meta: { source: "api", apiVersion: "v1", tenantId: auth.context.tenantId },
    data: { agentsOnline }
  });
}

function applyContactInfo(conversation: ConversationRecord, contact: NonNullable<WidgetClientInfoBody["contactInfo"]>): boolean {
  let changed = false;
  const name = String(contact.name ?? "").trim();
  const phone = String(contact.phone ?? "").trim();
  const email = String(contact.email ?? "").trim();
  if (name && conversation.name !== name) {
    conversation.name = name;
    changed = true;
  }
  if (phone && conversation.phone !== phone) {
    conversation.phone = phone;
    changed = true;
  }
  if (email) {
    const tag = `email:${email}`;
    if (!conversation.tags.includes(tag)) {
      conversation.tags = [...conversation.tags.filter((item) => !item.startsWith("email:")), tag];
      changed = true;
    }
  }
  const description = String(contact.description ?? "").trim();
  if (description) {
    conversation.messages.push({
      createdAt: new Date().toISOString(),
      id: `och_contact_${Date.now().toString(36)}`,
      text: `Клиент оставил данные: ${[name, phone, email].filter(Boolean).join(", ")}${description ? `\n${description}` : ""}`,
      time: "now",
      type: "event"
    });
    changed = true;
  }
  return changed;
}

function applyPage(conversation: ConversationRecord, pageUrl?: string, pageTitle?: string): boolean {
  const url = String(pageUrl ?? "").trim();
  if (!url) return false;
  const tag = `page:${url}`;
  if (conversation.tags.includes(tag)) return false;
  conversation.tags = [...conversation.tags.filter((item) => !item.startsWith("page:")), tag];
  void pageTitle;
  return true;
}

function appendCustomDataEvent(conversation: ConversationRecord, customData: Array<Record<string, unknown>>): void {
  const lines = customData
    .map((field) => [field.title, field.key, field.content, field.link].map((item) => String(item ?? "").trim()).filter(Boolean).join(": "))
    .filter(Boolean);
  if (!lines.length) return;
  conversation.messages.push({
    createdAt: new Date().toISOString(),
    id: `och_custom_${Date.now().toString(36)}`,
    text: `Данные с сайта (custom data):\n${lines.join("\n")}`,
    time: "now",
    type: "event"
  });
}

function normalizeAttributes(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const entries = Object.entries(input)
    .filter(([key]) => String(key).trim())
    .slice(0, 50)
    .map(([key, value]) => [String(key).trim().slice(0, 100), typeof value === "number" ? value : String(value ?? "").slice(0, 500)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

async function persistClientInfoMutation(
  repository: Pick<ConversationRepository, "saveConversationMutation">,
  conversation: ConversationRecord
): Promise<void> {
  const occurredAt = new Date().toISOString();
  const eventId = `rt_och_client_info_${Date.now().toString(36)}`;
  const traceId = `och-client-info-${Date.now().toString(36)}`;
  await repository.saveConversationMutation({
    conversation,
    lifecycleEvent: {
      actorId: null,
      actorName: null,
      actorType: "client",
      conversationId: conversation.id,
      data: { source: "open-channel-client-info" },
      eventType: "conversation.updated",
      id: `lifecycle_${eventId}`,
      ingestedAt: occurredAt,
      occurredAt,
      reason: "client_info_updated",
      schemaVersion: "conversation-lifecycle/v1",
      source: "open-channel",
      sourceEventId: eventId,
      tenantId: conversation.tenantId,
      traceId
    },
    realtimeEvent: {
      data: { source: "open-channel-client-info" },
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
