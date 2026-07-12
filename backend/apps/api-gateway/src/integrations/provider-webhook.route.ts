import { timingSafeEqual } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import { ProviderConnectionCrypto, type ProviderCredentialEnvelope } from "./provider-connection-crypto.js";
import type { IntegrationRepository } from "./integration.repository.js";
import { resolveOrCreateProviderConversation } from "./provider-conversation.js";
import type { ProviderMessageBindingRepository } from "./provider-message-binding.repository.js";

export interface ProviderWebhookRouteInput {
  body: Record<string, unknown>;
  channel: "MAX" | "VK";
  channelConnectionId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent" | "recordDeliveryReceipt">;
  headers?: Record<string, string | undefined>;
  integrationRepository: Pick<IntegrationRepository, "findChannelConnectionAsync" | "findProviderConnectionCredentialByConnectionIdAsync">;
  providerMessageBindings?: Pick<ProviderMessageBindingRepository, "advance" | "find">;
}

export async function handleProviderWebhookFromRoute(input: ProviderWebhookRouteInput): Promise<unknown> {
  const provider = input.channel.toLowerCase();
  const credential = await input.integrationRepository.findProviderConnectionCredentialByConnectionIdAsync(input.channelConnectionId);
  if (!credential || credential.provider !== provider || credential.status !== "active") return denied("provider_connection_not_found");
  const connection = await input.integrationRepository.findChannelConnectionAsync(credential.tenantId, credential.channelConnectionId);
  if (!connection || connection.status !== "active") return denied("provider_connection_disabled");

  let crypto: ProviderConnectionCrypto;
  try {
    crypto = ProviderConnectionCrypto.fromEnvironment(credential.keyVersion);
  } catch {
    return denied("provider_credential_key_unavailable");
  }
  let webhookSecret: string;
  try {
    webhookSecret = crypto.decrypt(JSON.parse(credential.webhookSecretEncrypted) as ProviderCredentialEnvelope);
  } catch {
    return denied("provider_webhook_secret_unavailable");
  }

  if (input.channel === "VK") {
    if (!safeEqual(String(input.body.secret ?? ""), webhookSecret)) return denied("provider_webhook_secret_mismatch");
    if (input.body.type === "confirmation") {
      if (!credential.confirmationCodeEncrypted) return denied("vk_confirmation_code_missing");
      try { return crypto.decrypt(JSON.parse(credential.confirmationCodeEncrypted) as ProviderCredentialEnvelope); }
      catch { return denied("vk_confirmation_code_unavailable"); }
    }
  } else if (!safeEqual(String(input.headers?.["x-max-bot-api-secret"] ?? ""), webhookSecret)) {
    return denied("provider_webhook_secret_mismatch");
  }

  const receipt = parseProviderReceipt(input.channel, input.body);
  if (receipt && input.providerMessageBindings) {
    const binding = await input.providerMessageBindings.find(credential.tenantId, connection.id, receipt.providerMessageId);
    if (!binding) return accepted({ ignored: true, reason: "provider_message_binding_not_found", tenantId: credential.tenantId });
    const recorded = await input.conversationService.recordDeliveryReceipt(provider, {
      conversationId: binding.conversationId,
      idempotencyKey: `${provider}:${receipt.providerEventId}`,
      messageId: binding.internalMessageId,
      payload: { channelConnectionId: connection.id, providerMessageId: receipt.providerMessageId },
      provider,
      providerEventId: receipt.providerEventId,
      status: receipt.status,
      tenantId: credential.tenantId
    }, { tenantId: credential.tenantId });
    if (recorded.status === "ok") await input.providerMessageBindings.advance(binding, receipt.status);
    return accepted({ conversationId: binding.conversationId, duplicate: Boolean(recorded.data?.duplicate), messageId: binding.internalMessageId, status: receipt.status, tenantId: credential.tenantId });
  }

  const event = input.channel === "VK" ? parseVkMessage(input.body) : parseMaxMessage(input.body);
  if (!event) return accepted({ ignored: true, tenantId: credential.tenantId });
  const conversation = await resolveOrCreateProviderConversation({
    channel: input.channel,
    channelConnectionId: connection.id,
    conversationRepository: input.conversationRepository,
    displayName: event.displayName,
    providerConversationId: event.providerConversationId,
    providerUserId: event.providerUserId,
    queueId: connection.routingQueueId,
    tenantId: credential.tenantId
  });
  if (!conversation) return denied("provider_conversation_create_failed");
  const normalized = await input.conversationService.normalizeInboundEvent(provider, {
    attachments: event.attachments,
    conversationId: conversation.id,
    eventId: `${credential.tenantId}:${connection.id}:${event.eventId}`,
    text: event.text
  });
  return accepted({
    conversationId: conversation.id,
    duplicate: Boolean(normalized.data?.duplicate),
    messageId: record(normalized.data?.message)?.id ?? null,
    tenantId: credential.tenantId
  });
}

interface ProviderInboundMessage {
  attachments: Array<Record<string, unknown>>;
  displayName: string;
  eventId: string;
  providerConversationId: string;
  providerUserId: string;
  text: string;
}

function parseProviderReceipt(channel: "MAX" | "VK", body: Record<string, unknown>): { providerEventId: string; providerMessageId: string; status: string } | null {
  const rawType = value(channel === "VK" ? body.type : body.update_type).toLowerCase();
  const statuses: Record<string, string> = {
    message_delivered: "delivered",
    message_failed: "failed",
    message_read: "read"
  };
  const status = statuses[rawType];
  if (!status) return null;
  const object = record(body.object) ?? record(body.message) ?? body;
  const messageBody = record(object.body);
  const providerMessageId = value(object.message_id ?? object.id ?? object.conversation_message_id ?? messageBody?.mid);
  if (!providerMessageId) return null;
  return {
    providerEventId: value(body.event_id) || `${rawType}:${providerMessageId}:${value(body.timestamp) || "event"}`,
    providerMessageId,
    status
  };
}

function parseVkMessage(body: Record<string, unknown>): ProviderInboundMessage | null {
  if (body.type !== "message_new") return null;
  const object = record(body.object);
  const message = record(object?.message);
  const peerId = value(message?.peer_id);
  const userId = value(message?.from_id);
  const eventId = value(body.event_id) || value(message?.id);
  if (!peerId || !userId || !eventId) return null;
  return {
    attachments: normalizeAttachments(message?.attachments),
    displayName: `VK ${userId}`,
    eventId,
    providerConversationId: peerId,
    providerUserId: userId,
    text: value(message?.text)
  };
}

function parseMaxMessage(body: Record<string, unknown>): ProviderInboundMessage | null {
  if (body.update_type !== "message_created") return null;
  const message = record(body.message);
  const sender = record(message?.sender);
  const recipient = record(message?.recipient);
  const messageBody = record(message?.body);
  const chatId = value(recipient?.chat_id) || value(recipient?.user_id);
  const userId = value(sender?.user_id);
  const eventId = value(messageBody?.mid) || value(body.timestamp);
  if (!chatId || !userId || !eventId) return null;
  return {
    attachments: normalizeAttachments(messageBody?.attachments),
    displayName: value(sender?.name) || `MAX ${userId}`,
    eventId,
    providerConversationId: chatId,
    providerUserId: userId,
    text: value(messageBody?.text)
  };
}

function normalizeAttachments(input: unknown): Array<Record<string, unknown>> {
  return Array.isArray(input) ? input.filter((item): item is Record<string, unknown> => Boolean(record(item))).map((item) => ({ ...item })) : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function value(input: unknown): string {
  return input === undefined || input === null ? "" : String(input).trim();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function accepted(data: Record<string, unknown>) {
  return createEnvelope({ service: "integrationService", operation: "receiveProviderWebhook", data, meta: { source: "provider-webhook" } });
}

function denied(code: string) {
  return createEnvelope({ service: "integrationService", operation: "receiveProviderWebhook", status: "denied", data: { accepted: false }, error: { code, message: "Provider webhook was rejected." } });
}
