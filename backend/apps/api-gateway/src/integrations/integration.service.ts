import { randomBytes, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { ApiEnvironmentKey, ChannelDetail, IntegrationConnection, SecuritySession, WebhookDelivery } from "./integration.types.js";
import {
  IntegrationRepository,
  type ChannelConnectionAuditEventRecord,
  type ChannelConnectionStoredRecord,
  type IntegrationWorkspaceCatalog,
  type ProviderConnectionCredentialRecord,
  type PublicApiKeyStoredRecord,
  type WebhookDeliveryJournalEntry,
  type WebhookEndpointStoredRecord,
  type WebhookReplayAuditEvent
} from "./integration.repository.js";
import type { PublicApiEnvironment } from "./public-api-auth.js";
import {
  disableTelegramConnectionRecord,
  saveTelegramConnectionRecord,
  telegramConnectionEnvelope,
  toTelegramConnectionPublicView,
  type TelegramHttpFetch
} from "./telegram-channel-connection.js";
import { QueueDirectoryRepository } from "../routing/queue-directory.repository.js";
import { ProviderConnectionCrypto } from "./provider-connection-crypto.js";

const INTEGRATION_SERVICE = "integrationService";
const DEFAULT_FIXTURE_TENANT_ID = "tenant-volga";
const WEBHOOK_ENDPOINT_STATUS_ACTIVE = "Активен";
const WEBHOOK_ENDPOINT_STATUS_DISABLED = "Отключён";
const DEFAULT_PUBLIC_API_KEY_SCOPES = ["clients:identify", "conversations:write"];

interface ChannelTestPayload {
  channelId?: string;
  connectionId?: string;
  environment?: string;
  message?: string;
  mode?: "receive" | "send";
  recipient?: string;
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

interface ChannelTypeStatusMutationPayload {
  enabled?: boolean;
  reason?: string;
}

interface ReplayPayload {
  deliveryId?: string;
  idempotencyKey?: string;
}

interface PublicApiKeyCreatePayload {
  environment?: string;
  name?: string;
  scopes?: string[];
}

interface WebhookEndpointMutationPayload {
  channel?: string;
  name?: string;
  status?: string;
  url?: string;
}

interface IntegrationServiceOptions {
  providerCredentialCrypto?: ProviderConnectionCrypto;
  queueDirectoryRepository?: Pick<QueueDirectoryRepository, "findQueue">;
  telegramFetch?: TelegramHttpFetch;
}

export class IntegrationService {
  private readonly workspace: IntegrationWorkspaceCatalog;
  private readonly channels: ChannelDetail[];
  private readonly apiKeys: ApiEnvironmentKey[];
  private readonly deliveries: WebhookDelivery[];
  private readonly sessions: SecuritySession[];
  private readonly replayIdempotency = new Map<string, Record<string, unknown>>();
  private readonly queueDirectoryRepository?: Pick<QueueDirectoryRepository, "findQueue">;

  constructor(
    private readonly integrationRepository: IntegrationRepository = IntegrationRepository.default(),
    private readonly options: IntegrationServiceOptions = {}
  ) {
    this.queueDirectoryRepository = options.queueDirectoryRepository;
    const state = readInitialIntegrationState(this.integrationRepository);
    this.workspace = this.integrationRepository.readWorkspaceCatalog();
    this.channels = clone(this.workspace.channelDetails);
    this.apiKeys = clone(this.workspace.apiEnvironmentKeys);
    this.deliveries = clone(this.workspace.webhookDeliveryLog);
    this.sessions = clone(state.securitySessions);
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
    const webhookDeliveryJournal = await this.integrationRepository.listWebhookDeliveryJournalAsync();
    const securitySessions = overlaySecuritySessions(this.sessions, await this.integrationRepository.listSecuritySessionsAsync());
    const storedApiKeys = await this.integrationRepository.listPublicApiKeyRecords();
    const endpointRecords = await this.integrationRepository.listWebhookEndpointRecords();

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchIntegrationWorkspace",
      traceId: integrationTraceId("fetchIntegrationWorkspace"),
      partial: true,
      meta: apiMeta(),
      data: {
        channelDetails: clone(this.channels),
        apiEnvironmentKeys: buildApiKeyReadSide(this.apiKeys, storedApiKeys),
        webhookEndpoints: buildWebhookEndpointReadSide(this.workspace.webhookEndpoints, endpointRecords),
        webhookDeliveryLog: buildWebhookDeliveryReadSide(this.deliveries, webhookDeliveryJournal),
        webhookDeadLetters: buildWebhookDeadLetterReadSide(webhookDeliveryJournal),
        apiChangelog: clone(this.workspace.apiChangelog),
        securityControls: clone(this.workspace.securityControls),
        activeSecuritySessions: clone(securitySessions),
        securityAlerts: clone(this.workspace.securityAlerts),
        sdkEventCatalog: buildSdkEventCatalog(),
        sdkDeliveryLog: clone(this.deliveries).filter((delivery) => delivery.endpointId === "sdk-events")
      }
    });
  }

  async fetchIntegrationCapabilities(): Promise<BackendEnvelope<Record<string, unknown>>> {
    const services = [
      ["dialogService", ["fetchDialogs", "transitionConversationStatus", "uploadAttachment", "createOutboundConversationRequest"]],
      ["clientService", ["fetchClients", "fetchClientDetail", "updateClient"]],
      ["templateService", ["fetchTemplates", "createTemplate", "updateTemplate"]],
      ["reportService", ["fetchReports", "exportReport"]],
      ["settingsService", ["fetchEmployees", "inviteEmployee", "updateEmployee", "fetchRoles", "fetchGroups", "fetchRules", "updateRule", "testRule"]],
      ["integrationService", ["fetchIntegrationWorkspace", "fetchChannelConnections", "updateChannelTypeStatus", "testChannelConnection"]],
      ["permissionService", ["fetchPermissionWorkspace", "updateRoleGrants"]],
      ["visitorService", ["fetchVisitorWorkspace", "saveProactiveRule", "triggerRescueReturn"]],
      ["automationService", ["fetchAutomationWorkspace", "validateBotFlowImport", "publishBotScenario", "testBotScenario"]],
      ["qualityService", ["fetchQualityWorkspace", "scoreDraftResponse"]],
      ["auditService", ["fetchAuditEvents", "exportAuditEvents", "redactAuditEvent"]],
      ["authService", ["getAuthState", "login", "logout", "loginTenantOperator", "getTenantOperatorState"]],
      ["tenantService", ["fetchTenants", "fetchTenantDetail", "updateTenantStatus"]],
      ["billingService", ["fetchTariffs", "previewTariffChange", "changeTenantTariff"]],
      ["platformMonitoringService", ["fetchPlatformSnapshot", "fetchComponentDrilldown", "acknowledgeComponentAlert"]],
      ["supportAdminService", ["fetchSupportUsers", "resetTwoFactor", "forceLogout", "blockUser", "startImpersonation", "stopImpersonation"]],
      ["incidentService", ["fetchIncidents", "fetchIncidentDetail", "addIncidentUpdate"]],
      ["featureFlagService", ["fetchFeatureFlags", "previewFlagChange", "updateFeatureFlag"]]
    ] as const;

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchIntegrationCapabilities",
      traceId: integrationTraceId("fetchIntegrationCapabilities"),
      partial: true,
      meta: apiMeta(),
      data: {
        services: services.map(([id, operations]) => ({
          id,
          status: "ready",
          operations,
          traceId: `trc_${id}_ready`,
          states: ["loading", "empty", "error", "partial"],
          note: "Connected to API Gateway routes."
        })),
        contract: {
          envelope: ["service", "operation", "status", "traceId", "states", "meta", "data", "error"],
          states: ["loading", "empty", "error", "partial"],
          realBackendBoundary: "replace src/services adapters with API clients"
        },
        routeGaps: [],
        backlogCoverage: [
          "permission_denial_audit",
          "channel_tests_webhook_replay",
          "audit_export_redaction",
          "support_admin_impersonation",
          "feature_flag_rollout_audit"
        ]
      }
    });
  }

  listChannelConnectionAuditEvents() {
    return this.integrationRepository.listChannelConnectionAuditEvents();
  }

  async fetchChannelConnections(tenantId: string, filters: { type?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) {
      return invalidEnvelope("fetchChannelConnections", "tenant_id_required", "tenantId is required.", {});
    }

    const type = normalizeOptionalType(filters.type);
    const connections = (await this.integrationRepository
      .listChannelConnectionsAsync({ tenantId: normalizedTenantId, type }))
      .map(maskChannelConnection);

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchChannelConnections",
      traceId: integrationTraceId("fetchChannelConnections"),
      meta: apiMeta({ tenantId: normalizedTenantId, type: type ?? "all" }),
      data: {
        availableTypes: ["sdk", "telegram", "max", "vk"],
        connections
      }
    });
  }

  async createChannelConnection(tenantId: string, payload: ChannelConnectionMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) {
      return invalidEnvelope("createChannelConnection", "tenant_id_required", "tenantId is required.", {});
    }

    const type = normalizeOptionalType(payload.type);
    const name = String(payload.name ?? "").trim();
    if (!type || !name) {
      return invalidEnvelope("createChannelConnection", "channel_type_and_name_required", "type and name are required.", {
        type: type ?? null
      });
    }
    if (isTokenManagedChannelType(type) && !hasCredentialMaterial(payload.credentials)) {
      return invalidEnvelope("createChannelConnection", "channel_token_required", `${type} token is required.`, {
        type
      });
    }
    const routingQueueId = String(payload.routingQueueId ?? (this.queueDirectoryRepository ? "" : `queue-${type}`)).trim();
    const queueError = await this.validateRoutingQueue(normalizedTenantId, routingQueueId);
    if (queueError) {
      return queueError;
    }
    const connectionId = `conn_${type}_${randomUUID()}`;
    let rawExternalId = `raw_${type}_${randomUUID()}`;
    let telegramConnection: Awaited<ReturnType<typeof saveTelegramConnectionRecord>> | null = null;
    if (type === "telegram") {
      const botToken = extractCredentialMaterial(payload.credentials);
      try {
        const telegramFetch = this.options.telegramFetch ?? resolveTestTelegramFetch(botToken);
        telegramConnection = await saveTelegramConnectionRecord({
          botToken,
          channelConnectionId: connectionId,
          fetcher: telegramFetch,
          publicWebhookBaseUrl: resolvePublicWebhookBaseUrl(),
          tenantId: normalizedTenantId
        });
        rawExternalId = `telegram:${telegramConnection.botUsername ?? telegramConnection.botId ?? "bot"}`;
      } catch (error) {
        const code = error instanceof Error ? error.message : "telegram_bot_token_rejected";
        return invalidEnvelope(
          "createChannelConnection",
          code,
          "Telegram bot token could not be validated.",
          { type }
        );
      }
    }

    const now = new Date().toISOString();
    const connection: ChannelConnectionStoredRecord = {
      chatLimit: normalizeChatLimit(payload.chatLimit),
      createdAt: now,
      credentialsMasked: Boolean(payload.credentials),
      environment: normalizeEnvironment(payload.environment),
      health: 100,
      id: connectionId,
      lastSyncAt: now,
      name,
      rawExternalId,
      routingQueueId,
      status: String(payload.status ?? "active").trim().toLowerCase(),
      tenantId: normalizedTenantId,
      traffic: "0 events",
      type,
      updatedAt: now,
      webhookUrl: resolveChannelServiceEndpoint(type, connectionId, payload.webhookUrl)
    };
    const providerCrypto = type === "vk" || type === "max"
      ? (this.options.providerCredentialCrypto ?? ProviderConnectionCrypto.fromEnvironment(
          process.env.PROVIDER_CREDENTIAL_KEY_VERSION?.trim() || "v1"
        ))
      : null;
    const saved = await this.integrationRepository.saveChannelConnectionAsync(connection);
    let providerCredential: ProviderConnectionCredentialRecord | null = null;
    let webhookSecret: string | null = null;
    if (type === "vk" || type === "max") {
      const token = extractCredentialMaterial(payload.credentials);
      const crypto = providerCrypto!;
      webhookSecret = randomUUID();
      providerCredential = await this.integrationRepository.saveProviderConnectionCredentialAsync({
        accessTokenEncrypted: JSON.stringify(crypto.encrypt(token)),
        apiVersion: type === "vk" ? String(payload.credentials?.apiVersion ?? "5.199") : null,
        channelConnectionId: saved.id,
        confirmationCodeEncrypted: type === "vk" && payload.credentials?.confirmationCode
          ? JSON.stringify(crypto.encrypt(String(payload.credentials.confirmationCode)))
          : null,
        createdAt: now,
        externalAccountId: String(payload.credentials?.groupId ?? payload.credentials?.botId ?? "pending").trim() || "pending",
        keyVersion: crypto.keyVersion,
        lastError: null,
        lastWebhookAt: null,
        provider: type,
        status: saved.status,
        tenantId: normalizedTenantId,
        updatedAt: now,
        webhookSecretEncrypted: JSON.stringify(crypto.encrypt(webhookSecret))
      });
    }
    if (telegramConnection) {
      await this.integrationRepository.saveTelegramConnectionAsync(telegramConnection);
    }
    await this.recordChannelConnectionEvent(saved.tenantId, saved.id, "channel.connection.created", "info", `${name} created`);
    const auditEvent = await this.persistChannelConnectionAuditEvent("channel.connection.create", saved, "Channel connection created");

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "createChannelConnection",
      traceId: integrationTraceId("createChannelConnection"),
      meta: apiMeta({ connectionId: saved.id, tenantId: normalizedTenantId, type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        connection: maskChannelConnection(saved),
        ...(providerCredential ? { providerRuntime: { keyVersion: providerCredential.keyVersion, provider: providerCredential.provider, webhookSecret } } : {})
      }
    });
  }

  async updateChannelConnection(tenantId: string, connectionId: string, payload: ChannelConnectionMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const connection = await this.findChannelConnection(normalizedTenantId, connectionId);
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
      const routingQueueId = String(payload.routingQueueId).trim();
      const queueError = await this.validateRoutingQueue(normalizedTenantId, routingQueueId);
      if (queueError) {
        return queueError;
      }
      connection.routingQueueId = routingQueueId;
    }
    if (payload.chatLimit !== undefined) {
      connection.chatLimit = normalizeChatLimit(payload.chatLimit);
    }
    if (payload.status !== undefined) {
      connection.status = String(payload.status).trim().toLowerCase() || connection.status;
    }
    if (payload.webhookUrl !== undefined) {
      connection.webhookUrl = resolveChannelServiceEndpoint(connection.type, connection.id, payload.webhookUrl);
    }
    if (payload.credentials) {
      connection.credentialsMasked = true;
    }
    const now = new Date().toISOString();
    connection.lastSyncAt = now;
    connection.updatedAt = now;
    const saved = await this.integrationRepository.saveChannelConnectionAsync(connection);
    await this.recordChannelConnectionEvent(saved.tenantId, saved.id, "channel.connection.updated", "info", payload.reason ?? `${saved.name} updated`);
    const auditEvent = await this.persistChannelConnectionAuditEvent("channel.connection.update", saved, payload.reason ?? "Channel connection updated");

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "updateChannelConnection",
      traceId: integrationTraceId("updateChannelConnection"),
      meta: apiMeta({ connectionId: saved.id, tenantId: normalizedTenantId, type: saved.type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        connection: maskChannelConnection(saved),
        reason: payload.reason ?? null
      }
    });
  }

  async updateChannelTypeStatus(
    tenantId: string,
    type: string,
    payload: ChannelTypeStatusMutationPayload
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) {
      return invalidEnvelope("updateChannelTypeStatus", "tenant_id_required", "tenantId is required.", {});
    }

    const normalizedType = normalizeOptionalType(type);
    if (!normalizedType) {
      return invalidEnvelope("updateChannelTypeStatus", "channel_type_required", "channel type is required.", {});
    }

    if (typeof payload.enabled !== "boolean") {
      return invalidEnvelope("updateChannelTypeStatus", "channel_enabled_required", "enabled boolean is required.", {
        type: normalizedType
      });
    }

    const connections = await this.integrationRepository.listChannelConnectionsAsync({
      tenantId: normalizedTenantId,
      type: normalizedType
    });
    if (!connections.length) {
      return notFoundEnvelope(
        "updateChannelTypeStatus",
        "channel_type_connections_not_found",
        `Channel type ${normalizedType} has no tenant connections.`,
        { tenantId: normalizedTenantId, type: normalizedType }
      );
    }

    const now = new Date().toISOString();
    const nextStatus = payload.enabled ? "active" : "disabled";
    const reason = payload.reason ?? `Channel type ${normalizedType} ${payload.enabled ? "enabled" : "disabled"}`;
    const savedConnections = await Promise.all(connections.map((connection) => this.integrationRepository.saveChannelConnectionAsync({
      ...connection,
      lastSyncAt: now,
      status: nextStatus,
      updatedAt: now
    })));
    await Promise.all(savedConnections.map((connection) =>
      this.recordChannelConnectionEvent(
        connection.tenantId,
        connection.id,
        "channel.type_status.updated",
        payload.enabled ? "info" : "warn",
        reason
      )
    ));
    const auditEvents = await Promise.all(savedConnections.map((connection) =>
      this.persistChannelConnectionAuditEvent("channel.type_status.update", connection, reason)
    ));

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "updateChannelTypeStatus",
      traceId: integrationTraceId("updateChannelTypeStatus"),
      meta: apiMeta({ tenantId: normalizedTenantId, type: normalizedType }),
      data: {
        auditEvents,
        auditIds: auditEvents.map((event) => event.id),
        channel: summarizeChannelTypeStatus(normalizedType, savedConnections, this.channels),
        connections: savedConnections.map(maskChannelConnection),
        reason
      }
    });
  }

  async deleteChannelConnection(tenantId: string, connectionId: string, payload: { reason?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const connection = await this.findChannelConnection(normalizedTenantId, connectionId);
    if (!connection) {
      return notFoundEnvelope("deleteChannelConnection", "channel_connection_not_found", `Channel connection ${connectionId} was not found.`, {
        connectionId
      });
    }

    const now = new Date().toISOString();
    connection.status = "disabled";
    connection.lastSyncAt = now;
    connection.updatedAt = now;
    const saved = await this.integrationRepository.saveChannelConnectionAsync(connection);
    await this.recordChannelConnectionEvent(saved.tenantId, saved.id, "channel.connection.disabled", "warn", payload.reason ?? `${saved.name} disabled`);
    const auditEvent = await this.persistChannelConnectionAuditEvent("channel.connection.disable", saved, payload.reason ?? "Channel connection disabled");

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "deleteChannelConnection",
      traceId: integrationTraceId("deleteChannelConnection"),
      meta: apiMeta({ connectionId: saved.id, tenantId: normalizedTenantId, type: saved.type }),
      data: {
        auditEvent,
        auditId: auditEvent.id,
        connectionId: saved.id,
        reason: payload.reason ?? null,
        status: saved.status
      }
    });
  }

  async testChannelConnectionInstance(tenantId: string, connectionId: string, payload: Omit<ChannelTestPayload, "channelId" | "connectionId">): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const connection = await this.findChannelConnection(normalizedTenantId, connectionId);
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
    await this.recordChannelConnectionEvent(connection.tenantId, connection.id, "channel.test", "info", `${mode} test queued for ${connection.name}`);
    const auditEvent = await this.persistChannelConnectionAuditEvent("channel.connection.test", connection, `${mode} test queued`);

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "testChannelConnectionInstance",
      traceId: integrationTraceId("testChannelConnectionInstance"),
      meta: apiMeta({ connectionId: connection.id, tenantId: normalizedTenantId, type: connection.type }),
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

  async fetchChannelConnectionEvents(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const connection = await this.findChannelConnection(normalizedTenantId, connectionId);
    if (!connection) {
      return notFoundEnvelope("fetchChannelConnectionEvents", "channel_connection_not_found", `Channel connection ${connectionId} was not found.`, {
        connectionId
      });
    }

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "fetchChannelConnectionEvents",
      traceId: integrationTraceId("fetchChannelConnectionEvents"),
      meta: apiMeta({ connectionId: connection.id, tenantId: normalizedTenantId, type: connection.type }),
      data: {
        connectionId: connection.id,
        events: await this.integrationRepository.listChannelConnectionEventsAsync(normalizedTenantId, connection.id)
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
    await this.integrationRepository.saveApiKeyRotationJobAsync(rotation);
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

  async createPublicApiKey(payload: PublicApiKeyCreatePayload = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return invalidEnvelope("createPublicApiKey", "api_key_name_required", "API key name is required.", { field: "name" });
    }

    const environment = normalizePublicApiEnvironment(payload.environment);
    if (!environment) {
      return invalidEnvelope("createPublicApiKey", "api_key_environment_invalid", "API key environment must be production or stage.", { field: "environment" });
    }

    const scopes = normalizePublicApiKeyScopes(payload.scopes);
    const createdAt = new Date().toISOString();
    const keyId = `key_${randomUUID()}`;
    const rawSecret = `${environment === "production" ? "sk_live" : "sk_test"}_${randomBytes(18).toString("hex")}`;
    const saved = await this.integrationRepository.savePublicApiKey({
      createdAt,
      environment,
      keyId,
      name,
      owner: "Администратор",
      rawSecret,
      scopes,
      status: "active",
      tenantId: DEFAULT_FIXTURE_TENANT_ID
    });
    // Секрет показывается один раз в этом ответе — reveal-состояние сразу гасим.
    await this.integrationRepository.consumePublicApiKeyReveal({ consumedAt: createdAt, keyId });
    const auditId = makeAuditId("key");
    await this.integrationRepository.saveApiKeyRotationAuditEvent({
      action: "public_api_key.created",
      at: createdAt,
      auditId,
      environment,
      immutable: true,
      keyId,
      keyPreview: saved.keyPreview,
      rotationId: makeQueueId("key_create"),
      status: "created"
    });

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "createPublicApiKey",
      traceId: integrationTraceId("createPublicApiKey"),
      meta: apiMeta({ keyId }),
      data: {
        auditId,
        key: toApiEnvironmentKeyView(saved),
        rawKey: rawSecret,
        rawKeyShownOnce: true
      }
    });
  }

  async revokePublicApiKey(keyId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const fixture = this.findApiKey(keyId);
    if (fixture) {
      await this.integrationRepository.ensurePublicApiKeyReference({
        createdAt: fixtureKeyCreatedAt(fixture),
        environment: fixture.env,
        keyId,
        keyPreview: fixture.keyPreview,
        name: fixture.name,
        owner: fixture.owner,
        scopes: fixture.scopes,
        status: fixtureKeyStatus(fixture),
        tenantId: DEFAULT_FIXTURE_TENANT_ID
      });
    }

    const updated = await this.integrationRepository.updatePublicApiKeyStatus({ keyId, status: "revoked" });
    if (!updated) {
      return notFoundEnvelope("revokePublicApiKey", "api_key_not_found", `API key ${keyId} was not found.`, { keyId });
    }

    const auditId = makeAuditId("key");
    await this.integrationRepository.saveApiKeyRotationAuditEvent({
      action: "public_api_key.revoked",
      at: new Date().toISOString(),
      auditId,
      environment: updated.environment,
      immutable: true,
      keyId,
      keyPreview: updated.keyPreview,
      rotationId: makeQueueId("key_revoke"),
      status: "revoked"
    });

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "revokePublicApiKey",
      traceId: integrationTraceId("revokePublicApiKey"),
      meta: apiMeta({ keyId }),
      data: {
        auditId,
        keyId,
        rawKeyShownOnce: false,
        status: "revoked"
      }
    });
  }

  async createWebhookEndpoint(payload: WebhookEndpointMutationPayload = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return invalidEnvelope("createWebhookEndpoint", "webhook_endpoint_name_required", "Webhook endpoint name is required.", { field: "name" });
    }

    const url = String(payload.url ?? "").trim();
    if (!isValidWebhookEndpointUrl(url)) {
      return invalidEnvelope("createWebhookEndpoint", "webhook_endpoint_url_invalid", "Webhook endpoint URL must be a valid http(s) URL.", { field: "url" });
    }

    const now = new Date().toISOString();
    const record = await this.integrationRepository.saveWebhookEndpointRecord({
      channel: String(payload.channel ?? "").trim() || "SDK",
      createdAt: now,
      custom: true,
      deleted: false,
      failureRate: "0%",
      id: makeQueueId("wh"),
      lastDelivery: "—",
      name,
      retries: "3 попытки / 30 сек",
      signature: "HMAC SHA-256",
      status: WEBHOOK_ENDPOINT_STATUS_ACTIVE,
      updatedAt: now,
      url
    });

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "createWebhookEndpoint",
      traceId: integrationTraceId("createWebhookEndpoint"),
      meta: apiMeta({ endpointId: record.id }),
      data: { endpoint: toWebhookEndpointView(record) }
    });
  }

  async updateWebhookEndpoint(endpointId: string, payload: WebhookEndpointMutationPayload = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.resolveWebhookEndpointView(endpointId);
    if (!current) {
      return notFoundEnvelope("updateWebhookEndpoint", "webhook_endpoint_not_found", `Webhook endpoint ${endpointId} was not found.`, { endpointId });
    }

    const name = payload.name === undefined ? String(current.name ?? "") : String(payload.name).trim();
    if (!name) {
      return invalidEnvelope("updateWebhookEndpoint", "webhook_endpoint_name_required", "Webhook endpoint name is required.", { field: "name" });
    }

    const url = payload.url === undefined ? String(current.url ?? "") : String(payload.url).trim();
    if (!isValidWebhookEndpointUrl(url)) {
      return invalidEnvelope("updateWebhookEndpoint", "webhook_endpoint_url_invalid", "Webhook endpoint URL must be a valid http(s) URL.", { field: "url" });
    }

    const status = payload.status === undefined
      ? String(current.status ?? WEBHOOK_ENDPOINT_STATUS_ACTIVE)
      : normalizeWebhookEndpointStatus(payload.status);
    if (!status) {
      return invalidEnvelope("updateWebhookEndpoint", "webhook_endpoint_status_invalid", "Webhook endpoint status must be active or disabled.", { field: "status" });
    }

    const existingRecord = (await this.integrationRepository.listWebhookEndpointRecords()).find((record) => record.id === endpointId);
    const now = new Date().toISOString();
    const record = await this.integrationRepository.saveWebhookEndpointRecord({
      channel: String(current.channel ?? "SDK"),
      createdAt: existingRecord?.createdAt ?? now,
      custom: existingRecord?.custom ?? false,
      deleted: false,
      failureRate: String(current.failureRate ?? "0%"),
      id: endpointId,
      lastDelivery: String(current.lastDelivery ?? "—"),
      name,
      retries: String(current.retries ?? "3 попытки / 30 сек"),
      signature: String(current.signature ?? "HMAC SHA-256"),
      status,
      updatedAt: now,
      url
    });

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "updateWebhookEndpoint",
      traceId: integrationTraceId("updateWebhookEndpoint"),
      meta: apiMeta({ endpointId }),
      data: { endpoint: toWebhookEndpointView(record) }
    });
  }

  async deleteWebhookEndpoint(endpointId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.resolveWebhookEndpointView(endpointId);
    if (!current) {
      return notFoundEnvelope("deleteWebhookEndpoint", "webhook_endpoint_not_found", `Webhook endpoint ${endpointId} was not found.`, { endpointId });
    }

    const existingRecord = (await this.integrationRepository.listWebhookEndpointRecords()).find((record) => record.id === endpointId);
    const now = new Date().toISOString();
    await this.integrationRepository.saveWebhookEndpointRecord({
      channel: String(current.channel ?? "SDK"),
      createdAt: existingRecord?.createdAt ?? now,
      custom: existingRecord?.custom ?? false,
      deleted: true,
      failureRate: String(current.failureRate ?? "0%"),
      id: endpointId,
      lastDelivery: String(current.lastDelivery ?? "—"),
      name: String(current.name ?? endpointId),
      retries: String(current.retries ?? "3 попытки / 30 сек"),
      signature: String(current.signature ?? "HMAC SHA-256"),
      status: String(current.status ?? WEBHOOK_ENDPOINT_STATUS_ACTIVE),
      updatedAt: now,
      url: String(current.url ?? "")
    });

    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "deleteWebhookEndpoint",
      traceId: integrationTraceId("deleteWebhookEndpoint"),
      meta: apiMeta({ endpointId }),
      data: { deleted: true, endpointId }
    });
  }

  private async resolveWebhookEndpointView(endpointId: string): Promise<Record<string, unknown> | undefined> {
    const merged = buildWebhookEndpointReadSide(this.workspace.webhookEndpoints, await this.integrationRepository.listWebhookEndpointRecords());

    return merged.find((endpoint) => String(endpoint.id) === endpointId);
  }

  async replayWebhookDelivery(payload: ReplayPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const delivery = await this.findDelivery(payload.deliveryId ?? "");

    if (!delivery) {
      return notFoundEnvelope("replayWebhookDelivery", "webhook_delivery_not_found", `Webhook delivery ${payload.deliveryId ?? "(empty)"} was not found.`, {
        deliveryId: payload.deliveryId ?? null
      });
    }

    const idempotencyKey = payload.idempotencyKey?.trim();
    const cached = idempotencyKey ? await this.findReplay(idempotencyKey) : undefined;

    if (cached) {
      if (cached.deliveryId !== delivery.id) {
        return conflictEnvelope("replayWebhookDelivery", "idempotency_key_reused", "Idempotency key was already used for a different webhook delivery replay.", {
          deliveryId: delivery.id,
          idempotencyKey,
          originalDeliveryId: cached.deliveryId
        });
      }

      await this.integrationRepository.saveWebhookReplayAuditEventAsync(createWebhookReplayAuditEvent({
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
    await this.integrationRepository.saveWebhookReplayAuditEventAsync(createWebhookReplayAuditEvent({
      action: "webhook.replay.queued",
      auditId: replay.auditId,
      delivery,
      idempotencyKey: idempotencyKey ?? null,
      replayId: replay.replayId,
      transition: webhookReplayTransition(delivery)
    }));

    if (idempotencyKey) {
      this.replayIdempotency.set(idempotencyKey, clone(replay));
      await this.integrationRepository.saveWebhookReplayAsync({
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

    const connection = await this.integrationRepository.findTelegramConnectionByTenantIdAsync(normalizedTenantId);
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
      const existing = await this.integrationRepository.findTelegramConnectionByTenantIdAsync(normalizedTenantId);
      const channelConnections = await this.integrationRepository.listChannelConnectionsAsync({ tenantId: normalizedTenantId, type: "telegram" });
      const channelConnectionId = existing?.channelConnectionId ?? (channelConnections.length === 1 ? channelConnections[0].id : "");
      if (!channelConnectionId) {
        return invalidEnvelope("saveTelegramConnection", "telegram_channel_connection_required", "Select a Telegram channel connection before saving bot credentials.", {
          tenantId: normalizedTenantId
        });
      }
      const saved = await saveTelegramConnectionRecord({
        botToken,
        channelConnectionId,
        fetcher: options.fetcher,
        publicWebhookBaseUrl: resolvePublicWebhookBaseUrl(),
        tenantId: normalizedTenantId
      }, existing);
      await this.integrationRepository.saveTelegramConnectionAsync(saved);

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
    const existing = await this.integrationRepository.findTelegramConnectionByTenantIdAsync(normalizedTenantId);
    if (!existing || existing.status === "disabled") {
      return notFoundEnvelope("disconnectTelegramConnection", "telegram_connection_not_found", "Telegram connection was not found.", {
        tenantId: normalizedTenantId
      });
    }

    const disabled = disableTelegramConnectionRecord(existing);
    await this.integrationRepository.saveTelegramConnectionAsync(disabled);

    return telegramConnectionEnvelope("disconnectTelegramConnection", {
      connection: toTelegramConnectionPublicView(disabled, resolvePublicWebhookBaseUrl())
    });
  }

  async revokeSecuritySession(sessionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const session = overlaySecuritySessions(this.sessions, await this.integrationRepository.listSecuritySessionsAsync())
      .find((item) => item.id === sessionId);

    if (!session) {
      return notFoundEnvelope("revokeSecuritySession", "security_session_not_found", `Security session ${sessionId} was not found.`, { sessionId });
    }

    session.status = "revoked";
    await this.integrationRepository.saveSecuritySessionAsync(session);

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

  private findChannelConnection(tenantId: string, connectionId: string): Promise<ChannelConnectionStoredRecord | undefined> {
    return this.integrationRepository.findChannelConnectionAsync(tenantId, connectionId);
  }

  private async validateRoutingQueue(tenantId: string, queueId: string): Promise<BackendEnvelope<Record<string, unknown>> | null> {
    if (!queueId) {
      return invalidEnvelope("validateRoutingQueue", "routing_queue_required", "An active routing queue is required.", { tenantId });
    }
    if (!this.queueDirectoryRepository) {
      return null;
    }
    const queue = await this.queueDirectoryRepository.findQueue(tenantId, queueId);
    if (!queue || queue.status !== "active") {
      return invalidEnvelope("validateRoutingQueue", "routing_queue_not_found", "The selected routing queue is not active in this tenant.", {
        queueId,
        tenantId
      });
    }
    return null;
  }

  private findChannel(channelId: string): ChannelDetail | undefined {
    return this.channels.find((channel) => channel.id === channelId || channel.channel.toLowerCase() === channelId.toLowerCase());
  }

  private async findDelivery(deliveryId: string): Promise<WebhookDelivery | undefined> {
    const fixtureDelivery = this.deliveries.find((delivery) => delivery.id === deliveryId);
    if (fixtureDelivery) {
      return fixtureDelivery;
    }

    const journalEntry = await this.integrationRepository.findWebhookDeliveryJournalEntryAsync(deliveryId);
    return journalEntry ? journalEntryToWebhookDelivery(journalEntry) : undefined;
  }

  private async findReplay(idempotencyKey: string): Promise<Record<string, unknown> | undefined> {
    const persisted = await this.integrationRepository.findWebhookReplayAsync(idempotencyKey);
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

  private async recordChannelConnectionEvent(tenantId: string, connectionId: string, action: string, severity: string, message: string): Promise<void> {
    await this.integrationRepository.saveChannelConnectionEventAsync({
      id: makeAuditId("channel_event"),
      action,
      at: new Date().toISOString(),
      connectionId,
      message,
      severity,
      tenantId
    });
  }

  private persistChannelConnectionAuditEvent(action: string, connection: ChannelConnectionStoredRecord, reason: string): Promise<ChannelConnectionAuditEventRecord> {
    const event: ChannelConnectionAuditEventRecord = {
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
    return this.integrationRepository.saveChannelConnectionAuditEventAsync(event);
  }
}

function resolveTestTelegramFetch(botToken: string): TelegramHttpFetch | undefined {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "test")) {
    return undefined;
  }

  const token = String(botToken ?? "").trim();
  if (!token.includes("qa-telegram-token")) {
    return undefined;
  }

  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        result: {
          id: 900001,
          username: "qa_telegram_bot"
        }
      };
    }
  });
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function buildSdkEventCatalog(): Array<[string, string]> {
  return [
    ["identifyUser", "Передает телефон, устройство и ID гигера"],
    ["initConversation", "Инициирует диалог по номеру телефона"],
    ["trackEntryPoint", "Фиксирует SDK, Telegram, MAX или VK"],
    ["syncTopic", "Синхронизирует тематику и запрет закрытия"]
  ];
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

function buildApiKeyReadSide(fixtures: ApiEnvironmentKey[], stored: PublicApiKeyStoredRecord[]): ApiEnvironmentKey[] {
  const fixtureIds = new Set(fixtures.map((key) => key.id));
  const overlays = new Map(stored.map((key) => [key.keyId, key]));
  const fixtureView = fixtures.map((key) => {
    const overlay = overlays.get(key.id);

    return maskApiKey(overlay?.status === "revoked" ? { ...key, status: "Revoked" } : key);
  });
  const storedView = stored
    .filter((key) => !fixtureIds.has(key.keyId))
    .map(toApiEnvironmentKeyView);

  return [...fixtureView, ...storedView];
}

function toApiEnvironmentKeyView(key: PublicApiKeyStoredRecord): ApiEnvironmentKey {
  return {
    env: key.environment,
    id: key.keyId,
    keyPreview: key.keyPreview,
    lastRotated: String(key.createdAt ?? "").slice(0, 10),
    name: key.name,
    owner: key.owner,
    protection: "Bearer + SHA-256 hash",
    scopes: clone(key.scopes),
    status: key.status === "revoked" ? "Revoked" : "Active"
  };
}

function buildWebhookEndpointReadSide(
  seedEndpoints: Array<Record<string, unknown>>,
  records: WebhookEndpointStoredRecord[]
): Array<Record<string, unknown>> {
  const overrides = new Map(records.map((record) => [record.id, record]));
  const seedIds = new Set(seedEndpoints.map((endpoint) => String(endpoint.id)));
  const seedView: Array<Record<string, unknown>> = [];
  for (const endpoint of seedEndpoints) {
    const override = overrides.get(String(endpoint.id));
    if (!override) {
      seedView.push(clone(endpoint));
      continue;
    }

    if (!override.deleted) {
      seedView.push({ ...clone(endpoint), name: override.name, status: override.status, url: override.url });
    }
  }

  const customView = records
    .filter((record) => record.custom && !record.deleted && !seedIds.has(record.id))
    .map(toWebhookEndpointView);

  return [...seedView, ...customView];
}

function toWebhookEndpointView(record: WebhookEndpointStoredRecord): Record<string, unknown> {
  return {
    channel: record.channel,
    failureRate: record.failureRate,
    id: record.id,
    lastDelivery: record.lastDelivery,
    name: record.name,
    retries: record.retries,
    signature: record.signature,
    status: record.status,
    url: record.url
  };
}

function isValidWebhookEndpointUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizePublicApiEnvironment(environment?: string): PublicApiEnvironment | undefined {
  const normalized = String(environment ?? "stage").trim().toLowerCase();

  return normalized === "production" || normalized === "stage" ? normalized : undefined;
}

function normalizePublicApiKeyScopes(scopes?: string[]): string[] {
  const normalized = (Array.isArray(scopes) ? scopes : [])
    .map((scope) => String(scope ?? "").trim())
    .filter((scope) => scope.length > 0);

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_PUBLIC_API_KEY_SCOPES];
}

function normalizeWebhookEndpointStatus(status?: string): string | undefined {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active" || normalized === WEBHOOK_ENDPOINT_STATUS_ACTIVE.toLowerCase()) {
    return WEBHOOK_ENDPOINT_STATUS_ACTIVE;
  }

  if (normalized === "disabled" || normalized === WEBHOOK_ENDPOINT_STATUS_DISABLED.toLowerCase()) {
    return WEBHOOK_ENDPOINT_STATUS_DISABLED;
  }

  return undefined;
}

function maskChannelConnection(connection: ChannelConnectionStoredRecord): Record<string, unknown> {
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

function summarizeChannelTypeStatus(
  type: string,
  connections: ChannelConnectionStoredRecord[],
  catalog: ChannelDetail[]
): Record<string, unknown> {
  const activeCount = connections.filter((connection) => connection.status === "active").length;
  const channel = catalog.find((item) =>
    normalizeOptionalType(item.id) === type
    || normalizeOptionalType(item.channel) === type
    || normalizeOptionalType(item.name) === type
  );
  const firstConnection = connections[0];

  return {
    activeCount,
    disabledCount: connections.filter((connection) => connection.status === "disabled").length,
    enabled: activeCount > 0,
    limit: firstConnection?.chatLimit ?? 0,
    name: channel?.name ?? channel?.channel ?? type,
    staff: activeCount,
    status: activeCount > 0 ? "active" : "disabled",
    total: connections.length,
    type
  };
}

function normalizeOptionalType(type?: string): string | undefined {
  const value = String(type ?? "").trim().toLowerCase();
  return value || undefined;
}

function isTokenManagedChannelType(type: string): boolean {
  return type === "telegram" || type === "max" || type === "vk";
}

function hasCredentialMaterial(credentials?: Record<string, unknown>): boolean {
  return Boolean(extractCredentialMaterial(credentials));
}

function extractCredentialMaterial(credentials?: Record<string, unknown>): string {
  if (!credentials || typeof credentials !== "object") {
    return "";
  }

  return Object.values(credentials)
    .map((value) => String(value ?? "").trim())
    .find(Boolean) ?? "";
}

function resolveChannelServiceEndpoint(type: string, connectionId: string, providedWebhookUrl?: string): string {
  if (!isTokenManagedChannelType(type)) {
    return String(providedWebhookUrl ?? "").trim();
  }

  const baseUrl = resolvePublicWebhookBaseUrl().replace(/\/+$/g, "");
  return `${baseUrl}/api/v1/integrations/${type}/webhook/${connectionId}`;
}

function normalizeTenantId(tenantId?: string): string {
  return String(tenantId ?? "").trim();
}

function normalizeChatLimit(value?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.max(1, Math.min(50, Math.round(parsed)));
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

function readInitialIntegrationState(repository: IntegrationRepository) {
  return repository.readInitialState();
}

function resolvePublicWebhookBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return String(env.PUBLIC_WEBHOOK_BASE_URL ?? env.PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4100").trim();
}
