import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { randomUUID } from "node:crypto";
import { TenantOperatorAuthGuard } from "../../identity/tenant-operator-auth.guard.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../../identity/tenant-operator-auth.js";
import {
  createOpenChannelToken,
  OpenChannelRepository,
  type ExternalBotConnectionRecord,
  type OpenChatChannelRecord,
  type OpenChannelRecordStatus,
  type EventWebhookSubscriptionRecord
} from "./open-channel.repository.js";
import { normalizeOpenChannelOutboundUrl } from "./outbound-url-policy.js";

/**
 * Tenant-operator management API for external integrations: Open Channel
 * chat channels (issues the inbound token URL), external bot-provider
 * connections and event webhook subscriptions.
 */

const SUPPORTED_WEBHOOK_EVENTS = ["chat_accepted", "chat_updated", "chat_finished", "client_attribute_updated", "offline_message"];

@ApiTags("open-channel")
@ApiBearerAuth()
@Controller("integrations/external")
@UseGuards(TenantOperatorAuthGuard)
export class OpenChannelAdminController {
  private readonly repository = OpenChannelRepository.default();

  // --- Chat API channels ---

  @Get("chat-channels")
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({ operationId: "listOpenChatChannels", summary: "List Open Channel chat channels" })
  async listChatChannels(@Req() request: TenantOperatorRequest) {
    const tenantId = requestTenantId(request);
    return ok("listOpenChatChannels", {
      items: (await this.repository.listChatChannels(tenantId)).map((channel) => publicChatChannel(channel))
    });
  }

  @Post("chat-channels")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createOpenChatChannel", summary: "Create an Open Channel chat channel" })
  async createChatChannel(
    @Req() request: TenantOperatorRequest,
    @Body() payload: { name?: string; outboundUrl?: string; routingQueueId?: string } = {}
  ) {
    const tenantId = requestTenantId(request);
    const outboundUrl = optionalHttpUrl(payload.outboundUrl);
    if (payload.outboundUrl && !outboundUrl) {
      return invalid("createOpenChatChannel", "outbound_url_invalid", "outboundUrl must be an http(s) URL.");
    }
    const now = new Date().toISOString();
    const channel: OpenChatChannelRecord = {
      createdAt: now,
      id: `och_${randomUUID()}`,
      name: String(payload.name ?? "").trim() || "Chat API",
      outboundUrl: outboundUrl ?? "",
      ...(String(payload.routingQueueId ?? "").trim() ? { routingQueueId: String(payload.routingQueueId).trim() } : {}),
      status: "active",
      tenantId,
      token: createOpenChannelToken("oc"),
      updatedAt: now
    };
    await this.repository.saveChatChannel(channel);
    return ok("createOpenChatChannel", { channel: publicChatChannel(channel, true) });
  }

  @Patch("chat-channels/:id")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "updateOpenChatChannel", summary: "Update an Open Channel chat channel" })
  async updateChatChannel(
    @Req() request: TenantOperatorRequest,
    @Param("id") id: string,
    @Body() payload: { name?: string; outboundUrl?: string; routingQueueId?: string; rotateToken?: boolean; status?: string } = {}
  ) {
    const tenantId = requestTenantId(request);
    const existing = await this.repository.findChatChannel(tenantId, id);
    if (!existing) {
      return notFound("updateOpenChatChannel", "open_chat_channel_not_found");
    }
    const outboundUrl = optionalHttpUrl(payload.outboundUrl);
    if (payload.outboundUrl && !outboundUrl) {
      return invalid("updateOpenChatChannel", "outbound_url_invalid", "outboundUrl must be an http(s) URL.");
    }
    const status = normalizeStatus(payload.status) ?? existing.status;
    const updated: OpenChatChannelRecord = {
      ...existing,
      name: String(payload.name ?? "").trim() || existing.name,
      outboundUrl: payload.outboundUrl === undefined ? existing.outboundUrl : (outboundUrl ?? ""),
      ...(String(payload.routingQueueId ?? "").trim() ? { routingQueueId: String(payload.routingQueueId).trim() } : existing.routingQueueId ? { routingQueueId: existing.routingQueueId } : {}),
      status,
      token: payload.rotateToken === true ? createOpenChannelToken("oc") : existing.token,
      updatedAt: new Date().toISOString()
    };
    await this.repository.saveChatChannel(updated);
    return ok("updateOpenChatChannel", { channel: publicChatChannel(updated, payload.rotateToken === true) });
  }

  @Delete("chat-channels/:id")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deleteOpenChatChannel", summary: "Delete an Open Channel chat channel" })
  async deleteChatChannel(@Req() request: TenantOperatorRequest, @Param("id") id: string) {
    const removed = await this.repository.removeChatChannel(requestTenantId(request), id);
    return removed ? ok("deleteOpenChatChannel", { removed: true }) : notFound("deleteOpenChatChannel", "open_chat_channel_not_found");
  }

  // --- Bot connections ---

  @Get("bot-connections")
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({ operationId: "listExternalBotConnections", summary: "List external bot connections" })
  async listBotConnections(@Req() request: TenantOperatorRequest) {
    return ok("listExternalBotConnections", {
      items: (await this.repository.listBotConnections(requestTenantId(request))).map((connection) => publicBotConnection(connection))
    });
  }

  @Post("bot-connections")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createExternalBotConnection", summary: "Connect an external bot provider" })
  async createBotConnection(
    @Req() request: TenantOperatorRequest,
    @Body() payload: { channels?: string[]; name?: string; providerUrl?: string; token?: string } = {}
  ) {
    const tenantId = requestTenantId(request);
    const providerUrl = optionalHttpUrl(payload.providerUrl);
    if (!providerUrl) {
      return invalid("createExternalBotConnection", "provider_url_required", "providerUrl must be an http(s) URL.");
    }
    const token = String(payload.token ?? "").trim() || createOpenChannelToken("xb");
    if ((await this.repository.listBotConnections()).some((item) => item.token === token)) {
      // Provider tokens must stay unique across bot connections.
      return invalid("createExternalBotConnection", "bot_token_not_unique", "The bot provider token is already used by another connection.");
    }
    const now = new Date().toISOString();
    const connection: ExternalBotConnectionRecord = {
      channels: normalizeChannels(payload.channels),
      createdAt: now,
      id: `xbc_${randomUUID()}`,
      name: String(payload.name ?? "").trim() || "External bot",
      providerUrl,
      status: "active",
      tenantId,
      token,
      updatedAt: now
    };
    await this.repository.saveBotConnection(connection);
    return ok("createExternalBotConnection", { connection: publicBotConnection(connection, true) });
  }

  @Patch("bot-connections/:id")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "updateExternalBotConnection", summary: "Update an external bot provider connection" })
  async updateBotConnection(
    @Req() request: TenantOperatorRequest,
    @Param("id") id: string,
    @Body() payload: { channels?: string[]; name?: string; providerUrl?: string; status?: string; token?: string } = {}
  ) {
    const tenantId = requestTenantId(request);
    const existing = await this.repository.findBotConnection(tenantId, id);
    if (!existing) {
      return notFound("updateExternalBotConnection", "external_bot_connection_not_found");
    }
    const providerUrl = payload.providerUrl === undefined ? existing.providerUrl : optionalHttpUrl(payload.providerUrl);
    if (!providerUrl) {
      return invalid("updateExternalBotConnection", "provider_url_required", "providerUrl must be an http(s) URL.");
    }
    const token = String(payload.token ?? "").trim() || existing.token;
    if (token !== existing.token && (await this.repository.listBotConnections()).some((item) => item.token === token)) {
      return invalid("updateExternalBotConnection", "bot_token_not_unique", "The bot provider token is already used by another connection.");
    }
    const updated: ExternalBotConnectionRecord = {
      ...existing,
      channels: payload.channels === undefined ? existing.channels : normalizeChannels(payload.channels),
      name: String(payload.name ?? "").trim() || existing.name,
      providerUrl,
      status: normalizeStatus(payload.status) ?? existing.status,
      token,
      updatedAt: new Date().toISOString()
    };
    await this.repository.saveBotConnection(updated);
    return ok("updateExternalBotConnection", { connection: publicBotConnection(updated) });
  }

  @Delete("bot-connections/:id")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deleteExternalBotConnection", summary: "Delete an external bot provider connection" })
  async deleteBotConnection(@Req() request: TenantOperatorRequest, @Param("id") id: string) {
    const removed = await this.repository.removeBotConnection(requestTenantId(request), id);
    return removed ? ok("deleteExternalBotConnection", { removed: true }) : notFound("deleteExternalBotConnection", "external_bot_connection_not_found");
  }

  // --- Webhook subscriptions ---

  @Get("webhooks")
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({ operationId: "listEventWebhookSubscriptions", summary: "List event webhook subscriptions" })
  async listWebhookSubscriptions(@Req() request: TenantOperatorRequest) {
    return ok("listEventWebhookSubscriptions", {
      items: await this.repository.listWebhookSubscriptions(requestTenantId(request)),
      supportedEvents: SUPPORTED_WEBHOOK_EVENTS
    });
  }

  @Post("webhooks")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createEventWebhookSubscription", summary: "Subscribe an URL to event webhooks" })
  async createWebhookSubscription(
    @Req() request: TenantOperatorRequest,
    @Body() payload: { events?: string[]; url?: string } = {}
  ) {
    const tenantId = requestTenantId(request);
    const url = optionalHttpUrl(payload.url);
    if (!url) {
      return invalid("createEventWebhookSubscription", "webhook_url_required", "url must be an http(s) URL.");
    }
    const events = normalizeEvents(payload.events);
    if (events === false) {
      return invalid("createEventWebhookSubscription", "webhook_events_unsupported", `Supported events: ${SUPPORTED_WEBHOOK_EVENTS.join(", ")}.`);
    }
    const now = new Date().toISOString();
    const subscription: EventWebhookSubscriptionRecord = {
      createdAt: now,
      events,
      id: `owh_${randomUUID()}`,
      status: "active",
      tenantId,
      updatedAt: now,
      url
    };
    await this.repository.saveWebhookSubscription(subscription);
    return ok("createEventWebhookSubscription", { subscription });
  }

  @Patch("webhooks/:id")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "updateEventWebhookSubscription", summary: "Update an event webhook subscription" })
  async updateWebhookSubscription(
    @Req() request: TenantOperatorRequest,
    @Param("id") id: string,
    @Body() payload: { events?: string[]; status?: string; url?: string } = {}
  ) {
    const tenantId = requestTenantId(request);
    const existing = await this.repository.findWebhookSubscription(tenantId, id);
    if (!existing) {
      return notFound("updateEventWebhookSubscription", "event_webhook_subscription_not_found");
    }
    const url = payload.url === undefined ? existing.url : optionalHttpUrl(payload.url);
    if (!url) {
      return invalid("updateEventWebhookSubscription", "webhook_url_required", "url must be an http(s) URL.");
    }
    const events = payload.events === undefined ? existing.events : normalizeEvents(payload.events);
    if (events === false) {
      return invalid("updateEventWebhookSubscription", "webhook_events_unsupported", `Supported events: ${SUPPORTED_WEBHOOK_EVENTS.join(", ")}.`);
    }
    const subscription: EventWebhookSubscriptionRecord = {
      ...existing,
      events,
      status: normalizeStatus(payload.status) ?? existing.status,
      updatedAt: new Date().toISOString(),
      url
    };
    await this.repository.saveWebhookSubscription(subscription);
    return ok("updateEventWebhookSubscription", { subscription });
  }

  @Delete("webhooks/:id")
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deleteEventWebhookSubscription", summary: "Delete an event webhook subscription" })
  async deleteWebhookSubscription(@Req() request: TenantOperatorRequest, @Param("id") id: string) {
    const removed = await this.repository.removeWebhookSubscription(requestTenantId(request), id);
    return removed ? ok("deleteEventWebhookSubscription", { removed: true }) : notFound("deleteEventWebhookSubscription", "event_webhook_subscription_not_found");
  }

  // --- Delivery journal (debugging aid) ---

  @Get("deliveries")
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({ operationId: "listExternalDeliveries", summary: "List external integration delivery journal" })
  async listDeliveries(@Req() request: TenantOperatorRequest, @Query() query: { kind?: string; status?: string } = {}) {
    const items = await this.repository.listDeliveries({
      ...(isDeliveryKind(query.kind) ? { kind: query.kind } : {}),
      ...(isDeliveryStatus(query.status) ? { status: query.status } : {}),
      tenantId: requestTenantId(request)
    });
    return ok("listExternalDeliveries", {
      items: items.slice(-200).map((item) => ({
        attempts: item.attempts,
        conversationId: item.conversationId ?? null,
        createdAt: item.createdAt,
        eventName: item.eventName,
        id: item.id,
        kind: item.kind,
        lastError: item.lastError ?? null,
        lastStatusCode: item.lastStatusCode ?? null,
        nextAttemptAt: item.nextAttemptAt,
        status: item.status,
        updatedAt: item.updatedAt,
        url: item.url
      }))
    });
  }
}

function publicChatChannel(channel: OpenChatChannelRecord, includeToken = false): Record<string, unknown> {
  return {
    createdAt: channel.createdAt,
    id: channel.id,
    inboundPath: `/api/v1/open-channel/${includeToken ? channel.token : maskToken(channel.token)}`,
    name: channel.name,
    outboundUrl: channel.outboundUrl,
    routingQueueId: channel.routingQueueId ?? null,
    status: channel.status,
    ...(includeToken ? { token: channel.token } : { tokenPreview: maskToken(channel.token) }),
    updatedAt: channel.updatedAt
  };
}

function publicBotConnection(connection: ExternalBotConnectionRecord, includeToken = false): Record<string, unknown> {
  return {
    channels: connection.channels,
    createdAt: connection.createdAt,
    id: connection.id,
    inboundPath: `/api/v1/external-bot/webhooks/${connection.id}/${includeToken ? connection.token : maskToken(connection.token)}`,
    name: connection.name,
    providerUrl: connection.providerUrl,
    status: connection.status,
    ...(includeToken ? { token: connection.token } : { tokenPreview: maskToken(connection.token) }),
    updatedAt: connection.updatedAt
  };
}

function maskToken(token: string): string {
  return token.length <= 8 ? "****" : `${token.slice(0, 4)}****${token.slice(-4)}`;
}

function requestTenantId(request: TenantOperatorRequest): string {
  return request.tenantOperatorContext?.tenantId ?? "";
}

function normalizeChannels(channels: string[] | undefined): string[] | null {
  if (!Array.isArray(channels)) return null;
  const normalized = channels.map((item) => String(item ?? "").trim().toUpperCase()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : null;
}

function normalizeEvents(events: string[] | undefined): string[] | null | false {
  if (!Array.isArray(events)) return null;
  const normalized = events.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (!normalized.length) return null;
  if (normalized.some((event) => !SUPPORTED_WEBHOOK_EVENTS.includes(event))) return false;
  return Array.from(new Set(normalized));
}

function normalizeStatus(status: string | undefined): OpenChannelRecordStatus | undefined {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "active" || value === "disabled" ? value : undefined;
}

function isDeliveryKind(value: string | undefined): value is "bot_event" | "chat_event" | "webhook" {
  return value === "bot_event" || value === "chat_event" || value === "webhook";
}

function isDeliveryStatus(value: string | undefined): value is "dead_lettered" | "delivered" | "pending" {
  return value === "dead_lettered" || value === "delivered" || value === "pending";
}

function ok(operation: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: "integrationService",
    operation,
    meta: { source: "api", apiVersion: "v1" },
    data
  });
}

function invalid(operation: string, code: string, message: string): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: "integrationService",
    operation,
    status: "invalid",
    meta: { source: "api", apiVersion: "v1" },
    data: {},
    error: { code, message }
  });
}

function notFound(operation: string, code: string): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: "integrationService",
    operation,
    status: "not_found",
    meta: { source: "api", apiVersion: "v1" },
    data: {},
    error: { code, message: "The requested external integration record was not found." }
  });
}

function optionalHttpUrl(value: string | undefined): string | null {
  return normalizeOpenChannelOutboundUrl(value);
}
