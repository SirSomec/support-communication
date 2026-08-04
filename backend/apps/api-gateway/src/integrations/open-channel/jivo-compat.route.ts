import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import type { ConversationService } from "../../conversation/conversation.service.js";
import type { ExternalBotBridge } from "./external-bot.route.js";
import { handleOpenChatInbound, type OpenChatEvent, type OpenChatRouteResult } from "./open-chat.route.js";
import { OpenChannelRepository } from "./open-channel.repository.js";

/**
 * Private migration adapter for Jivo Webhooks. It is deliberately not part of
 * the public OpenAPI contract: new integrations use the neutral Open Channel
 * format, while a migrating installation may retain its current webhook body.
 */
export async function handleJivoCompatibleWebhook(input: {
  body: Record<string, unknown>;
  botBridge?: Pick<ExternalBotBridge, "forwardClientMessage" | "notifyClientRated">;
  channelToken: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent" | "transitionConversationStatus">;
  recordQualityRating?: Parameters<typeof handleOpenChatInbound>[0]["recordQualityRating"];
  repository?: OpenChannelRepository;
  runBotRuntime?: Parameters<typeof handleOpenChatInbound>[0]["runBotRuntime"];
}): Promise<OpenChatRouteResult> {
  const event = jivoWebhookToOpenChatEvent(input.body);
  if (!event) return plain(400, "jivo_webhook_payload_invalid");
  return handleOpenChatInbound({
    body: event,
    botBridge: input.botBridge,
    channelToken: input.channelToken,
    conversationRepository: input.conversationRepository,
    conversationService: input.conversationService,
    recordQualityRating: input.recordQualityRating,
    repository: input.repository,
    runBotRuntime: input.runBotRuntime
  });
}

/** Converts documented Jivo webhook fields without leaking that format into the public API. */
export function jivoWebhookToOpenChatEvent(body: Record<string, unknown>): OpenChatEvent | null {
  const eventName = text(body.event_name).toLowerCase();
  if (!eventName) return null;
  const session = record(body.session);
  const visitor = record(body.visitor);
  const client = record(body.client);
  const page = record(body.page);
  const topic = record(body.topic);
  const geoip = record(session.geoip);
  const clientId = firstText(visitor.number, visitor.id, client.id, body.client_id, body.chat_id, body.user_token);
  if (!clientId) return null;

  const messageBody = record(body.message);
  const messageText = firstText(
    messageBody.text, messageBody.content, body.message_text, body.text,
    body.offline_message, record(body.offline_message).text
  );
  const isFinished = eventName === "chat_finished" || eventName === "chat_closed";
  const isContent = eventName === "offline_message" || eventName === "client_message" || Boolean(messageText);
  const messageType = isFinished ? "stop" : isContent ? "text" : "start";

  return {
    sender: {
      ...(firstText(visitor.name, client.name, body.client_name) ? { name: firstText(visitor.name, client.name, body.client_name) } : {}),
      ...(firstText(visitor.email, client.email, body.email) ? { email: firstText(visitor.email, client.email, body.email) } : {}),
      ...(firstText(visitor.phone, client.phone, body.phone) ? { phone: firstText(visitor.phone, client.phone, body.phone) } : {}),
      ...(firstText(page.url, session.url, body.url) ? { url: firstText(page.url, session.url, body.url) } : {}),
      ...(firstText(page.title, body.page_title) ? { title: firstText(page.title, body.page_title) } : {}),
      geo: {
        ...(firstText(geoip.city) ? { city: firstText(geoip.city) } : {}),
        ...(firstText(geoip.country) ? { country: firstText(geoip.country) } : {}),
        ...(firstText(geoip.country_code) ? { countryCode: firstText(geoip.country_code) } : {}),
        ...(numberOrUndefined(geoip.latitude) !== undefined ? { latitude: numberOrUndefined(geoip.latitude) } : {}),
        ...(numberOrUndefined(geoip.longitude) !== undefined ? { longitude: numberOrUndefined(geoip.longitude) } : {}),
        ...(firstText(geoip.organization) ? { organization: firstText(geoip.organization) } : {}),
        ...(firstText(geoip.region) ? { region: firstText(geoip.region) } : {}),
        ...(firstText(geoip.region_code) ? { regionCode: firstText(geoip.region_code) } : {}),
        source: "geoip"
      },
      id: clientId,
      ...(firstText(topic.title, body.topic, page.title) ? { intent: firstText(topic.title, body.topic, page.title) } : {})
    },
    message: {
      ...(firstText(messageBody.id, body.message_id, body.offline_message_id) ? { id: firstText(messageBody.id, body.message_id, body.offline_message_id) } : {}),
      ...(messageText ? { text: messageText } : {}),
      type: messageType
    }
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function firstText(...values: unknown[]): string | undefined {
  return values.map(text).find(Boolean);
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function plain(statusCode: number, body: string): OpenChatRouteResult {
  return { body, contentType: "text/plain; charset=utf-8", statusCode };
}
