import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { ConversationMessage, ConversationRecord } from "../conversation/conversation.types.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type {
  ConversationLifecycleEvent,
  ConversationRepository,
  RealtimeEvent
} from "../conversation/conversation.repository.js";
import {
  resolveOrForkAppealConversation,
  type AppealConversationMutation
} from "../conversation/appeal-lifecycle.js";
import {
  resolvePublicApiRequest,
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "./public-api-auth.js";
import type { ProactiveExposureRepository } from "../automation/proactive-exposure.repository.js";

const INTEGRATION_SERVICE = "integrationService";
const VISITOR_TOKEN_TTL_SECONDS = 60 * 15;

interface PublicSdkConversationIdentityInput {
  conversationId?: string;
  externalId?: string;
  pageUrl?: string;
  queueId?: string;
  tenantId: string;
}

export interface PublicSdkMessageRouteInput {
  autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<BackendEnvelope<Record<string, unknown>>>;
  authorization?: string;
  body: {
    conversationId?: string;
    externalId?: string;
    pageUrl?: string;
    text?: string;
  };
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  resolveQueueId?: (tenantId: string, channelConnectionId?: string | null) => Promise<string | undefined>;
  recordProactiveConversion?: Pick<ProactiveExposureRepository, "recordMessageConversion">;
  runBotRuntime?: BotRuntimeRunner;
}

type BotRuntimeRunner = (event: { channel: string; conversationId: string; eventId: string; payload?: Record<string, unknown>; tenantId: string; traceId: string }) => Promise<{ instance?: { status?: string }; outcome?: string }>;

export interface PublicSdkPollRouteInput {
  authorization?: string;
  conversationId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation">;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  resolveDeliveryAttachments?: (
    attachments: Array<Record<string, unknown>>,
    tenantId: string
  ) => Promise<Array<Record<string, unknown>>>;
  since?: string;
  visitorSessionToken?: string;
}

export interface PublicSdkRatingRouteInput {
  authorization?: string;
  body: { idempotencyKey?: string; scale?: "CSAT" | "CSI"; score?: number; visitorSessionToken?: string };
  conversationId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation">;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  recordQualityRating: (payload: {
    channel?: string; clientId?: string; conversationId?: string; idempotencyKey?: string;
    operator?: string; scale?: "CSAT" | "CSI" | "QA"; score?: number; topic?: string;
  }, context: { actorId?: string; actorType?: "client"; tenantId?: string }) => Promise<BackendEnvelope<Record<string, unknown>>>;
}

export async function resolveOrCreatePublicSdkConversation(
  input: PublicSdkConversationIdentityInput & {
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  }
): Promise<ConversationRecord | null> {
  const externalId = String(input.externalId ?? "").trim();
  if (!externalId) {
    return null;
  }

  const requestedConversationId = String(input.conversationId ?? "").trim();
  if (requestedConversationId) {
    const requestedConversation = await input.conversationRepository.findConversation(requestedConversationId);
    if (requestedConversation && (
      resolveConversationTenantId(requestedConversation) !== input.tenantId
      || String(requestedConversation.providerConversationId ?? "").trim() !== externalId
    )) {
      return null;
    }
  }
  const anchorId = `sdk_${createHash("sha256")
    .update(`${input.tenantId}:${externalId}`)
    .digest("hex")
    .slice(0, 24)}`;

  const resolved = await resolveOrForkAppealConversation({
    anchorId,
    conversationRepository: input.conversationRepository,
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
    createMutation: (conversation, eventType = "conversation.created") =>
      conversationCreatedMutation(conversation, "sdk", eventType),
    tenantId: input.tenantId
  });

  return resolved?.conversation ?? null;
}

function conversationCreatedMutation(
  conversation: ConversationRecord,
  channel: string,
  eventType: AppealConversationMutation["lifecycleEvent"]["eventType"] = "conversation.created"
): AppealConversationMutation {
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId(INTEGRATION_SERVICE, eventType);
  const realtimeEvent: RealtimeEvent = {
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
  const lifecycleEvent: ConversationLifecycleEvent = {
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

export async function handlePublicSdkMessageIngressFromRoute(
  input: PublicSdkMessageRouteInput
): Promise<BackendEnvelope<Record<string, unknown>>> {
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
  if (!text) {
    return invalidEnvelope("sendPublicSdkMessage", "message_content_required", "Inbound message text is required.", {
      conversationId: input.body.conversationId ?? null
    });
  }

  const queueId = input.resolveQueueId
    ? await input.resolveQueueId(auth.context.tenantId, auth.context.channelConnectionId)
    : undefined;
  if (input.resolveQueueId && !queueId) {
    return deniedEnvelope(
      "sendPublicSdkMessage",
      "sdk_routing_queue_unresolved",
      "The API key is not linked to an active SDK connection and routing queue.",
      { keyId: auth.context.keyId }
    );
  }

  const conversation = await resolveOrCreatePublicSdkConversation({
    conversationId: input.body.conversationId,
    conversationRepository: input.conversationRepository,
    externalId: input.body.externalId,
    pageUrl: input.body.pageUrl,
    queueId,
    tenantId: auth.context.tenantId
  });
  if (!conversation) {
    return deniedEnvelope(
      "sendPublicSdkMessage",
      "sdk_conversation_tenant_mismatch",
      "Conversation does not belong to the authenticated tenant.",
      { conversationId: input.body.conversationId ?? null }
    );
  }
  const isNewConversation = conversation.messages.length === 0;

  const eventId = `sdk_evt_${randomUUID()}`;
  const normalized = await input.conversationService.normalizeInboundEvent("sdk", {
    conversationId: conversation.id,
    eventId,
    text
  });
  const normalizedMessage = normalized.data?.message as Record<string, unknown> | null | undefined;
  const messageId = normalizedMessage?.id ? String(normalizedMessage.id) : null;
  const proactiveConversion = normalized.status === "ok" && input.recordProactiveConversion
    ? await input.recordProactiveConversion.recordMessageConversion({ conversationId: conversation.id, messageId,
      occurredAt: new Date().toISOString(), tenantId: auth.context.tenantId })
    : null;
  const botRuntime = normalized.status === "ok" && input.runBotRuntime
    ? await tryBotRuntime(input.runBotRuntime, { channel: "SDK", conversationId: conversation.id, eventId, payload: { isNewConversation, text }, tenantId: auth.context.tenantId, traceId: normalized.traceId })
    : null;
  const needsOperator = !botRuntime || ["handoff", "dead_lettered"].includes(String(botRuntime.instance?.status ?? ""));
  const autoAssignment = normalized.status === "ok" && needsOperator && input.autoAssignConversation
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

export async function handlePublicSdkMessagesPollFromRoute(
  input: PublicSdkPollRouteInput
): Promise<BackendEnvelope<Record<string, unknown>>> {
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
    return deniedEnvelope(
      "pollPublicSdkMessages",
      tokenValidation.code,
      "visitorSessionToken is invalid for this conversation or has expired.",
      { conversationId }
    );
  }

  const since = String(input.since ?? "").trim();
  const replies = await operatorRepliesFromConversation(
    conversation,
    since,
    input.resolveDeliveryAttachments,
    auth.context.tenantId
  );

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
      messages: replies,
      since: since || null,
      visitorSessionToken: createVisitorSessionToken({
        conversationId,
        tenantId: auth.context.tenantId
      })
    }
  });
}

export async function handlePublicSdkQualityRatingFromRoute(
  input: PublicSdkRatingRouteInput
): Promise<BackendEnvelope<Record<string, unknown>>> {
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
    return deniedEnvelope("recordPublicSdkQualityRating", tokenValidation.code,
      "visitorSessionToken is invalid for this conversation or has expired.", { accepted: false, conversationId });
  }

  const scale = String(input.body.scale ?? "").trim().toUpperCase();
  const score = input.body.score;
  if ((scale !== "CSAT" && scale !== "CSI") || !Number.isInteger(score) || Number(score) < 1 || Number(score) > 5) {
    return invalidEnvelope("recordPublicSdkQualityRating", "quality_rating_invalid",
      "scale must be CSAT or CSI and score must be an integer from 1 to 5.", { accepted: false, conversationId });
  }

  const idempotencyKey = String(input.body.idempotencyKey ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return invalidEnvelope("recordPublicSdkQualityRating", "idempotency_key_invalid",
      "idempotencyKey is required and must not exceed 200 characters.", { accepted: false, conversationId });
  }

  const operator = String(conversation.operatorId ?? "").trim();
  if (!operator) {
    return invalidEnvelope("recordPublicSdkQualityRating", "quality_rating_operator_unresolved",
      "The conversation does not have an assigned operator.", { accepted: false, conversationId });
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

  return createEnvelope({
    service: INTEGRATION_SERVICE,
    operation: "recordPublicSdkQualityRating",
    status: recorded.status,
    meta: { source: "api", apiVersion: "v1", channel: "sdk", conversationId },
    data: {
      accepted: recorded.status === "ok",
      conversationId,
      ratingId: recorded.data?.ratingId ?? null
    },
    ...(recorded.error ? { error: recorded.error } : {})
  });
}

async function tryBotRuntime(run: BotRuntimeRunner, event: Parameters<BotRuntimeRunner>[0]): Promise<Awaited<ReturnType<BotRuntimeRunner>> | null> {
  try { return await run(event); } catch { return null; }
}

async function operatorRepliesFromConversation(
  conversation: ConversationRecord,
  since: string,
  resolveDeliveryAttachments: PublicSdkPollRouteInput["resolveDeliveryAttachments"],
  tenantId: string
): Promise<Array<Record<string, unknown>>> {
  const agentReplies = conversation.messages.filter((message) => message.side === "agent" && message.type !== "internal");
  const startIndex = since ? agentReplies.findIndex((message) => String(message.id) === since) : -1;
  const slice = startIndex >= 0 ? agentReplies.slice(startIndex + 1) : agentReplies;
  return Promise.all(slice.map((message) => toPublicReplyRecord(message, resolveDeliveryAttachments, tenantId)));
}

async function toPublicReplyRecord(
  message: ConversationMessage,
  resolveDeliveryAttachments: PublicSdkPollRouteInput["resolveDeliveryAttachments"],
  tenantId: string
): Promise<Record<string, unknown>> {
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

function toPublicAttachmentRecord(attachment: Record<string, unknown>): Record<string, unknown> {
  const signedFile = attachment.signedFile && typeof attachment.signedFile === "object" && !Array.isArray(attachment.signedFile)
    ? attachment.signedFile as Record<string, unknown>
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

export function createVisitorSessionToken(payload: { conversationId: string; tenantId: string }): string {
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

export function validateVisitorSessionToken(
  token: string | undefined,
  expected: { conversationId: string; tenantId: string }
): { valid: true } | { valid: false; code: string } {
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

function decodeVisitorTokenBody(encodedBody: string): { conversationId: string; exp: number; tenantId: string } | null {
  try {
    const decoded = decodeBase64Url(encodedBody);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
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
  } catch {
    return null;
  }
}

function signVisitorToken(encodedBody: string): string {
  return encodeBase64Url(createHmac("sha256", visitorTokenSecret()).update(encodedBody).digest());
}

function visitorTokenSecret(): string {
  // PILOT_VISITOR_TOKEN_SECRET — устаревшее имя, поддерживается один релиз.
  const configured = String(process.env.SDK_VISITOR_TOKEN_SECRET ?? process.env.PILOT_VISITOR_TOKEN_SECRET ?? "").trim();
  if (configured) {
    return configured;
  }

  const fallback = String(process.env.DEMO_SERVICE_ADMIN_KEY ?? "").trim();
  return fallback || "sdk-visitor-session-secret";
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqualText(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function initialsFromExternalId(externalId: string): string {
  const compact = externalId.replace(/[^a-z0-9]/gi, "");
  return (compact.slice(0, 2).toUpperCase() || "VS");
}

function compactTags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

function resolveConversationTenantId(conversation: ConversationRecord): string {
  return conversation.tenantId;
}

function publicSdkClientId(conversation: ConversationRecord): string {
  const externalTag = conversation.tags.find((tag) => tag.startsWith("external:"));
  return externalTag?.slice("external:".length).trim()
    || conversation.providerConversationId?.trim()
    // phone — legacy-фолбэк: раньше externalId посетителя хранился в нем.
    || conversation.phone.trim()
    || conversation.id;
}

async function tryAutoAssignment(
  assign: NonNullable<PublicSdkMessageRouteInput["autoAssignConversation"]>,
  conversationId: string,
  tenantId: string
): Promise<BackendEnvelope<Record<string, unknown>> | null> {
  try {
    return await assign(conversationId, tenantId);
  } catch {
    return null;
  }
}

function publicApiAuthMessage(code: string): string {
  return code === "public_api_key_required"
    ? "Bearer public API key is required."
    : code === "public_api_key_invalid"
      ? "Public API key is invalid."
      : code === "public_api_key_environment_mismatch"
        ? "Public API key is not valid for this environment."
        : "Public API key does not include the required scope.";
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>) {
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

function deniedEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>) {
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

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>) {
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
