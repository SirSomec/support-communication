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

interface ReplayPayload {
  deliveryId?: string;
  idempotencyKey?: string;
}

export class IntegrationService {
  private readonly channels = clone(channelDetails);
  private readonly apiKeys = clone(apiEnvironmentKeys);
  private readonly deliveries = clone(webhookDeliveryLog);
  private readonly sessions: SecuritySession[];
  private readonly replayIdempotency = new Map<string, Record<string, unknown>>();

  constructor(private readonly integrationRepository: IntegrationRepository = IntegrationRepository.default()) {
    const state = this.integrationRepository.readState();
    this.sessions = overlaySecuritySessions(clone(activeSecuritySessions), state.securitySessions);
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
