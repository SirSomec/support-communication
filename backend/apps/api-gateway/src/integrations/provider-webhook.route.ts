import { timingSafeEqual } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import { ProviderConnectionCrypto, type ProviderCredentialEnvelope } from "./provider-connection-crypto.js";
import type { IntegrationRepository } from "./integration.repository.js";
import { resolveOrCreateProviderConversation } from "./provider-conversation.js";
import type { ProviderMessageBindingRepository } from "./provider-message-binding.repository.js";
import {
  conversationCsatFeedback,
  CSAT_FEEDBACK_NEW_APPEAL_BUTTON_TEXT,
  CSAT_FEEDBACK_NEW_APPEAL_CALLBACK,
  CSAT_FEEDBACK_NEW_APPEAL_TEXT,
  CSAT_FEEDBACK_PROMPT_TEXT,
  csatFeedbackConversationMutation,
  isAwaitingCsatFeedback,
  withCsatFeedback
} from "../quality/csat-feedback.js";
import { AI_CLOSED_CONVERSATION_OPERATOR } from "../quality/quality.types.js";
import type { VkUserProfileResolver } from "./vk-user-profile.js";

export interface ProviderWebhookRouteInput {
  body: Record<string, unknown>;
  channel: "MAX" | "VK";
  channelConnectionId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "appendMessage" | "normalizeInboundEvent" | "recordDeliveryReceipt">;
  headers?: Record<string, string | undefined>;
  integrationRepository: Pick<IntegrationRepository, "findChannelConnectionAsync" | "findProviderConnectionCredentialByConnectionIdAsync">;
  providerMessageBindings?: Pick<ProviderMessageBindingRepository, "advance" | "find">;
  phoneCollectionEnabled?: boolean;
  answerMaxCallback?: (input: { accessToken: string; callbackId: string; message: Record<string, unknown> }) => Promise<boolean>;
  answerVkMessageEvent?: (input: { accessToken: string; apiVersion: string | null; eventId: string; peerId: string; text: string; userId: string }) => Promise<boolean>;
  sendVkMessage?: (input: { accessToken: string; apiVersion: string | null; keyboard?: Record<string, unknown>; peerId: string; text: string }) => Promise<boolean>;
  recordQualityRating?: (payload: {
    channel?: string; clientId?: string; conversationId?: string; idempotencyKey?: string;
    operator?: string; scale?: "CSAT" | "CSI" | "QA"; score?: number; topic?: string;
  }, context: { actorId?: string; actorType?: "client"; tenantId?: string }) => Promise<{ status: string; data?: Record<string, unknown>; error?: unknown }>;
  resolveVkUserProfile?: VkUserProfileResolver;
  runBotRuntime?: (event: { channel: string; conversationId: string; eventId: string; payload?: Record<string, unknown>; tenantId: string; traceId: string }) => Promise<{ instance?: { status?: string }; outcome?: string }>;
}

export async function handleProviderWebhookFromRoute(input: ProviderWebhookRouteInput): Promise<unknown> {
  // MAX may batch webhook notifications in `updates`. Process each item with
  // the same authenticated connection rather than silently ignoring callbacks.
  if (input.channel === "MAX" && Array.isArray(input.body.updates)) {
    const updates = input.body.updates.filter((item): item is Record<string, unknown> => Boolean(record(item)));
    const results = await Promise.all(updates.map((body) => handleProviderWebhookFromRoute({ ...input, body })));
    return accepted("MAX", { accepted: true, processed: results.length });
  }
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
    if (!binding) return accepted(input.channel, { ignored: true, reason: "provider_message_binding_not_found", tenantId: credential.tenantId });
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
    return accepted(input.channel, { conversationId: binding.conversationId, duplicate: Boolean(recorded.data?.duplicate), messageId: binding.internalMessageId, status: receipt.status, tenantId: credential.tenantId });
  }

  const rating = input.channel === "MAX" ? parseMaxQualityRating(input.body) : parseVkQualityRating(input.body);
  const feedbackDecline = input.channel === "MAX" ? parseMaxCsatFeedbackDecline(input.body) : parseVkCsatFeedbackDecline(input.body);
  if (feedbackDecline) {
    const conversation = await resolveRatedConversation(
      input.conversationRepository,
      credential.tenantId,
      connection.id,
      feedbackDecline.providerConversationId,
      input.channel
    );
    if (!conversation) return denied("provider_quality_conversation_unresolved");
    let declined = false;
    if (isAwaitingCsatFeedback(conversation)) {
      const current = conversationCsatFeedback(conversation);
      const updated = withCsatFeedback(conversation, {
        offeredAt: current?.offeredAt ?? new Date().toISOString(),
        ratingId: current?.ratingId ?? "",
        state: "declined"
      });
      await input.conversationRepository.saveConversationMutation(
        csatFeedbackConversationMutation(updated, "quality.feedback.declined", { ratingId: current?.ratingId ?? null })
      );
      declined = true;
    }
    try {
      const accessToken = crypto.decrypt(JSON.parse(credential.accessTokenEncrypted) as ProviderCredentialEnvelope);
      if (input.channel === "MAX") {
        await (input.answerMaxCallback ?? answerMaxCallback)({
          accessToken,
          callbackId: feedbackDecline.callbackId,
          message: { text: CSAT_FEEDBACK_NEW_APPEAL_TEXT }
        });
      } else {
        await (input.sendVkMessage ?? sendVkMessage)({ accessToken, apiVersion: credential.apiVersion, peerId: feedbackDecline.providerConversationId, text: CSAT_FEEDBACK_NEW_APPEAL_TEXT });
        const providerUserId = "providerUserId" in feedbackDecline && typeof feedbackDecline.providerUserId === "string"
          ? feedbackDecline.providerUserId
          : "";
        if (providerUserId) {
          await (input.answerVkMessageEvent ?? answerVkMessageEvent)({
            accessToken,
            apiVersion: credential.apiVersion,
            eventId: feedbackDecline.callbackId,
            peerId: feedbackDecline.providerConversationId,
            text: "Новое обращение можно отправить сообщением в этот чат.",
            userId: providerUserId
          });
        }
      }
    } catch { /* state is durable even if a provider response is unavailable */ }
    return accepted(input.channel, { accepted: true, callbackId: feedbackDecline.callbackId, conversationId: conversation.id, declined, tenantId: credential.tenantId });
  }
  if (rating) {
    if (!input.recordQualityRating) return denied("provider_quality_not_configured");
    // A rating belongs to the closed dialog itself. Do not run the normal
    // inbound resolver here: it deliberately forks a new appeal for a closed
    // conversation that is not yet awaiting feedback.
    const conversation = await resolveRatedConversation(
      input.conversationRepository,
      credential.tenantId,
      connection.id,
      rating.providerConversationId,
      input.channel
    );
    const operator = conversation?.operatorId?.trim()
      || (conversation?.status === "closed" ? AI_CLOSED_CONVERSATION_OPERATOR : "");
    if (!conversation || !operator) return denied("provider_quality_conversation_unresolved");

    const recorded = await input.recordQualityRating({
      channel: input.channel,
      clientId: rating.providerUserId || rating.providerConversationId,
      conversationId: conversation.id,
      idempotencyKey: `${input.channel.toLowerCase()}:${connection.id}:${rating.callbackId}`,
      operator,
      scale: "CSAT",
      score: rating.score,
      topic: conversation.topic
    }, { actorId: rating.providerUserId || rating.providerConversationId, actorType: "client", tenantId: credential.tenantId });

    let feedbackPromptOffered = false;
    if (recorded.status === "ok" && conversation.status === "closed") {
      const current = conversationCsatFeedback(conversation);
      const alreadyAwaiting = isAwaitingCsatFeedback(conversation);
      const ratingId = String(recorded.data?.ratingId ?? "") || `${input.channel.toLowerCase()}:${connection.id}:${rating.callbackId}`;
      const updated = withCsatFeedback(conversation, {
        offeredAt: alreadyAwaiting && current ? current.offeredAt : new Date().toISOString(),
        ratingId,
        state: "awaiting"
      });
      await input.conversationRepository.saveConversationMutation(
        csatFeedbackConversationMutation(updated, "quality.feedback.offered", { ratingId })
      );
      if (!alreadyAwaiting) {
        const promptText = CSAT_FEEDBACK_PROMPT_TEXT;
        let answered = false;
        try {
          const accessToken = crypto.decrypt(JSON.parse(credential.accessTokenEncrypted) as ProviderCredentialEnvelope);
          if (input.channel === "MAX") {
            answered = await (input.answerMaxCallback ?? answerMaxCallback)({
              accessToken,
              callbackId: rating.callbackId,
              message: {
                attachments: [{
                  payload: { buttons: [[{
                    payload: CSAT_FEEDBACK_NEW_APPEAL_CALLBACK,
                    text: CSAT_FEEDBACK_NEW_APPEAL_BUTTON_TEXT,
                    type: "callback"
                  }]] },
                  type: "inline_keyboard"
                }],
                text: promptText
              }
            });
          } else {
            answered = await (input.sendVkMessage ?? sendVkMessage)({
              accessToken,
              apiVersion: credential.apiVersion,
              keyboard: { buttons: [[{ action: { label: CSAT_FEEDBACK_NEW_APPEAL_BUTTON_TEXT, payload: JSON.stringify({ callback: CSAT_FEEDBACK_NEW_APPEAL_CALLBACK }), type: "callback" }, color: "primary" }]], inline: true },
              peerId: rating.providerConversationId,
              text: promptText
            });
            await (input.answerVkMessageEvent ?? answerVkMessageEvent)({
              accessToken,
              apiVersion: credential.apiVersion,
              eventId: rating.callbackId,
              peerId: rating.providerConversationId,
              text: "Спасибо за оценку!",
              userId: rating.providerUserId
            });
          }
        } catch {
          // A callback acknowledgement is best-effort. Preserve the feedback
          // state and use a normal outbound message if MAX is temporarily down.
        }
        if (!answered) {
          const prompt = await input.conversationService.appendMessage({
            conversationId: conversation.id,
            idempotencyKey: `quality:csat:feedback-prompt:${conversation.id}:${ratingId}`,
            text: promptText
          }, { tenantId: credential.tenantId });
          answered = prompt.status === "ok";
        }
        feedbackPromptOffered = answered;
      }
    }
    return accepted(input.channel, {
      accepted: recorded.status === "ok",
      callbackId: rating.callbackId,
      conversationId: conversation.id,
      feedbackPromptOffered,
      ratingId: recorded.data?.ratingId ?? null,
      tenantId: credential.tenantId
    });
  }

  const event = input.channel === "VK" ? parseVkMessage(input.body) : parseMaxMessage(input.body);
  if (!event) return accepted(input.channel, { ignored: true, tenantId: credential.tenantId });
  let displayName = event.displayName;
  if (input.channel === "VK" && input.resolveVkUserProfile) {
    try {
      const accessToken = crypto.decrypt(JSON.parse(credential.accessTokenEncrypted) as ProviderCredentialEnvelope);
      const profile = await input.resolveVkUserProfile({
        accessToken,
        apiVersion: credential.apiVersion,
        userId: event.providerUserId
      });
      displayName = profile?.displayName || displayName;
    } catch {
      // Profile enrichment is optional and must not block inbound messages.
    }
  }
  const resolved = await resolveOrCreateProviderConversation({
    channel: input.channel,
    channelConnectionId: connection.id,
    conversationRepository: input.conversationRepository,
    displayName,
    interceptCsatFeedback: true,
    providerConversationId: event.providerConversationId,
    providerUserId: event.providerUserId,
    phone: event.phone,
    queueId: connection.routingQueueId,
    tenantId: credential.tenantId
  });
  const conversation = resolved?.conversation;
  if (!conversation) return denied("provider_conversation_create_failed");
  const isNewConversation = conversation.messages.length === 0;
  const runtimeEventId = `${credential.tenantId}:${connection.id}:${event.eventId}`;
  const normalized = await input.conversationService.normalizeInboundEvent(provider, {
    attachments: event.attachments,
    conversationId: conversation.id,
    eventId: runtimeEventId,
    text: event.text,
    csatFeedback: resolved.csatFeedbackAwaiting
  });
  const botRuntime = normalized.status === "ok" && !resolved.csatFeedbackAwaiting && !event.phoneShared && input.runBotRuntime
    ? await tryBotRuntime(input.runBotRuntime, {
        channel: input.channel,
        conversationId: conversation.id,
        eventId: runtimeEventId,
        payload: { isNewConversation, text: event.text },
        tenantId: credential.tenantId,
        traceId: normalized.traceId
      })
    : null;
  const phoneCollection = input.phoneCollectionEnabled === true
    && normalized.status === "ok"
    && !normalized.data?.duplicate
    && !resolved.csatFeedbackAwaiting
    && !event.phoneShared
    && !conversation.phone.trim()
    ? await input.conversationService.appendMessage({
        conversationId: conversation.id,
        idempotencyKey: `phone:request:${input.channel.toLowerCase()}:${conversation.id}`,
        text: "Чтобы мы могли найти обращения в других каналах, напишите, пожалуйста, номер телефона."
      }, { tenantId: credential.tenantId })
    : null;
  return accepted(input.channel, {
    botRuntime: botRuntime ? { outcome: botRuntime.outcome ?? null, status: botRuntime.instance?.status ?? null } : null,
    conversationId: conversation.id,
    duplicate: Boolean(normalized.data?.duplicate),
    messageId: record(normalized.data?.message)?.id ?? null,
    phoneCollectionRequested: phoneCollection?.status === "ok" && !phoneCollection.data?.duplicate,
    recordedAsFeedback: resolved.csatFeedbackAwaiting,
    tenantId: credential.tenantId
  });
}

interface ProviderInboundMessage {
  attachments: Array<Record<string, unknown>>;
  displayName: string;
  eventId: string;
  phone?: string;
  phoneShared: boolean;
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
  const text = value(message?.text);
  const phoneFromText = phoneFromMessageText(text);
  return {
    attachments: normalizeAttachments(message?.attachments),
    displayName: `VK ${userId}`,
    eventId,
    phone: value(message?.phone) || phoneFromText,
    phoneShared: Boolean(phoneFromText),
    providerConversationId: peerId,
    providerUserId: userId,
    text
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
  const text = value(messageBody?.text);
  const phoneFromText = phoneFromMessageText(text);
  return {
    attachments: normalizeAttachments(messageBody?.attachments),
    displayName: value(sender?.name) || `MAX ${userId}`,
    eventId,
    phone: value(sender?.phone) || phoneFromText,
    phoneShared: Boolean(phoneFromText),
    providerConversationId: chatId,
    providerUserId: userId,
    text
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

function phoneFromMessageText(text: string): string {
  const candidate = String(text ?? "").trim();
  const match = /^(?:(?:мой\s+)?(?:номер|телефон|phone)\s*[:\-]?\s*)?([+\d][\d\s().-]{4,24})$/iu.exec(candidate);
  if (!match) return "";
  const phone = String(match[1] ?? "").trim();
  return /^[+\d][\d\s().-]{4,24}$/.test(phone) ? phone : "";
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function accepted(channel: "MAX" | "VK", data: Record<string, unknown>) {
  // VK Callback API acknowledges every accepted notification with the literal
  // `ok`; only the `confirmation` notification above returns its confirmation
  // code. Returning a JSON payload makes VK retry an already handled event.
  if (channel === "VK") return "ok";
  return createEnvelope({ service: "integrationService", operation: "receiveProviderWebhook", data, meta: { source: "provider-webhook" } });
}

function parseMaxQualityRating(body: Record<string, unknown>): {
  callbackId: string; displayName: string; providerConversationId: string; providerUserId: string; score: number;
} | null {
  if (value(body.update_type) !== "message_callback") return null;
  const callback = record(body.callback) ?? body;
  const payload = value(callback.payload ?? callback.data ?? body.payload);
  const match = /^quality:csat:([1-5])$/i.exec(payload);
  const message = record(callback.message) ?? record(body.message);
  const sender = record(message?.sender) ?? record(callback.user) ?? record(body.user);
  const recipient = record(message?.recipient);
  const providerConversationId = value(recipient?.chat_id ?? recipient?.user_id ?? callback.chat_id ?? body.chat_id);
  const providerUserId = value(sender?.user_id ?? sender?.id ?? callback.user_id ?? body.user_id);
  const callbackId = value(callback.callback_id ?? callback.id);
  if (!match || !providerConversationId || !callbackId) return null;
  return {
    callbackId,
    displayName: value(sender?.name) || `MAX ${providerUserId || providerConversationId}`,
    providerConversationId,
    providerUserId,
    score: Number(match[1])
  };
}

function parseMaxCsatFeedbackDecline(body: Record<string, unknown>): {
  callbackId: string; providerConversationId: string;
} | null {
  if (value(body.update_type) !== "message_callback") return null;
  const callback = record(body.callback) ?? body;
  if (value(callback.payload ?? callback.data ?? body.payload) !== CSAT_FEEDBACK_NEW_APPEAL_CALLBACK) return null;
  const message = record(callback.message) ?? record(body.message);
  const recipient = record(message?.recipient);
  const providerConversationId = value(recipient?.chat_id ?? recipient?.user_id ?? callback.chat_id ?? body.chat_id);
  const callbackId = value(callback.callback_id ?? callback.id);
  return providerConversationId && callbackId ? { callbackId, providerConversationId } : null;
}

function parseVkQualityRating(body: Record<string, unknown>): {
  callbackId: string; displayName: string; providerConversationId: string; providerUserId: string; score: number;
} | null {
  if (value(body.type) !== "message_event") return null;
  const event = record(body.object) ?? body;
  const match = /^quality:csat:([1-5])$/i.exec(vkCallbackPayload(event.payload));
  const providerConversationId = value(event.peer_id);
  const providerUserId = value(event.user_id);
  const callbackId = value(event.event_id);
  if (!match || !providerConversationId || !callbackId) return null;
  return { callbackId, displayName: `VK ${providerUserId || providerConversationId}`, providerConversationId, providerUserId, score: Number(match[1]) };
}

function parseVkCsatFeedbackDecline(body: Record<string, unknown>): { callbackId: string; providerConversationId: string; providerUserId: string } | null {
  if (value(body.type) !== "message_event") return null;
  const event = record(body.object) ?? body;
  const providerConversationId = value(event.peer_id);
  const providerUserId = value(event.user_id);
  const callbackId = value(event.event_id);
  return vkCallbackPayload(event.payload) === CSAT_FEEDBACK_NEW_APPEAL_CALLBACK && providerConversationId && callbackId
    ? { callbackId, providerConversationId, providerUserId }
    : null;
}

function vkCallbackPayload(input: unknown): string {
  const direct = record(input);
  if (direct) return value(direct.callback ?? direct.payload);
  const raw = value(input);
  try {
    const parsed = record(JSON.parse(raw));
    return value(parsed?.callback ?? parsed?.payload) || raw;
  } catch {
    return raw;
  }
}

async function resolveRatedConversation(
  repository: Pick<ConversationRepository, "listConversations">,
  tenantId: string,
  channelConnectionId: string,
  providerConversationId: string,
  channel: "MAX" | "VK"
) {
  const listed = await repository.listConversations({ tenantId, take: 100 });
  return listed
    .filter((conversation) =>
      String(conversation.channel).toLowerCase() === channel.toLowerCase()
      && String(conversation.channelConnectionId ?? "") === channelConnectionId
      && String(conversation.providerConversationId ?? "") === providerConversationId
    )
    .sort((left, right) => Date.parse(String(right.updatedAt ?? "")) - Date.parse(String(left.updatedAt ?? "")))[0] ?? null;
}

async function answerMaxCallback(input: { accessToken: string; callbackId: string; message: Record<string, unknown> }): Promise<boolean> {
  const baseUrl = String(process.env.MAX_API_BASE_URL ?? "https://platform-api2.max.ru").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/answers?callback_id=${encodeURIComponent(input.callbackId)}`;
  const response = await fetch(endpoint, {
    body: JSON.stringify({ message: input.message }),
    headers: { Authorization: input.accessToken, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(5_000)
  });
  return response.ok;
}

async function sendVkMessage(input: { accessToken: string; apiVersion: string | null; keyboard?: Record<string, unknown>; peerId: string; text: string }): Promise<boolean> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    message: input.text,
    peer_id: input.peerId,
    random_id: String(Date.now()),
    v: input.apiVersion?.trim() || "5.199"
  });
  if (input.keyboard) params.set("keyboard", JSON.stringify(input.keyboard));
  const response = await fetch("https://api.vk.com/method/messages.send", {
    body: params.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(5_000)
  });
  return response.ok;
}

async function answerVkMessageEvent(input: { accessToken: string; apiVersion: string | null; eventId: string; peerId: string; text: string; userId: string }): Promise<boolean> {
  const params = new URLSearchParams({
    access_token: input.accessToken,
    event_data: JSON.stringify({ type: "show_snackbar", text: input.text }),
    event_id: input.eventId,
    peer_id: input.peerId,
    user_id: input.userId,
    v: input.apiVersion?.trim() || "5.199"
  });
  const response = await fetch("https://api.vk.com/method/messages.sendMessageEventAnswer", {
    body: params.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(5_000)
  });
  return response.ok;
}

async function tryBotRuntime(
  run: NonNullable<ProviderWebhookRouteInput["runBotRuntime"]>,
  event: Parameters<NonNullable<ProviderWebhookRouteInput["runBotRuntime"]>>[0]
) {
  try { return await run(event); } catch { return null; }
}

function denied(code: string) {
  return createEnvelope({ service: "integrationService", operation: "receiveProviderWebhook", status: "denied", data: { accepted: false }, error: { code, message: "Provider webhook was rejected." } });
}
