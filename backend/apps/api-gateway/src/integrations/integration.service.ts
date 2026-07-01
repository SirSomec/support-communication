import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  activeSecuritySessions,
  apiChangelog,
  apiEnvironmentKeys,
  channelDetails,
  securityAlerts,
  securityControls,
  webhookDeliveryLog,
  webhookEndpoints,
  type ApiEnvironmentKey,
  type ChannelDetail,
  type IntegrationConnection,
  type SecuritySession,
  type WebhookDelivery
} from "./integration.fixtures.js";
import { IntegrationRepository, type WebhookDeliveryJournalEntry, type WebhookReplayAuditEvent } from "./integration.repository.js";
import {
  disableTelegramConnectionRecord,
  saveTelegramConnectionRecord,
  telegramConnectionEnvelope,
  toTelegramConnectionPublicView,
  type TelegramHttpFetch
} from "./telegram-channel-connection.js";

const INTEGRATION_SERVICE = "integrationService";
const DEFAULT_FIXTURE_TENANT_ID = "tenant-volga";

interface ChannelTestPayload {
  channelId?: string;
  connectionId?: string;
  environment?: string;
  message?: string;
  mode?: "receive" | "send";
  recipient?: string;
}

interface ChannelConnectionRecord {
  chatLimit: number;
  credentialsMasked: boolean;
  environment: string;
  health: number;
  id: string;
  lastSyncAt: string;
  name: string;
  rawExternalId: string;
  routingQueueId: string;
  status: string;
  tenantId: string;
  traffic: string;
  type: string;
  webhookUrl: string;
}

interface ChannelConnectionMutationPayload {
  chatLimit?: number;
  credentials?: Record<string, unknown>;
  environment?: string;
  name?: string;
  reason?: string;
  routingQueueId?: string;
  status?: string;
  type?: string;
  webhookUrl?: string;
}

interface ReplayPayload {
  deliveryId?: string;
  idempotencyKey?: string;
}

export class IntegrationService {
  private readonly channels = clone(channelDetails);
  private readonly apiKeys = clone(apiEnvironmentKeys);
  private readonly deliveries = clone(webhookDeliveryLog);
  private readonly sessions: SecuritySession[];
  private readonly channelConnections: ChannelConnectionRecord[];
  private readonly channelConnectionEvents = new Map<string, Array<Record<string, unknown>>>();
  private readonly channelConnectionAuditEvents: Array<Record<string, unknown>> = [];
  private readonly replayIdempotency = new Map<string, Record<string, unknown>>();

  constructor(private readonly integrationRepository: IntegrationRepository = IntegrationRepository.default()) {
    const state = this.integrationRepository.readState();
    this.sessions = overlaySecuritySessions(clone(activeSecuritySessions), state.securitySessions);
    this.channelConnections = buildChannelConnectionRecords(this.channels);
    this.channelConnections.forEach((connection) => {
      this.channelConnectionEvents.set(connection.id, [
        {
          id: makeAuditId("channel_event"),
          action: "channel.connection.loaded",
          at: new Date().toISOString(),
          severity: connection.status === "error" ? "error" : connection.status === "paused" ? "warn" : "info",
          message: `${connection.name} loaded into settings read model`
        }
      ]);
    });
    state.webhookReplayJournal.forEach((entry) => {
      this.replayIdempotency.set(entry.idempotencyKey, {
        auditId: entry.auditId,
        deliveryId: entry.deliveryId,
        originalTraceId: entry.originalTraceId,
        replayId: entry.replayId,
        signatureVerified: entry.signatureVerified,
        status: entry.status
      });
    });
  }

  async fetchIntegrationWorkspace(): Promise<BackendEnvelope<Record<string, unknown>>> {
    const webhookDeliveryJournal = this.integrationRepository.listWebhookDeliveryJournal();

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchIntegrationWorkspace",
      traceId: integrationTraceId("fetchIntegrationWorkspace"),
      partial: true,
      meta: apiMeta(),
      data: {
        channelDetails: clone(this.channels),
        apiEnvironmentKeys: this.apiKeys.map(maskApiKey),
        webhookEndpoints: clone(webhookEndpoints),
        webhookDeliveryLog: buildWebhookDeliveryReadSide(this.deliveries, webhookDeliveryJournal),
        webhookDeadLetters: buildWebhookDeadLetterReadSide(webhookDeliveryJournal),
        apiChangelog: clone(apiChangelog),
        securityControls: clone(securityControls),
        activeSecuritySessions: clone(this.sessions),
        securityAlerts: clone(securityAlerts)
      }
    });
  }

  listChannelConnectionAuditEvents() {
    return this.channelConnectionAuditEvents.map((event) => ({ ...event }));
  }

  async fetchChannelConnections(filters: { type?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const type = normalizeOptionalType(filters.type);
    const connections = this.channelConnections
      .filter((connection) => !type || connection.type === type)
      .map(maskChannelConnection);

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchChannelConnections",
      traceId: integrationTraceId("fetchChannelConnections"),
      meta: apiMeta({ type: type ?? "all" }),
      data: {
        availableTypes: ["sdk", "telegram", "max", "vk"],
        connections
      }
    });
  }

  async createChannelConnection(payload: ChannelConnectionMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const type = normalizeOptionalType(payload.type);
    const name = String(payload.name ?? "").trim();
    if (!type || !name) {
      return invalidEnvelope("createChannelConnection", "channel_type_and_name_required", "type and name are required.", {
        type: type ?? null
      });
    }

    const now = new Date().toISOString();
    const connection: ChannelConnectionRecord = {
      chatLimit: normalizeChatLimit(payload.chatLimit),
      credentialsMasked: Boolean(payload.credentials),
      environment: normalizeEnvironment(payload.environment),
      health: 100,
      id: `conn_${type}_${randomUUID()}`,
      lastSyncAt: now,
      name,
      rawExternalId: `raw_${type}_${randomUUID()}`,
      routingQueueId: String(payload.routingQueueId ?? `queue-${type}`).trim(),
      status: String(payload.status ?? "active").trim().toLowerCase(),
      tenantId: DEFAULT_FIXTURE_TENANT_ID,
      traffic: "0 events",
      type,
      webhookUrl: String(payload.webhookUrl ?? "").trim()
    };
    this.channelConnections.push(connection);
    this.recordChannelConnectionEvent(connection.id, "channel.connection.created", "info", `${name} created`);
    const auditEvent = this.persistChannelConnectionAuditEvent("channel.connection.create", connection, "Channel connection created");

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "createChannelConnection",
      traceId: integrationTraceId("createChannelConnection"),
      meta: apiMeta({ connectionId: connection.id, type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        connection: maskChannelConnection(connection)
      }
    });
  }

  async updateChannelConnection(connectionId: string, payload: ChannelConnectionMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const connection = this.findChannelConnection(connectionId);
    if (!connection) {
      return notFoundEnvelope("updateChannelConnection", "channel_connection_not_found", `Channel connection ${connectionId} was not found.`, {
        connectionId
      });
    }

    if (payload.name !== undefined) {
      connection.name = String(payload.name).trim() || connection.name;
    }
    if (payload.environment !== undefined) {
      connection.environment = normalizeEnvironment(payload.environment);
    }
    if (payload.routingQueueId !== undefined) {
      connection.routingQueueId = String(payload.routingQueueId).trim() || connection.routingQueueId;
    }
    if (payload.chatLimit !== undefined) {
      connection.chatLimit = normalizeChatLimit(payload.chatLimit);
    }
    if (payload.status !== undefined) {
      connection.status = String(payload.status).trim().toLowerCase() || connection.status;
    }
    if (payload.webhookUrl !== undefined) {
      connection.webhookUrl = String(payload.webhookUrl).trim();
    }
    if (payload.credentials) {
      connection.credentialsMasked = true;
    }
    connection.lastSyncAt = new Date().toISOString();
    this.recordChannelConnectionEvent(connection.id, "channel.connection.updated", "info", payload.reason ?? `${connection.name} updated`);
    const auditEvent = this.persistChannelConnectionAuditEvent("channel.connection.update", connection, payload.reason ?? "Channel connection updated");

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "updateChannelConnection",
      traceId: integrationTraceId("updateChannelConnection"),
      meta: apiMeta({ connectionId: connection.id, type: connection.type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        connection: maskChannelConnection(connection),
        reason: payload.reason ?? null
      }
    });
  }

  async deleteChannelConnection(connectionId: string, payload: { reason?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const connection = this.findChannelConnection(connectionId);
    if (!connection) {
      return notFoundEnvelope("deleteChannelConnection", "channel_connection_not_found", `Channel connection ${connectionId} was not found.`, {
        connectionId
      });
    }

    connection.status = "disabled";
    connection.lastSyncAt = new Date().toISOString();
    this.recordChannelConnectionEvent(connection.id, "channel.connection.disabled", "warn", payload.reason ?? `${connection.name} disabled`);
    const auditEvent = this.persistChannelConnectionAuditEvent("channel.connection.disable", connection, payload.reason ?? "Channel connection disabled");

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "deleteChannelConnection",
      traceId: integrationTraceId("deleteChannelConnection"),
      meta: apiMeta({ connectionId: connection.id, type: connection.type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        connectionId: connection.id,
        reason: payload.reason ?? null,
        status: connection.status
      }
    });
  }

  async testChannelConnectionInstance(connectionId: string, payload: Omit<ChannelTestPayload, "channelId" | "connectionId">): Promise<BackendEnvelope<Record<string, unknown>>> {
    const connection = this.findChannelConnection(connectionId);
    if (!connection) {
      return notFoundEnvelope("testChannelConnectionInstance", "channel_connection_not_found", `Channel connection ${connectionId} was not found.`, {
        connectionId
      });
    }

    if (!String(payload.recipient ?? "").trim() || !String(payload.message ?? "").trim()) {
      return invalidEnvelope("testChannelConnectionInstance", "recipient_and_message_required", "recipient and message are required.", {
        connectionId
      });
    }

    const mode = payload.mode ?? "receive";
    this.recordChannelConnectionEvent(connection.id, "channel.test", "info", `${mode} test queued for ${connection.name}`);
    const auditEvent = this.persistChannelConnectionAuditEvent("channel.connection.test", connection, `${mode} test queued`);

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "testChannelConnectionInstance",
      traceId: integrationTraceId("testChannelConnectionInstance"),
      meta: apiMeta({ connectionId: connection.id, type: connection.type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        delivery: {
          connectionId: connection.id,
          direction: mode,
          environment: connection.environment,
          rawSecretExposed: false,
          recipient: payload.recipient,
          requestId: makeRequestId(connection.type),
          status: mode === "receive" ? "accepted_to_queue" : "sent_to_channel"
        }
      }
    });
  }

  async fetchChannelConnectionEvents(connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const connection = this.findChannelConnection(connectionId);
    if (!connection) {
      return notFoundEnvelope("fetchChannelConnectionEvents", "channel_connection_not_found", `Channel connection ${connectionId} was not found.`, {
        connectionId
      });
    }

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchChannelConnectionEvents",
      traceId: integrationTraceId("fetchChannelConnectionEvents"),
      meta: apiMeta({ connectionId: connection.id, type: connection.type }),
      data: {
        connectionId: connection.id,
        events: clone(this.channelConnectionEvents.get(connection.id) ?? [])
      }
    });
  }

  async testChannelConnection(payload: ChannelTestPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!String(payload.recipient ?? "").trim() || !String(payload.message ?? "").trim()) {
      return invalidEnvelope("testChannelConnection", "recipient_and_message_required", "recipient and message are required.", {
        channelId: payload.channelId ?? "unknown"
      });
    }

    const channel = this.findChannel(payload.channelId ?? "");
    if (!channel) {
      return notFoundEnvelope("testChannelConnection", "channel_not_found", `Channel ${payload.channelId ?? "(empty)"} was not found.`, {
        channelId: payload.channelId ?? null
      });
    }

    const connection = findConnection(channel, payload.connectionId, payload.environment);
    if (!connection) {
      return notFoundEnvelope("testChannelConnection", "connection_not_found", `Connection ${payload.connectionId ?? "(empty)"} was not found.`, {
        channelId: channel.id,
        connectionId: payload.connectionId ?? null
      });
    }

    const environment = normalizeEnvironment(payload.environment ?? connection.env);
    const mode = payload.mode ?? "receive";

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "testChannelConnection",
      traceId: integrationTraceId("testChannelConnection"),
      meta: apiMeta({ channelId: channel.id, connectionId: connection.id }),
      data: {
        auditId: makeAuditId("channel"),
        delivery: {
          channel: channel.channel,
          connection: connection.rawId,
          direction: mode,
          environment,
          rawSecretExposed: false,
          recipient: payload.recipient,
          requestId: makeRequestId(channel.id),
          sandboxIsolation: environment !== "production",
          status: mode === "receive" ? "accepted_to_queue" : "sent_to_channel"
        }
      }
    });
  }

  async rotateApiKey(keyId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const key = this.findApiKey(keyId);

    if (!key) {
      return notFoundEnvelope("rotateApiKey", "api_key_not_found", `API key ${keyId} was not found.`, { keyId });
    }

    const rotation = {
      auditId: makeAuditId("key"),
      environment: key.env,
      keyId,
      rawKeyShownOnce: false as const,
      requires2fa: true as const,
      rotationId: makeQueueId("key_rotation"),
      status: "rotation_queued"
    };
    await this.integrationRepository.ensurePublicApiKeyReference({
      createdAt: fixtureKeyCreatedAt(key),
      environment: key.env,
      keyId,
      keyPreview: key.keyPreview,
      name: key.name,
      owner: key.owner,
      scopes: key.scopes,
      status: fixtureKeyStatus(key),
      tenantId: DEFAULT_FIXTURE_TENANT_ID
    });
    this.integrationRepository.saveApiKeyRotationJob(rotation);
    await this.integrationRepository.saveApiKeyRotationAuditEvent({
      action: "public_api_key.rotation_queued",
      at: new Date().toISOString(),
      auditId: rotation.auditId,
      environment: key.env,
      immutable: true,
      keyId,
      keyPreview: key.keyPreview,
      rotationId: rotation.rotationId,
      status: rotation.status
    });

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "rotateApiKey",
      traceId: integrationTraceId("rotateApiKey"),
      meta: apiMeta({ keyId }),
      data: rotation
    });
  }

  async replayWebhookDelivery(payload: ReplayPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const delivery = this.findDelivery(payload.deliveryId ?? "");

    if (!delivery) {
      return notFoundEnvelope("replayWebhookDelivery", "webhook_delivery_not_found", `Webhook delivery ${payload.deliveryId ?? "(empty)"} was not found.`, {
        deliveryId: payload.deliveryId ?? null
      });
    }

    const idempotencyKey = payload.idempotencyKey?.trim();
    const cached = idempotencyKey ? this.findReplay(idempotencyKey) : undefined;

    if (cached) {
      if (cached.deliveryId !== delivery.id) {
        return conflictEnvelope("replayWebhookDelivery", "idempotency_key_reused", "Idempotency key was already used for a different webhook delivery replay.", {
          deliveryId: delivery.id,
          idempotencyKey,
          originalDeliveryId: cached.deliveryId
        });
      }

      this.integrationRepository.saveWebhookReplayAuditEvent(createWebhookReplayAuditEvent({
        action: "webhook.replay.duplicate",
        auditId: String(cached.auditId),
        delivery,
        idempotencyKey: idempotencyKey ?? null,
        replayId: String(cached.replayId),
        transition: "duplicate"
      }));

      return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation: "replayWebhookDelivery",
        traceId: integrationTraceId("replayWebhookDelivery"),
        meta: apiMeta({ idempotencyKey }),
        data: {
          ...clone(cached),
          duplicate: true
        }
      });
    }

    const replay = {
      auditId: makeAuditId("webhook"),
      deliveryId: delivery.id,
      duplicate: false,
      originalTraceId: delivery.traceId,
      replayId: makeQueueId("webhook_replay"),
      signatureVerified: delivery.status !== "signature_failed",
      status: "replay_queued"
    };
    this.integrationRepository.saveWebhookReplayAuditEvent(createWebhookReplayAuditEvent({
      action: "webhook.replay.queued",
      auditId: replay.auditId,
      delivery,
      idempotencyKey: idempotencyKey ?? null,
      replayId: replay.replayId,
      transition: webhookReplayTransition(delivery)
    }));

    if (idempotencyKey) {
      this.replayIdempotency.set(idempotencyKey, clone(replay));
      this.integrationRepository.saveWebhookReplay({
        auditId: replay.auditId,
        deliveryId: replay.deliveryId,
        idempotencyKey,
        originalTraceId: replay.originalTraceId,
        replayId: replay.replayId,
        signatureVerified: replay.signatureVerified,
        status: replay.status
      });
    }

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "replayWebhookDelivery",
      traceId: integrationTraceId("replayWebhookDelivery"),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null }),
      data: replay
    });
  }

  async fetchTelegramConnection(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    if (!normalizedTenantId) {
      return invalidEnvelope("fetchTelegramConnection", "tenant_id_required", "tenantId is required.", {});
    }

    const connection = this.integrationRepository.findTelegramConnectionByTenantId(normalizedTenantId);
    return telegramConnectionEnvelope("fetchTelegramConnection", {
      connection: toTelegramConnectionPublicView(connection, resolvePublicWebhookBaseUrl())
    });
  }

  async saveTelegramConnection(
    tenantId: string,
    payload: { botToken?: string },
    options: { fetcher?: TelegramHttpFetch } = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    const botToken = String(payload.botToken ?? "").trim();
    if (!normalizedTenantId || !botToken) {
      return invalidEnvelope("saveTelegramConnection", "telegram_bot_token_required", "botToken is required.", {
        tenantId: normalizedTenantId || null
      });
    }

    try {
      const existing = this.integrationRepository.findTelegramConnectionByTenantId(normalizedTenantId);
      const saved = await saveTelegramConnectionRecord({
        botToken,
        fetcher: options.fetcher,
        publicWebhookBaseUrl: resolvePublicWebhookBaseUrl(),
        tenantId: normalizedTenantId
      }, existing);
      this.integrationRepository.saveTelegramConnection(saved);

      return telegramConnectionEnvelope("saveTelegramConnection", {
        connection: toTelegramConnectionPublicView(saved, resolvePublicWebhookBaseUrl())
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "telegram_connection_save_failed";
      return invalidEnvelope("saveTelegramConnection", code, "Telegram bot token could not be saved.", {
        tenantId: normalizedTenantId
      });
    }
  }

  async disconnectTelegramConnection(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    const existing = this.integrationRepository.findTelegramConnectionByTenantId(normalizedTenantId);
    if (!existing || existing.status === "disabled") {
      return notFoundEnvelope("disconnectTelegramConnection", "telegram_connection_not_found", "Telegram connection was not found.", {
        tenantId: normalizedTenantId
      });
    }

    const disabled = disableTelegramConnectionRecord(existing);
    this.integrationRepository.saveTelegramConnection(disabled);

    return telegramConnectionEnvelope("disconnectTelegramConnection", {
      connection: toTelegramConnectionPublicView(disabled, resolvePublicWebhookBaseUrl())
    });
  }

  async revokeSecuritySession(sessionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const session = this.sessions.find((item) => item.id === sessionId);

    if (!session) {
      return notFoundEnvelope("revokeSecuritySession", "security_session_not_found", `Security session ${sessionId} was not found.`, { sessionId });
    }

    session.status = "revoked";
    this.integrationRepository.saveSecuritySession(session);

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "revokeSecuritySession",
      traceId: integrationTraceId("revokeSecuritySession"),
      meta: apiMeta({ sessionId }),
      data: {
        auditId: makeAuditId("session"),
        revokedAt: new Date().toISOString(),
        sessionId,
        status: "revoked"
      }
    });
  }

  private findApiKey(keyId: string): ApiEnvironmentKey | undefined {
    return this.apiKeys.find((key) => key.id === keyId);
  }

  private findChannelConnection(connectionId: string): ChannelConnectionRecord | undefined {
    return this.channelConnections.find((connection) => connection.id === connectionId);
  }

  private findChannel(channelId: string): ChannelDetail | undefined {
    return this.channels.find((channel) => channel.id === channelId || channel.channel.toLowerCase() === channelId.toLowerCase());
  }

  private findDelivery(deliveryId: string): WebhookDelivery | undefined {
    const fixtureDelivery = this.deliveries.find((delivery) => delivery.id === deliveryId);
    if (fixtureDelivery) {
      return fixtureDelivery;
    }

    const journalEntry = this.integrationRepository.findWebhookDeliveryJournalEntry(deliveryId);
    return journalEntry ? journalEntryToWebhookDelivery(journalEntry) : undefined;
  }

  private findReplay(idempotencyKey: string): Record<string, unknown> | undefined {
    const persisted = this.integrationRepository.findWebhookReplay(idempotencyKey);
    if (persisted) {
      return {
        auditId: persisted.auditId,
        deliveryId: persisted.deliveryId,
        originalTraceId: persisted.originalTraceId,
        replayId: persisted.replayId,
        signatureVerified: persisted.signatureVerified,
        status: persisted.status
      };
    }

    return this.replayIdempotency.get(idempotencyKey);
  }

  private recordChannelConnectionEvent(connectionId: string, action: string, severity: string, message: string): void {
    const current = this.channelConnectionEvents.get(connectionId) ?? [];
    current.unshift({
      id: makeAuditId("channel_event"),
      action,
      at: new Date().toISOString(),
      message,
      severity
    });
    this.channelConnectionEvents.set(connectionId, current);
  }

  private persistChannelConnectionAuditEvent(action: string, connection: ChannelConnectionRecord, reason: string) {
    const event = {
      action,
      at: new Date().toISOString(),
      connectionId: connection.id,
      id: makeAuditId("channel"),
      immutable: true,
      reason,
      result: "ok",
      tenantId: connection.tenantId,
      type: connection.type
    };
    this.channelConnectionAuditEvents.push(event);
    return event;
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findConnection(channel: ChannelDetail, connectionId?: string, environment?: string): IntegrationConnection | undefined {
  if (connectionId) {
    return channel.connections.find((connection) => connection.id === connectionId || connection.rawId === connectionId);
  }

  const env = normalizeEnvironment(environment);
  return channel.connections.find((connection) => normalizeEnvironment(connection.env) === env) ?? channel.connections[0];
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INTEGRATION_SERVICE,
    operation,
    traceId: integrationTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INTEGRATION_SERVICE,
    operation,
    traceId: integrationTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INTEGRATION_SERVICE,
    operation,
    traceId: integrationTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function integrationTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(INTEGRATION_SERVICE, operation);
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function makeRequestId(scope: string): string {
  return `req_${scope}_${randomUUID()}`;
}

function fixtureKeyCreatedAt(key: ApiEnvironmentKey): string {
  const timestamp = Date.parse(`${key.lastRotated}T00:00:00.000Z`);

  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function fixtureKeyStatus(key: ApiEnvironmentKey): "active" | "revoked" {
  return key.status.toLowerCase() === "revoked" ? "revoked" : "active";
}

function createWebhookReplayAuditEvent({
  action,
  auditId,
  delivery,
  idempotencyKey,
  replayId,
  transition
}: {
  action: WebhookReplayAuditEvent["action"];
  auditId: string;
  delivery: WebhookDelivery;
  idempotencyKey: string | null;
  replayId: string;
  transition: WebhookReplayAuditEvent["transition"];
}): WebhookReplayAuditEvent {
  return {
    action,
    at: new Date().toISOString(),
    attempts: delivery.attempts,
    auditId,
    deliveryId: delivery.id,
    deliveryStatus: delivery.status,
    id: makeAuditId("webhook_replay"),
    idempotencyKey,
    immutable: true,
    originalTraceId: delivery.traceId,
    replayId,
    transition
  };
}

function journalEntryToWebhookDelivery(entry: WebhookDeliveryJournalEntry): WebhookDelivery {
  return {
    attempts: entry.attempts,
    endpointId: entry.endpointId,
    event: entry.eventType,
    httpStatus: typeof entry.lastError?.statusCode === "number" ? String(entry.lastError.statusCode) : "",
    id: entry.deliveryId,
    status: entry.status,
    time: entry.lastAttemptAt ?? entry.createdAt,
    traceId: entry.traceId
  };
}

function buildWebhookDeliveryReadSide(
  fixtureDeliveries: WebhookDelivery[],
  journalEntries: WebhookDeliveryJournalEntry[]
): WebhookDelivery[] {
  const deliveriesById = new Map<string, WebhookDelivery>();
  fixtureDeliveries.forEach((delivery) => deliveriesById.set(delivery.id, clone(delivery)));
  journalEntries.forEach((entry) => deliveriesById.set(entry.deliveryId, journalEntryToWebhookDelivery(entry)));
  return Array.from(deliveriesById.values());
}

function buildWebhookDeadLetterReadSide(journalEntries: WebhookDeliveryJournalEntry[]): Array<Record<string, unknown>> {
  return journalEntries
    .filter((entry) => entry.status === "dead_lettered")
    .map((entry) => ({
      attempts: entry.attempts,
      deliveryId: entry.deliveryId,
      endpointId: entry.endpointId,
      errorCode: entry.lastError?.code ?? null,
      event: entry.eventType,
      httpStatus: typeof entry.lastError?.statusCode === "number" ? String(entry.lastError.statusCode) : "",
      lastAttemptAt: entry.lastAttemptAt ?? null,
      replayable: true,
      status: entry.status,
      traceId: entry.traceId
    }));
}

function webhookReplayTransition(delivery: WebhookDelivery): WebhookReplayAuditEvent["transition"] {
  if (delivery.status === "retry_scheduled") {
    return "retry";
  }

  if (delivery.status === "signature_failed" || delivery.status === "dead_lettered" || delivery.status === "failed") {
    return "dead_letter";
  }

  return "replay";
}

function maskApiKey(key: ApiEnvironmentKey): ApiEnvironmentKey {
  return clone(key);
}

function buildChannelConnectionRecords(channels: ChannelDetail[]): ChannelConnectionRecord[] {
  const records = channels.flatMap((channel) => channel.connections.map((connection) => ({
    chatLimit: parseChatLimit(channel.limit),
    credentialsMasked: true,
    environment: normalizeEnvironment(connection.env),
    health: channel.health,
    id: connection.rawId,
    lastSyncAt: channel.lastSync,
    name: connection.name,
    rawExternalId: connection.rawId,
    routingQueueId: routeToQueueId(channel.route),
    status: normalizeConnectionStatus(connection.status),
    tenantId: DEFAULT_FIXTURE_TENANT_ID,
    traffic: connection.traffic,
    type: channel.id,
    webhookUrl: `https://api.support.local/webhooks/${channel.id}/${connection.id}`
  })));

  return [
    ...records,
    {
      chatLimit: 8,
      credentialsMasked: true,
      environment: "beta",
      health: 82,
      id: "conn_max_beta",
      lastSyncAt: "Сегодня, 11:56",
      name: "MAX Business beta",
      rawExternalId: "conn_max_beta",
      routingQueueId: "queue-max-beta",
      status: "warn",
      tenantId: DEFAULT_FIXTURE_TENANT_ID,
      traffic: "1 130 messages",
      type: "max",
      webhookUrl: "https://api.support.local/webhooks/max/beta"
    },
    {
      chatLimit: 8,
      credentialsMasked: true,
      environment: "stage",
      health: 76,
      id: "conn_max_backup",
      lastSyncAt: "Сегодня, 10:48",
      name: "MAX backup webhook",
      rawExternalId: "conn_max_backup",
      routingQueueId: "queue-max-backup",
      status: "paused",
      tenantId: DEFAULT_FIXTURE_TENANT_ID,
      traffic: "0 messages",
      type: "max",
      webhookUrl: "https://api.support.local/webhooks/max/backup"
    }
  ];
}

function maskChannelConnection(connection: ChannelConnectionRecord): Record<string, unknown> {
  return {
    chatLimit: connection.chatLimit,
    credentialsMasked: connection.credentialsMasked,
    environment: connection.environment,
    health: connection.health,
    id: connection.id,
    lastSyncAt: connection.lastSyncAt,
    name: connection.name,
    rawExternalId: connection.rawExternalId,
    routingQueueId: connection.routingQueueId,
    status: connection.status,
    tenantId: connection.tenantId,
    traffic: connection.traffic,
    type: connection.type,
    webhookUrl: connection.webhookUrl
  };
}

function normalizeOptionalType(type?: string): string | undefined {
  const value = String(type ?? "").trim().toLowerCase();
  return value || undefined;
}

function normalizeChatLimit(value?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.max(1, Math.min(50, Math.round(parsed)));
}

function parseChatLimit(limit: string): number {
  const match = limit.match(/\d+/);
  return match ? normalizeChatLimit(Number(match[0])) : 8;
}

function routeToQueueId(route: string): string {
  return String(route)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "queue-default";
}

function normalizeConnectionStatus(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === "ok") {
    return "active";
  }
  if (value === "warn") {
    return "warn";
  }
  if (value === "paused") {
    return "paused";
  }
  return value || "active";
}

function normalizeEnvironment(environment?: string): string {
  const value = String(environment ?? "").trim().toLowerCase();
  return value === "prod" ? "production" : value || "production";
}

function overlaySecuritySessions(base: SecuritySession[], persisted: SecuritySession[]): SecuritySession[] {
  if (!persisted.length) {
    return base;
  }

  const persistedById = new Map(persisted.map((session) => [session.id, session]));
  const baseIds = new Set(base.map((session) => session.id));

  return [
    ...base.map((session) => clone(persistedById.get(session.id) ?? session)),
    ...persisted.filter((session) => !baseIds.has(session.id)).map((session) => clone(session))
  ];
}

function resolvePublicWebhookBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return String(env.PUBLIC_WEBHOOK_BASE_URL ?? env.PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4100").trim();
}
