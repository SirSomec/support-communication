import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationMessage, ConversationRecord } from "../conversation/conversation.types.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import {
  resolvePublicApiRequest,
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "./public-api-auth.js";

const INTEGRATION_SERVICE = "integrationService";
const VISITOR_TOKEN_TTL_SECONDS = 60 * 15;

interface PublicSdkConversationIdentityInput {
  conversationId?: string;
  externalId?: string;
  pageUrl?: string;
  tenantId: string;
}

export interface PublicSdkMessageRouteInput {
  authorization?: string;
  body: {
    conversationId?: string;
    externalId?: string;
    pageUrl?: string;
    text?: string;
  };
  conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
}

export interface PublicSdkPollRouteInput {
  authorization?: string;
  conversationId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation">;
  environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup;
  since?: string;
  visitorSessionToken?: string;
}

export async function resolveOrCreatePublicSdkConversation(
  input: PublicSdkConversationIdentityInput & {
    conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversation">;
  }
): Promise<ConversationRecord | null> {
  const externalId = String(input.externalId ?? "").trim();
  if (!externalId) {
    return null;
  }

  const requestedConversationId = String(input.conversationId ?? "").trim();
  const fallbackConversationId = `sdk_${createHash("sha256")
    .update(`${input.tenantId}:${externalId}`)
    .digest("hex")
    .slice(0, 24)}`;
  const conversationId = requestedConversationId || fallbackConversationId;
  const existing = await input.conversationRepository.findConversation(conversationId);
  if (existing) {
    if (resolveConversationTenantId(existing) !== input.tenantId) {
      return null;
    }
    return input.conversationRepository.saveConversation({
      ...existing,
      updatedAt: new Date().toISOString()
    });
  }

  const conversation: ConversationRecord = {
    channel: "SDK",
    clientSince: new Date().toISOString().slice(0, 10),
    device: "Web",
    entry: "SDK",
    id: conversationId,
    initials: initialsFromExternalId(externalId),
    language: "Unknown",
    messages: [],
    name: `Visitor ${externalId}`,
    phone: externalId,
    preview: "",
    previous: [],
    sla: "Active",
    slaTone: "ok",
    status: "active",
    tags: compactTags(["sdk", `external:${externalId}`, input.pageUrl ? `page:${input.pageUrl}` : ""]),
    tenantId: input.tenantId,
    time: "now",
    topic: "SDK / Web widget",
    updatedAt: new Date().toISOString()
  };

  return input.conversationRepository.saveConversation(conversation);
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

  const conversation = await resolveOrCreatePublicSdkConversation({
    conversationId: input.body.conversationId,
    conversationRepository: input.conversationRepository,
    externalId: input.body.externalId,
    pageUrl: input.body.pageUrl,
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

  const eventId = `sdk_evt_${randomUUID()}`;
  const normalized = await input.conversationService.normalizeInboundEvent("sdk", {
    conversationId: conversation.id,
    eventId,
    text
  });
  const normalizedMessage = normalized.data?.message as Record<string, unknown> | null | undefined;
  const messageId = normalizedMessage?.id ? String(normalizedMessage.id) : null;

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
      conversationId: conversation.id,
      duplicate: normalized.data?.duplicate === true,
      eventId,
      messageId,
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
  const replies = operatorRepliesFromConversation(conversation, since);

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
      count: replies.length,
      messages: replies,
      since: since || null
    }
  });
}

function operatorRepliesFromConversation(conversation: ConversationRecord, since: string): Array<Record<string, unknown>> {
  const agentReplies = conversation.messages.filter((message) => message.side === "agent" && message.type !== "internal");
  if (!since) {
    return agentReplies.map(toPublicReplyRecord);
  }

  const startIndex = agentReplies.findIndex((message) => String(message.id) === since);
  const slice = startIndex >= 0 ? agentReplies.slice(startIndex + 1) : agentReplies;
  return slice.map(toPublicReplyRecord);
}

function toPublicReplyRecord(message: ConversationMessage): Record<string, unknown> {
  return {
    id: String(message.id),
    text: message.text,
    time: message.time
  };
}

function createVisitorSessionToken(payload: { conversationId: string; tenantId: string }): string {
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

function validateVisitorSessionToken(
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
  const configured = String(process.env.PILOT_VISITOR_TOKEN_SECRET ?? "").trim();
  if (configured) {
    return configured;
  }

  const fallback = String(process.env.DEMO_SERVICE_ADMIN_KEY ?? "").trim();
  return fallback || "pilot-visitor-session-secret";
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
  return conversation.tenantId ?? "tenant-volga";
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
