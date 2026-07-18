import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createOutboxEvent, type OutboxEvent } from "@support-communication/events";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type {
  ConversationBotSession,
  ConversationMessage,
  ConversationQualityAssessment,
  ConversationRecord
} from "./conversation.types.js";
import { APPEAL_ANCHOR_TAG_PREFIX, REPEAT_APPEAL_TAG, recordClosedAppealHistory } from "./appeal-lifecycle.js";
import {
  ConversationAssignmentConflictError,
  ConversationRepository,
  type ConversationAssignmentRecord,
  type ConversationDeliveryReceipt,
  type ConversationLifecycleEvent,
  type ConversationMutationRecord,
  type ConversationOutboundDescriptor,
  type RealtimeEvent
} from "./conversation.repository.js";
import { createDisabledRealtimeFanoutAdapter, type RealtimeFanoutAdapter } from "./realtime.fanout.js";
import { mergeRealtimeEvents } from "./realtime.merge.js";
import { createObjectStorageSigner } from "../workspace/object-storage.js";
import type { ObjectStorageSigner, SignedObjectStorageUrl } from "../workspace/workspace.service.js";
import { WorkspaceRepository, type FileRecord } from "../workspace/workspace.repository.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { AutomationRepository } from "../automation/automation.repository.js";
import { conversationCsatFeedback } from "../quality/csat-feedback.js";
import { QualityRepository } from "../quality/quality.repository.js";

const DIALOG_SERVICE = "dialogService";
const CHANNEL_SERVICE = "channelService";
const REALTIME_SERVICE = "realtimeGateway";
const NOW_LABEL = "now";
const supportedStatuses = new Set([
  "new",
  "queued",
  "assigned",
  "active",
  "waiting_client",
  "waiting_operator",
  "transferred",
  "paused",
  "closed",
  "reopened"
]);
const supportedResolutionOutcomes = new Set([
  "resolved",
  "resolved_with_followup",
  "duplicate",
  "cancelled",
  "spam",
  "unresolved"
]);

interface DialogFilters {
  channel?: string;
  page?: number | string;
  pageSize?: number | string;
  query?: string;
  queueId?: string;
  savedPresetId?: string;
  status?: string;
  teamId?: string;
  topic?: string;
}

interface StatusPayload {
  conversationId: string;
  nextStatus?: string;
  resolutionOutcome?: string;
  roleMode?: string;
  reason?: string;
  topic?: string;
}

interface AssignmentPayload {
  conversationId: string;
  operatorId?: string;
  reason?: string;
}

interface TagsPayload {
  conversationId: string;
  tags?: unknown;
}

interface ClientPhonePayload {
  conversationId: string;
  phone?: unknown;
}

// Совпадает с looksLikePhone открытого канала: телефон в свободном формате,
// но без букв и служебных идентификаторов (visitor_*, openchat_* и т.п.).
const CLIENT_PHONE_PATTERN = /^\+?[\d\s().-]{5,20}$/;

function normalizeClientPhoneInput(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function maskSensitivePhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const suffix = digits.length > 2 ? digits.slice(-2) : "**";
  return `*** ***-**-${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPhoneFieldName(value: string): boolean {
  return /(^|[_-])(phone|mobile|telephone)([_-]|$)/i.test(value);
}

function redactBotHandoffFields(
  handoff: ConversationRecord["botHandoff"]
): ConversationRecord["botHandoff"] {
  if (!handoff) return handoff;
  const collectedFields = handoff.collectedFields
    ? Object.fromEntries(Object.entries(handoff.collectedFields).map(([key, value]) => [
      key,
      isPhoneFieldName(key) ? maskSensitivePhone(value) : value
    ]))
    : undefined;
  return {
    ...handoff,
    ...(handoff.phone ? { phone: maskSensitivePhone(handoff.phone) } : {}),
    ...(collectedFields ? { collectedFields } : {})
  };
}

function redactSensitiveConversationFields(conversation: ConversationRecord, scope: TenantScope): ConversationRecord {
  if (scope.canViewSensitive) return conversation;
  return {
    ...conversation,
    ...(conversation.botHandoff ? { botHandoff: redactBotHandoffFields(conversation.botHandoff) } : {}),
    phone: maskSensitivePhone(conversation.phone)
  };
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = typeof data[key] === "string" ? data[key].trim() : "";
  return value || undefined;
}

function botHandoffFromLifecycleEvents(
  events: ConversationLifecycleEvent[]
): ConversationRecord["botHandoff"] | undefined {
  const event = [...events].reverse().find((item) => item.eventType === "bot.handoff.created" && isRecord(item.data));
  if (!event) return undefined;
  const data = event.data;
  const citations = Array.isArray(data.citations)
    ? data.citations.flatMap((item) => {
      if (!isRecord(item)) return [];
      const sourceId = stringField(item, "sourceId");
      const title = stringField(item, "title");
      if (!sourceId || !title) return [];
      const version = Number(item.version);
      return [{ sourceId, title, ...(Number.isFinite(version) ? { version } : {}) }];
    })
    : undefined;

  return {
    ...(stringField(data, "aiOutcome") ? { aiOutcome: stringField(data, "aiOutcome") } : {}),
    ...(stringField(data, "botId") ? { botId: stringField(data, "botId") } : {}),
    ...(citations ? { citations } : {}),
    ...(isRecord(data.collectedFields) ? { collectedFields: clone(data.collectedFields) } : {}),
    ...(stringField(data, "goal") ? { goal: stringField(data, "goal") } : {}),
    ...(stringField(data, "nodeId") ? { nodeId: stringField(data, "nodeId") } : {}),
    ...(stringField(data, "phone") ? { phone: stringField(data, "phone") } : {}),
    ...(stringField(data, "queue") ? { queue: stringField(data, "queue") } : {}),
    ...(stringField(data, "reason") ? { reason: stringField(data, "reason") } : {}),
    ...(stringField(data, "scenarioName") ? { scenarioName: stringField(data, "scenarioName") } : {}),
    ...(stringField(data, "sessionState") ? { sessionState: stringField(data, "sessionState") } : {}),
    ...(stringField(data, "topic") ? { topic: stringField(data, "topic") } : {})
  };
}

const CONVERSATION_TAG_MAX_LENGTH = 32;
const CONVERSATION_TAG_LIMIT = 20;

function normalizeConversationTag(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isServiceConversationTag(tag: string): boolean {
  return tag === REPEAT_APPEAL_TAG || tag.startsWith(APPEAL_ANCHOR_TAG_PREFIX);
}

interface AppendMessagePayload {
  attachments?: Array<Record<string, unknown>>;
  conversationId: string;
  idempotencyKey?: string;
  mode?: "internal" | "reply";
  text?: string;
}

interface UploadPayload {
  channel: string;
  fileName: string;
  idempotencyKey?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface OutboundPayload {
  channel: string;
  clientName?: string;
  idempotencyKey?: string;
  message: string;
  phone: string;
  topic: string;
}

interface InboundPayload {
  attachments?: Array<Record<string, unknown>>;
  conversationId?: string;
  // Сообщение — комментарий к CSAT-оценке закрытого обращения: сохраняется
  // как отзыв в этом же диалоге и не открывает новое обращение.
  csatFeedback?: boolean;
  eventId?: string;
  text?: string;
}

interface DeliveryReceiptPayload {
  conversationId?: string;
  idempotencyKey?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
  provider?: string;
  providerEventId?: string;
  receivedAt?: string;
  status?: string;
  tenantId?: string;
  traceId?: string;
}

export interface OutboundMessageDispatchRequest {
  channel: string;
  channelConnectionId?: string;
  chatId: string;
  conversationId: string;
  descriptorId: string;
  idempotencyKey: string;
  messageId: string;
  outboxEventId?: string | null;
  tenantId: string;
  text: string;
  traceId: string;
}

export interface OutboundMessageDispatchResult {
  providerMessageId?: string;
  providerStatus?: number;
  reason?: string;
  status: "delivered" | "failed" | "skipped";
}

export interface OutboundMessageDispatcher {
  deliverMessage(request: OutboundMessageDispatchRequest): Promise<OutboundMessageDispatchResult | void> | OutboundMessageDispatchResult | void;
}

interface ConversationServiceOptions {
  attachmentStorage?: ConversationAttachmentStorage;
  automationRepository?: Pick<AutomationRepository, "listBotRuntimeInstancesAsync">;
  identityRepository?: Pick<IdentityRepository, "findTenantUsers">;
  qualityRepository?: Pick<QualityRepository, "listQualityRatings">;
  teamDirectoryRepository?: Pick<TeamDirectoryRepository, "findActiveTeamId">;
  outboundMessageDispatcher?: OutboundMessageDispatcher;
  realtimeFanout?: RealtimeFanoutAdapter;
}

interface ConversationAttachmentStorage {
  objectStorage: ObjectStorageSigner;
  workspaceRepository: Pick<WorkspaceRepository, "findFile" | "saveFile">;
}

interface TenantScope {
  actorId?: string;
  actorName?: string;
  actorType?: ConversationLifecycleEvent["actorType"];
  canViewSensitive?: boolean;
  tenantId?: string;
}

let defaultRealtimeFanout = createDisabledRealtimeFanoutAdapter("realtime_fanout_not_configured");
const LIVE_REALTIME_EVENT_LIMIT = 1_000;
let defaultOutboundMessageDispatcher: OutboundMessageDispatcher = {
  deliverMessage() {
    return { status: "skipped", reason: "outbound_dispatcher_not_configured" };
  }
};

function createDefaultAttachmentStorage(): ConversationAttachmentStorage {
  return {
    objectStorage: createObjectStorageSigner(),
    workspaceRepository: WorkspaceRepository.default()
  };
}

export class ConversationService {
  private readonly attachmentStorage: ConversationAttachmentStorage;
  private readonly automationRepository?: Pick<AutomationRepository, "listBotRuntimeInstancesAsync">;
  private readonly qualityRepository?: Pick<QualityRepository, "listQualityRatings">;
  private readonly identityRepository: Pick<IdentityRepository, "findTenantUsers">;
  private readonly teamDirectoryRepository: Pick<TeamDirectoryRepository, "findActiveTeamId">;
  private lastRealtimeOccurredAtMs = 0;
  private readonly liveRealtimeEvents: RealtimeEvent[] = [];
  private readonly outboundMessageDispatcher: OutboundMessageDispatcher;
  private readonly realtimeFanout: RealtimeFanoutAdapter;

  constructor(
    private readonly conversationRepository = ConversationRepository.default(),
    options: ConversationServiceOptions = {}
  ) {
    this.attachmentStorage = options.attachmentStorage ?? createDefaultAttachmentStorage();
    // Источники бейджей инбокса резолвятся лениво в decorateInboxConversations:
    // на момент конструирования сервиса prisma-дефолты доменов могут быть
    // еще не сконфигурированы бутстрапом.
    this.automationRepository = options.automationRepository;
    this.qualityRepository = options.qualityRepository;
    this.identityRepository = options.identityRepository ?? IdentityRepository.default();
    this.teamDirectoryRepository = options.teamDirectoryRepository ?? TeamDirectoryRepository.default();
    this.outboundMessageDispatcher = options.outboundMessageDispatcher ?? defaultOutboundMessageDispatcher;
    this.realtimeFanout = options.realtimeFanout ?? defaultRealtimeFanout;
    void this.realtimeFanout.subscribe((event) => {
      this.liveRealtimeEvents.push(event);
      if (this.liveRealtimeEvents.length > LIVE_REALTIME_EVENT_LIMIT) {
        this.liveRealtimeEvents.splice(0, this.liveRealtimeEvents.length - LIVE_REALTIME_EVENT_LIMIT);
      }
    }).catch(() => {
      // Persisted replay remains available if live fan-out subscription is degraded.
    });
  }

  static useDefaultRealtimeFanout(adapter: RealtimeFanoutAdapter): void {
    defaultRealtimeFanout = adapter;
  }

  static useDefaultOutboundMessageDispatcher(dispatcher: OutboundMessageDispatcher): void {
    defaultOutboundMessageDispatcher = dispatcher;
  }

  // Инбокс размечает диалоги статусом бот-сессии (automation) и последней
  // клиентской оценкой (quality); фильтры «У бота» и «Оценки» держатся на
  // этих полях. Обогащение не персистится и не должно ронять выдачу:
  // при деградации соседнего домена диалоги возвращаются без бейджей.
  private async decorateInboxConversations(items: ConversationRecord[]): Promise<ConversationRecord[]> {
    if (!items.length) {
      return items;
    }

    const automationRepository = this.automationRepository ?? AutomationRepository.default();
    const qualityRepository = this.qualityRepository ?? QualityRepository.default();
    const tenantIds = [...new Set(items.map((item) => String(item.tenantId ?? "").trim()).filter(Boolean))];
    const botSessions = new Map<string, ConversationBotSession>();
    const assessments = new Map<string, ConversationQualityAssessment>();

    for (const tenantId of tenantIds) {
      try {
        for (const instance of await automationRepository.listBotRuntimeInstancesAsync(tenantId)) {
          botSessions.set(`${tenantId}:${instance.conversationId}`, {
            scenarioId: instance.scenarioId,
            status: instance.status,
            updatedAt: instance.updatedAt
          });
        }
      } catch {
        // Бот-домен недоступен: инбокс отдается без признака «у бота».
      }
      try {
        for (const rating of await Promise.resolve(qualityRepository.listQualityRatings({ tenantId }))) {
          const key = `${tenantId}:${rating.conversationId}`;
          const current = assessments.get(key);
          if (!current || Date.parse(rating.createdAt) >= Date.parse(current.createdAt)) {
            assessments.set(key, { createdAt: rating.createdAt, scale: rating.scale, score: rating.score });
          }
        }
      } catch {
        // Домен оценок недоступен: инбокс отдается без клиентских оценок.
      }
    }

    if (!botSessions.size && !assessments.size) {
      return items;
    }

    return items.map((item) => {
      const key = `${String(item.tenantId ?? "").trim()}:${item.id}`;
      const botSession = botSessions.get(key);
      const qualityAssessment = assessments.get(key);
      if (!botSession && !qualityAssessment) {
        return item;
      }
      return {
        ...item,
        ...(botSession ? { botSession } : {}),
        ...(qualityAssessment ? { qualityAssessment } : {})
      };
    });
  }

  async fetchDialogs(filters: DialogFilters = {}, scope: TenantScope = {}): Promise<BackendEnvelope<{
    items: ConversationRecord[];
    pagination: { mode: string; page: number; pageSize: number; total: number };
    savedPresetId: string | null;
  }>> {
    const tenantId = String(scope.tenantId ?? "").trim();
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "fetchDialogs", { filters }) as BackendEnvelope<{
        items: ConversationRecord[];
        pagination: { mode: string; page: number; pageSize: number; total: number };
        savedPresetId: string | null;
      }>;
    }
    const conversations = await this.conversationRepository.listConversations({
      tenantId,
      take: 500,
      messageTake: 200
    });
    const filtered = conversations.filter((conversation) => {
      if (!matchesTenantScope(conversation, scope.tenantId)) {
        return false;
      }
      const statusMatches = !filters.status || filters.status === "all" || conversation.status === filters.status;
      const channelMatches = !filters.channel || filters.channel === "all" || conversation.channel.toLowerCase() === String(filters.channel).toLowerCase();
      const queueMatches = !filters.queueId || filters.queueId === "all" || conversation.queueId === filters.queueId;
      const teamMatches = !filters.teamId || filters.teamId === "all" || conversation.teamId === filters.teamId;
      const topicMatches = !filters.topic || filters.topic === "all" || (filters.topic === "none" ? !conversation.topic : conversation.topic === filters.topic);
      const query = String(filters.query ?? "").trim().toLowerCase();
      const queryMatches = !query || [
        conversation.name,
        conversation.phone,
        conversation.preview,
        conversation.channel,
        conversation.queueId ?? "",
        conversation.teamId ?? "",
        conversation.topic,
        conversation.status
      ].some((value) => value.toLowerCase().includes(query));

      return statusMatches && channelMatches && queueMatches && teamMatches && topicMatches && queryMatches;
    });
    const page = toPositiveInt(filters.page, 1);
    const pageSize = toPositiveInt(filters.pageSize, 25);
    const start = (page - 1) * pageSize;

    const pageItems = await this.decorateInboxConversations(clone(filtered.slice(start, start + pageSize)));

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchDialogs",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchDialogs"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        items: pageItems.map((conversation) => redactSensitiveConversationFields(conversation, scope)),
        pagination: {
          mode: "backend-ready",
          page,
          pageSize,
          total: filtered.length
        },
        savedPresetId: filters.savedPresetId ?? null
      }
    });
  }

  async fetchDialogDetail(conversationId: string, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(conversationId);

    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "fetchDialogDetail", "conversation_not_found", `Conversation ${conversationId} was not found.`, { conversationId });
    }
    const lifecycleEvents = await this.conversationRepository.listLifecycleEvents({
      conversationId,
      limit: 200,
      tenantId: conversation.tenantId
    });

    const [decorated] = await this.decorateInboxConversations([clone(conversation)]);
    const lifecycleBotHandoff = botHandoffFromLifecycleEvents(lifecycleEvents);
    const decoratedDetail = lifecycleBotHandoff ? { ...decorated, botHandoff: lifecycleBotHandoff } : decorated;

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchDialogDetail",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchDialogDetail"),
      meta: apiMeta({ conversationId }),
      data: {
        conversation: redactSensitiveConversationFields(decoratedDetail, scope),
        lifecycleEvents: clone(lifecycleEvents),
        messages: clone(conversation.messages)
      }
    });
  }

  async fetchConversationTimeline(
    conversationId: string,
    filters: { cursor?: string; limit?: number | string; types?: string },
    scope: TenantScope = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = String(scope.tenantId ?? "").trim();
    if (!tenantId) return tenantContextRequiredEnvelope(DIALOG_SERVICE, "fetchConversationTimeline", { conversationId });
    const conversation = await this.conversationRepository.findConversation(conversationId);
    if (!conversation || !matchesTenantScope(conversation, tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "fetchConversationTimeline", "conversation_not_found", `Conversation ${conversationId} was not found.`, { conversationId });
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const events = await this.conversationRepository.listLifecycleEvents({
      conversationId,
      cursor: filters.cursor?.trim() || undefined,
      eventTypes: String(filters.types ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      limit,
      tenantId
    });
    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchConversationTimeline",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchConversationTimeline"),
      meta: apiMeta({ conversationId }),
      data: {
        events: clone(events),
        nextCursor: events.length === limit ? events.at(-1)?.id ?? null : null
      }
    });
  }

  async fetchAssignees(scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = String(scope.tenantId ?? "").trim();
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "fetchAssignees", {});
    }

    const users = await this.identityRepository.findTenantUsers(tenantId);
    const items = users
      .filter((user) => user.status === "active")
      .map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role
      }));

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchAssignees",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchAssignees"),
      meta: apiMeta(),
      data: { items }
    });
  }

  async assignConversation(payload: AssignmentPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);
    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "assignConversation", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const tenantId = resolveConversationTenantId(conversation);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "assignConversation", { conversationId: conversation.id });
    }
    if (conversation.status === "closed") {
      return conflictEnvelope(DIALOG_SERVICE, "assignConversation", "conversation_closed", "A closed conversation cannot be assigned.", {
        conversationId: conversation.id
      });
    }

    const operatorId = String(payload.operatorId ?? "").trim();
    const reason = String(payload.reason ?? "").trim();
    if (!operatorId) {
      return invalidEnvelope(DIALOG_SERVICE, "assignConversation", "operator_required", "An operator is required.", {
        conversationId: conversation.id
      });
    }
    if (reason.length < 8) {
      return invalidEnvelope(DIALOG_SERVICE, "assignConversation", "assignment_reason_too_short", "Assignment reason must contain at least 8 characters.", {
        conversationId: conversation.id,
        minimumLength: 8
      });
    }

    const users = await this.identityRepository.findTenantUsers(tenantId);
    const operator = users.find((user) => user.id === operatorId && user.status === "active");
    if (!operator) {
      return notFoundEnvelope(DIALOG_SERVICE, "assignConversation", "operator_not_available", `Operator ${operatorId} is not active in this tenant.`, {
        conversationId: conversation.id,
        operatorId
      });
    }
    if (conversation.operatorId === operator.id) {
      return conflictEnvelope(DIALOG_SERVICE, "assignConversation", "operator_unchanged", "The conversation is already assigned to this operator.", {
        conversationId: conversation.id,
        operatorId
      });
    }

    const previousOperatorId = conversation.operatorId ?? null;
    const previousOperatorName = conversation.operatorName ?? null;
    const eventKind = previousOperatorId ? "transfer" : "assignment";
    const occurredAt = new Date().toISOString();
    conversation.operatorId = operator.id;
    conversation.operatorName = operator.name;
    conversation.teamId = await this.teamDirectoryRepository.findActiveTeamId(tenantId, operator.id)
      ?? employeeTeamId(operator.metadata);
    conversation.status = eventKind === "transfer" ? "transferred" : "assigned";
    conversation.sla = statusSla(conversation.status);
    conversation.slaTone = statusTone(conversation.status);
    conversation.time = NOW_LABEL;
    conversation.updatedAt = occurredAt;
    conversation.messages.push({
      createdAt: occurredAt,
      id: makeMessageId(eventKind),
      text: `${eventKind === "transfer" ? "Transferred" : "Assigned"}: ${previousOperatorName ?? "unassigned"} -> ${operator.name}. Reason: ${reason}`,
      time: NOW_LABEL,
      type: "event"
    });

    const realtimeEvent = this.createRealtimeEvent("conversation.updated", "conversation", conversation.id, {
      action: eventKind,
      fromOperatorId: previousOperatorId,
      reason,
      toOperatorId: operator.id
    }, tenantId);
    const lifecycleEvent = this.createLifecycleEvent("assignment.changed", conversation, realtimeEvent, scope, {
      fromOperatorId: previousOperatorId,
      fromOperatorName: previousOperatorName,
      ...(conversation.queueId ? { queueId: conversation.queueId } : {}),
      ...(conversation.teamId ? { teamId: conversation.teamId } : {}),
      toOperatorId: operator.id,
      toOperatorName: operator.name
    }, reason);
    let persisted: ConversationAssignmentRecord;
    try {
      persisted = await this.conversationRepository.assignConversation({
        analyticsRow: {
          channel: conversation.channel,
          conversationId: conversation.id,
          eventKind,
          fromOperatorId: previousOperatorId,
          id: makeQueueId(`analytics_${eventKind}`),
          occurredAt,
          source: "dialog-interface",
          tenantId,
          toOperatorId: operator.id
        },
        conversation,
        lifecycleEvent,
        realtimeEvent
      });
    } catch (error) {
      if (error instanceof ConversationAssignmentConflictError) {
        return conflictEnvelope(DIALOG_SERVICE, "assignConversation", error.code, "The responsible operator changed before this assignment was saved. Refresh the dialog and try again.", {
          conversationId: conversation.id,
          operatorId
        });
      }
      throw error;
    }
    await this.publishRealtimeEvent(persisted.realtimeEvent);

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "assignConversation",
      traceId: conversationTraceId(DIALOG_SERVICE, "assignConversation"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        action: eventKind,
        analyticsEventId: persisted.analyticsRow.id,
        auditEvent: {
          action: `conversation.${eventKind}`,
          id: makeAuditId(eventKind),
          immutable: true,
          reason
        },
        conversation: clone(persisted.conversation),
        realtimeEvent: persisted.realtimeEvent
      }
    });
  }

  async transitionConversationStatus(payload: StatusPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);
    const nextStatus = String(payload.nextStatus ?? "").trim();

    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const tenantId = resolveConversationTenantId(conversation);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "transitionConversationStatus", { conversationId: conversation.id });
    }

    if (!supportedStatuses.has(nextStatus)) {
      return invalidEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "status_unsupported", `Conversation status ${nextStatus || "(empty)"} is not supported.`, {
        conversationId: conversation.id,
        nextStatus
      });
    }

    if (conversation.status === "closed" && nextStatus === "closed") {
      return conflictEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "conversation_already_closed", "The conversation is already closed.", {
        conversationId: conversation.id
      });
    }

    if (conversation.status === "closed" && nextStatus !== "reopened") {
      return conflictEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "conversation_closed", "A closed conversation must be reopened before any other status transition.", {
        conversationId: conversation.id,
        nextStatus
      });
    }

    const nextTopic = String(payload.topic ?? conversation.topic ?? "").trim();
    const resolutionOutcome = String(payload.resolutionOutcome ?? "").trim().toLowerCase();

    if (nextStatus === "closed" && !nextTopic) {
      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "transitionConversationStatus",
        traceId: conversationTraceId(DIALOG_SERVICE, "transitionConversationStatus"),
        status: "invalid",
        meta: apiMeta({ conversationId: conversation.id }),
        data: {
          conversationId: conversation.id,
          guard: "role_channel_topic",
          nextStatus,
          roleMode: payload.roleMode,
          topicRequired: true
        },
        error: {
          code: "topic_required",
          message: "A conversation topic is required before closing the dialog."
        }
      });
    }

    if (nextStatus === "closed" && !supportedResolutionOutcomes.has(resolutionOutcome)) {
      return invalidEnvelope(DIALOG_SERVICE, "transitionConversationStatus", "resolution_outcome_required", "A valid resolution outcome is required before closing the dialog.", {
        conversationId: conversation.id,
        supportedOutcomes: [...supportedResolutionOutcomes]
      });
    }

    const previousStatus = conversation.status;
    const previousTopic = conversation.topic;
    conversation.status = nextStatus;
    conversation.topic = nextTopic || conversation.topic;
    if (nextStatus === "closed") {
      conversation.resolutionOutcome = resolutionOutcome;
      const closedAppeal = recordClosedAppealHistory(conversation, new Date().toISOString());
      conversation.previous = closedAppeal.previous;
      conversation.metadata = closedAppeal.metadata;
      conversation.updatedAt = closedAppeal.updatedAt;
    } else if (nextStatus === "reopened") {
      conversation.resolutionOutcome = undefined;
    }
    conversation.sla = statusSla(nextStatus);
    conversation.slaTone = statusTone(nextStatus);
    conversation.time = NOW_LABEL;
    const auditEvent = {
      id: makeAuditId("dialog"),
      action: "conversation.status.transition",
      from: previousStatus,
      immutable: true,
      target: conversation.id,
      to: nextStatus
    };
    const event = this.createRealtimeEvent("conversation.updated", "conversation", conversation.id, {
      fromStatus: previousStatus,
      resolutionOutcome: nextStatus === "closed" ? resolutionOutcome : null,
      toStatus: nextStatus,
      topic: conversation.topic
    }, tenantId);
    conversation.messages.push({
      createdAt: new Date().toISOString(),
      id: makeMessageId("event"),
      type: "event",
      text: `Status changed: ${previousStatus} -> ${nextStatus}${nextStatus === "closed" ? ` (${resolutionOutcome})` : ""}`,
      time: NOW_LABEL
    });
    const lifecycleEvent = this.createLifecycleEvent(
      previousStatus === nextStatus && previousTopic !== conversation.topic ? "topic.changed" : "status.changed",
      conversation,
      event,
      scope,
      {
        fromStatus: previousStatus,
        fromTopic: previousTopic,
        resolutionOutcome: nextStatus === "closed" ? resolutionOutcome : null,
        toStatus: nextStatus,
        toTopic: conversation.topic
      },
      payload.reason
    );
    const telegramSurvey = nextStatus === "closed" ? createTelegramCsatSurvey(conversation, event.traceId, tenantId) : null;
    // A reopened dialog keeps its CSAT descriptor from the first close; queueing the survey
    // again would collide on the idempotency key and roll the whole close back.
    const surveyAlreadySent = telegramSurvey
      ? Boolean(await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(telegramSurvey.descriptor.idempotencyKey ?? ""))
      : false;
    let csatSurveyDelivery: Record<string, unknown> | undefined;
    let persisted: ConversationMutationRecord;
    if (telegramSurvey && !surveyAlreadySent) {
      const queued = await this.conversationRepository.queueOutboundMessageReply({
          conversation,
          descriptor: telegramSurvey.descriptor,
          lifecycleEvent,
          outbox: telegramSurvey.outbox,
          realtimeEvent: event
        });
      csatSurveyDelivery = outboundDeliveryFromDescriptor(queued.descriptor);
      persisted = queued;
    } else {
      persisted = await this.conversationRepository.saveConversationMutation({ conversation, lifecycleEvent, realtimeEvent: event });
    }
    await this.publishRealtimeEvent(persisted.realtimeEvent);

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "transitionConversationStatus",
      traceId: conversationTraceId(DIALOG_SERVICE, "transitionConversationStatus"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent,
        conversation: clone(persisted.conversation),
        guard: "role_channel_topic",
        nextStatus,
        lifecycleEvent: persisted.lifecycleEvent,
        realtimeEvent: persisted.realtimeEvent,
        ...(csatSurveyDelivery ? { csatSurveyDelivery } : {}),
        roleMode: payload.roleMode,
        transitionId: makeQueueId("dialog_transition")
      }
    });
  }

  // Оператор управляет только видимыми тегами. Служебные метки
  // (repeat-appeal, appeal-anchor:*) сохраняются как есть: на них держится
  // группировка обращений в клиентские треды и признак повторного обращения.
  async updateConversationTags(payload: TagsPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);
    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "updateConversationTags", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const tenantId = resolveConversationTenantId(conversation);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "updateConversationTags", { conversationId: conversation.id });
    }

    if (!Array.isArray(payload.tags)) {
      return invalidEnvelope(DIALOG_SERVICE, "updateConversationTags", "tags_array_required", "tags must be an array of strings.", {
        conversationId: conversation.id
      });
    }

    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const item of payload.tags) {
      const tag = normalizeConversationTag(item);
      if (!tag || isServiceConversationTag(tag) || seen.has(tag)) {
        continue;
      }
      if (tag.length > CONVERSATION_TAG_MAX_LENGTH) {
        return invalidEnvelope(DIALOG_SERVICE, "updateConversationTags", "tag_too_long", `Each tag must contain at most ${CONVERSATION_TAG_MAX_LENGTH} characters.`, {
          conversationId: conversation.id,
          maxLength: CONVERSATION_TAG_MAX_LENGTH,
          tag
        });
      }
      seen.add(tag);
      normalized.push(tag);
    }

    if (normalized.length > CONVERSATION_TAG_LIMIT) {
      return invalidEnvelope(DIALOG_SERVICE, "updateConversationTags", "tags_limit_exceeded", `A dialog can hold at most ${CONVERSATION_TAG_LIMIT} tags.`, {
        conversationId: conversation.id,
        limit: CONVERSATION_TAG_LIMIT
      });
    }

    const serviceTags = conversation.tags.filter((tag) => isServiceConversationTag(normalizeConversationTag(tag)));
    const previousVisible = conversation.tags.filter((tag) => !isServiceConversationTag(normalizeConversationTag(tag)));
    const previousVisibleKeys = new Set(previousVisible.map((tag) => normalizeConversationTag(tag)));
    const added = normalized.filter((tag) => !previousVisibleKeys.has(tag));
    const removed = previousVisible.filter((tag) => !seen.has(normalizeConversationTag(tag)));

    if (!added.length && !removed.length) {
      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "updateConversationTags",
        traceId: conversationTraceId(DIALOG_SERVICE, "updateConversationTags"),
        meta: apiMeta({ conversationId: conversation.id }),
        data: {
          added: [],
          changed: false,
          conversation: clone(conversation),
          removed: [],
          tags: clone(conversation.tags)
        }
      });
    }

    conversation.tags = [...normalized, ...serviceTags];
    conversation.updatedAt = new Date().toISOString();
    const event = this.createRealtimeEvent("conversation.updated", "conversation", conversation.id, {
      action: "tags",
      added,
      removed
    }, tenantId);
    const lifecycleEvent = this.createLifecycleEvent("tags.changed", conversation, event, scope, {
      added,
      removed,
      tags: clone(normalized)
    });
    const persisted = await this.conversationRepository.saveConversationMutation({ conversation, lifecycleEvent, realtimeEvent: event });
    await this.publishRealtimeEvent(persisted.realtimeEvent);

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "updateConversationTags",
      traceId: conversationTraceId(DIALOG_SERVICE, "updateConversationTags"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        added,
        changed: true,
        conversation: clone(persisted.conversation),
        lifecycleEvent: persisted.lifecycleEvent,
        realtimeEvent: persisted.realtimeEvent,
        removed,
        tags: clone(persisted.conversation.tags)
      }
    });
  }

  // Каналы без телефона в профиле (Telegram, виджет, Chat API) оставляют поле
  // пустым — оператор заполняет его вручную из карточки клиента.
  async updateConversationClientPhone(payload: ClientPhonePayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);
    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "updateConversationClientPhone", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const tenantId = resolveConversationTenantId(conversation);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "updateConversationClientPhone", { conversationId: conversation.id });
    }

    if (typeof payload.phone !== "string") {
      return invalidEnvelope(DIALOG_SERVICE, "updateConversationClientPhone", "phone_string_required", "phone must be a string.", {
        conversationId: conversation.id
      });
    }

    const phone = normalizeClientPhoneInput(payload.phone);
    if (phone && !CLIENT_PHONE_PATTERN.test(phone)) {
      return invalidEnvelope(DIALOG_SERVICE, "updateConversationClientPhone", "phone_invalid", "phone must contain 5-20 digits with optional +, spaces, parentheses and dashes.", {
        conversationId: conversation.id
      });
    }

    const previousPhone = conversation.phone.trim();
    if (previousPhone === phone) {
      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "updateConversationClientPhone",
        traceId: conversationTraceId(DIALOG_SERVICE, "updateConversationClientPhone"),
        meta: apiMeta({ conversationId: conversation.id }),
        data: {
          changed: false,
          conversation: clone(conversation),
          phone
        }
      });
    }

    // У записей, созданных до разделения телефона и адреса доставки, в phone
    // мог лежать chatId/externalId. Перед перезаписью идентификатор переезжает
    // в providerConversationId, иначе ответы клиенту перестанут доставляться.
    if (previousPhone && !CLIENT_PHONE_PATTERN.test(previousPhone) && !conversation.providerConversationId) {
      conversation.providerConversationId = previousPhone;
    }

    conversation.phone = phone;
    conversation.updatedAt = new Date().toISOString();
    const event = this.createRealtimeEvent("conversation.updated", "conversation", conversation.id, {
      action: "client_phone",
      hasPhone: Boolean(phone)
    }, tenantId);
    // Сам номер в событиях не хранится: timeline доступен и ролям без права
    // просмотра контактов, поэтому фиксируется только факт изменения.
    const lifecycleEvent = this.createLifecycleEvent("client.phone.changed", conversation, event, scope, {
      hadPhone: Boolean(previousPhone),
      hasPhone: Boolean(phone)
    });
    const persisted = await this.conversationRepository.saveConversationMutation({ conversation, lifecycleEvent, realtimeEvent: event });
    await this.publishRealtimeEvent(persisted.realtimeEvent);

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "updateConversationClientPhone",
      traceId: conversationTraceId(DIALOG_SERVICE, "updateConversationClientPhone"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        changed: true,
        conversation: clone(persisted.conversation),
        lifecycleEvent: persisted.lifecycleEvent,
        phone,
        realtimeEvent: persisted.realtimeEvent
      }
    });
  }

  async resolvePublicDeliveryAttachments(
    attachments: Array<Record<string, unknown>>,
    tenantId: string
  ): Promise<Array<Record<string, unknown>>> {
    const resolved: Array<Record<string, unknown>> = [];
    for (const attachment of attachments) {
      const fileId = String(attachment?.fileId ?? "").trim();
      if (!fileId) {
        continue;
      }
      const file = await this.attachmentStorage.workspaceRepository.findFile(fileId, { tenantId });
      if (!file || !attachmentFileIsReady(file)) {
        continue;
      }
      const signedFile = await this.attachmentStorage.objectStorage.signDownload({
        fileId: file.fileId,
        fileName: file.fileName,
        objectKey: file.objectKey,
        tenantId
      });
      resolved.push({
        fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        signedFile: signedObjectStorageUrlData(signedFile)
      });
    }
    return resolved;
  }

  async appendMessage(payload: AppendMessagePayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = await this.conversationRepository.findConversation(payload.conversationId);

    if (!conversation || !matchesTenantScope(conversation, scope.tenantId)) {
      return notFoundEnvelope(DIALOG_SERVICE, "appendMessage", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const tenantId = resolveConversationTenantId(conversation);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "appendMessage", { conversationId: conversation.id });
    }

    const text = String(payload.text ?? "").trim();
    const attachments = payload.attachments ?? [];

    if (!text && !attachments.length) {
      return invalidEnvelope(DIALOG_SERVICE, "appendMessage", "message_content_required", "Message text or a ready attachment is required.", {
        conversationId: conversation.id
      });
    }

    const internal = payload.mode === "internal";
    const messageText = internal ? text || "Internal attachment" : text || "Attachment sent";
    const descriptorId = makeQueueId("delivery");
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey, descriptorId);
    const requestFingerprint = createRequestFingerprint("message_delivery", {
      attachments,
      conversationId: conversation.id,
      mode: "reply",
      text: messageText
    });

    if (!internal) {
      const existing = await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          return conflictEnvelope(DIALOG_SERVICE, "appendMessage", "idempotency_key_reused", "Idempotency key was already used for a different outbound message request.", {
            conversationId: conversation.id,
            idempotencyKey
          });
        }

        return createEnvelope({
          service: DIALOG_SERVICE,
          operation: "appendMessage",
          traceId: conversationTraceId(DIALOG_SERVICE, "appendMessage"),
          meta: apiMeta({ conversationId: conversation.id }),
          data: {
            auditEvent: {
              id: existing.auditId,
              action: "message.reply.send",
              immutable: true,
              target: conversation.id
            },
            duplicate: true,
            message: outboundMessageFromDescriptor(existing, messageText, attachments),
            outboundDelivery: outboundDeliveryFromDescriptor(existing),
            realtimeEvent: null
          }
        });
      }
    }

    const deliveryAttachments: Array<Record<string, unknown>> = [];
    if (!internal) {
      for (const attachment of attachments) {
        const fileId = String(attachment.fileId ?? "").trim();
        if (!fileId) {
          return invalidEnvelope(DIALOG_SERVICE, "appendMessage", "attachment_file_id_required", "Every outbound attachment must reference an uploaded file.", {
            conversationId: conversation.id
          });
        }
        const file = await this.attachmentStorage.workspaceRepository.findFile(fileId, { tenantId });
        if (!file || !attachmentFileIsReady(file)) {
          return invalidEnvelope(DIALOG_SERVICE, "appendMessage", "attachment_not_ready", "Attachment must finish antivirus scanning before it can be sent.", {
            conversationId: conversation.id,
            fileId
          });
        }
        const signedFile = await this.attachmentStorage.objectStorage.signDownload({
          fileId: file.fileId,
          fileName: file.fileName,
          objectKey: file.objectKey,
          tenantId
        });
        deliveryAttachments.push({
          fileId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          signedFile: signedObjectStorageUrlData(signedFile)
        });
      }
    }

    const messageCreatedAt = new Date().toISOString();
    const authorName = await this.resolveMessageAuthorName(scope, tenantId);
    const message: ConversationMessage = internal
      ? {
          createdAt: messageCreatedAt,
          id: makeMessageId("internal"),
          type: "internal",
          text: messageText,
          attachments,
          author: authorName,
          time: NOW_LABEL
        }
      : {
          createdAt: messageCreatedAt,
          id: makeMessageId("agent"),
          side: "agent",
          text: messageText,
          attachments,
          author: authorName,
          time: NOW_LABEL
        };
    conversation.messages.push(message);
    conversation.preview = message.text;
    conversation.time = NOW_LABEL;

    let event = this.createRealtimeEvent(internal ? "conversation.updated" : "message.created", "conversation", conversation.id, {
      messageId: message.id,
      mode: payload.mode ?? "reply"
    }, tenantId);
    const auditEvent = {
      id: makeAuditId(internal ? "internal_note" : "message"),
      action: internal ? "message.internal_note.create" : "message.reply.send",
      immutable: true,
      target: conversation.id
    };
    let outboundDelivery: Record<string, unknown> | null = null;

    if (internal) {
      const lifecycleEvent = this.createLifecycleEvent("internal_comment.created", conversation, event, scope, {
        attachmentCount: attachments.length,
        messageId: String(message.id)
      });
      const persisted = await this.conversationRepository.saveConversationMutation({ conversation, lifecycleEvent, realtimeEvent: event });
      event = persisted.realtimeEvent;
      await this.publishRealtimeEvent(event);
    } else {
      const descriptor = createConversationOutboundDescriptor({
        auditId: auditEvent.id,
        channel: conversation.channel,
        conversationId: conversation.id,
        deliveryState: "queued",
        id: descriptorId,
        idempotencyKey,
        kind: "message_delivery",
        messageId: String(message.id),
        payload: {
          attachmentCount: attachments.length,
          ...(deliveryAttachments.length ? { attachments: deliveryAttachments } : {}),
          ...(conversation.channelConnectionId ? { channelConnectionId: conversation.channelConnectionId } : {}),
          ...(message.author ? { author: message.author } : {}),
          conversationId: conversation.id,
          createdAt: message.createdAt,
          messageId: String(message.id),
          providerConversationId: conversation.providerConversationId ?? (conversation.phone || conversation.id),
          queue: "message-delivery",
          text: message.text
        },
        requestFingerprint,
        retryable: true,
        status: "queued",
        tenantId,
        traceId: event.traceId
      });
      const outbox = createOutboxEvent({
        aggregateId: conversation.id,
        aggregateType: "conversation",
        payload: {
          channel: conversation.channel,
          conversationId: conversation.id,
          descriptorId: descriptor.id,
          idempotencyKey,
          messageId: String(message.id),
          retryable: true
        },
        queue: "message-delivery",
        traceId: event.traceId,
        type: "message.delivery.requested"
      });
      const queued = await this.conversationRepository.queueOutboundMessageReply({
        conversation,
        descriptor,
        lifecycleEvent: this.createLifecycleEvent("message.sent", conversation, event, scope, {
          attachmentCount: attachments.length,
          messageId: String(message.id)
        }),
        outbox,
        realtimeEvent: event
      });

      event = queued.realtimeEvent;
      await this.publishRealtimeEvent(event);
      outboundDelivery = {
        channel: conversation.channel,
        deliveryState: "queued",
        descriptorId: queued.descriptor.id,
        idempotencyKey,
        outboxEventId: queued.outbox?.id ?? queued.descriptor.outboxEventId,
        queue: queued.outbox?.queue ?? queued.descriptor.payload.queue,
        retryable: true
      };
      const dispatchResult = await this.dispatchOutboundMessageReply({
        // phone — только legacy-фолбэк для записей, созданных до разделения
        // телефона и адреса доставки; телефон оператора его не перезапишет.
        chatId: conversation.providerConversationId ?? (conversation.phone || conversation.id),
        conversation,
        descriptor: queued.descriptor,
        event,
        message,
        outboxEventId: queued.outbox?.id ?? queued.descriptor.outboxEventId
      });
      if (dispatchResult?.status === "delivered" || dispatchResult?.status === "failed") {
        outboundDelivery = {
          ...outboundDelivery,
          deliveryState: dispatchResult.status,
          providerMessageId: dispatchResult.providerMessageId,
          providerStatus: dispatchResult.providerStatus,
          reason: dispatchResult.reason
        };
      }
    }

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "appendMessage",
      traceId: conversationTraceId(DIALOG_SERVICE, "appendMessage"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent,
        message: clone(message),
        outboundDelivery,
        realtimeEvent: event
      }
    });
  }

  async uploadAttachment(payload: UploadPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const channel = String(payload.channel ?? "").trim();
    const fileName = String(payload.fileName ?? "").trim();
    const { idempotencyKey: requestedIdempotencyKey } = payload;
    const sizeBytes = payload.sizeBytes ?? 0;
    if (!channel || !fileName) {
      return invalidEnvelope(DIALOG_SERVICE, "uploadAttachment", "attachment_payload_required", "channel and fileName are required.", {
        channel
      });
    }

    if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
      return invalidEnvelope(DIALOG_SERVICE, "uploadAttachment", "attachment_size_invalid", "sizeBytes must be a non-negative finite number.", {
        channel,
        fileName
      });
    }

    const tenantId = requiredTenantId(scope.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "uploadAttachment", { channel, fileName });
    }

    const traceId = conversationTraceId(DIALOG_SERVICE, "uploadAttachment");
    const attachmentId = makeQueueId("attachment");
    const fileId = attachmentId;
    const mimeType = normalizeMimeType(payload.mimeType);
    const idempotencyKey = normalizeIdempotencyKey(requestedIdempotencyKey, attachmentId);
    const requestFingerprint = createRequestFingerprint("attachment_upload", {
      channel,
      fileName,
      sizeBytes
    });
    const existing = await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return conflictEnvelope(DIALOG_SERVICE, "uploadAttachment", "idempotency_key_reused", "Idempotency key was already used for a different attachment upload request.", {
          channel,
          idempotencyKey
        });
      }

      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "uploadAttachment",
        traceId,
        meta: apiMeta({ channel }),
        data: {
          ...attachmentUploadDataFromDescriptor(existing),
          duplicate: true
        }
      });
    }

    const auditId = makeAuditId("attachment");
    const fileRecord: FileRecord = {
      auditId,
      channel,
      fileId,
      fileName: sanitizeAttachmentFileName(fileName),
      mimeType,
      objectKey: createAttachmentObjectKey(),
      scanState: "pending",
      sizeBytes,
      storageState: "upload_descriptor_ready",
      tenantId
    };
    const persistedFile = await this.attachmentStorage.workspaceRepository.saveFile(fileRecord);
    const [signedUpload, signedFile] = await Promise.all([
      this.attachmentStorage.objectStorage.signUpload({
        contentType: persistedFile.mimeType,
        fileId: persistedFile.fileId,
        fileName: persistedFile.fileName,
        objectKey: persistedFile.objectKey,
        sizeBytes: persistedFile.sizeBytes,
        tenantId: persistedFile.tenantId ?? tenantId
      }),
      this.attachmentStorage.objectStorage.signDownload({
        fileId: persistedFile.fileId,
        fileName: persistedFile.fileName,
        objectKey: persistedFile.objectKey,
        tenantId: persistedFile.tenantId ?? tenantId
      })
    ]);
    const descriptor = createConversationOutboundDescriptor({
      auditId,
      channel,
      conversationId: null,
      deliveryState: "not_sent",
      id: attachmentId,
      idempotencyKey,
      kind: "attachment_upload",
      messageId: null,
      payload: {
        antivirusState: "scan_pending",
        channel,
        deliveryState: "not_sent",
        fileId,
        fileName: persistedFile.fileName,
        mimeType: persistedFile.mimeType,
        queue: "file-scan",
        signedFile: signedObjectStorageUrlData(signedFile),
        signedUpload: signedObjectStorageUrlData(signedUpload),
        sizeBytes,
        storageState: "upload_queued"
      },
      requestFingerprint,
      retryable: true,
      status: "upload_queued",
      tenantId,
      traceId
    });
    const persisted = await this.conversationRepository.recordOutboundDescriptor({ descriptor });
    const uploadPolicy = {
      deliveryState: "not_sent",
      queue: "file-scan",
      retryable: true,
      scanState: "scan_pending",
      storageState: "upload_queued"
    };

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "uploadAttachment",
      traceId,
      meta: apiMeta({ channel }),
      data: {
        id: attachmentId,
        fileId,
        channel,
        fileName: persistedFile.fileName,
        mimeType: persistedFile.mimeType,
        sizeBytes,
        storageState: "upload_queued",
        antivirusState: "scan_pending",
        deliveryState: "not_sent",
        objectKeyExposed: false,
        auditId,
        descriptorId: persisted.descriptor.id,
        outboxEventId: null,
        queue: uploadPolicy.queue,
        signedUpload: signedObjectStorageUrlData(signedUpload),
        uploadPolicy
      }
    });
  }

  async finalizeAttachmentUpload(payload: { checksum?: string; fileId: string }, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const fileId = String(payload.fileId ?? "").trim();
    if (!fileId) {
      return invalidEnvelope(DIALOG_SERVICE, "finalizeAttachmentUpload", "attachment_file_id_required", "fileId is required.", {});
    }

    const tenantId = requiredTenantId(scope.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "finalizeAttachmentUpload", { fileId });
    }

    const { descriptor, file } = await this.findAttachmentUploadFile(fileId, tenantId);
    if (!descriptor || !file) {
      return notFoundEnvelope(DIALOG_SERVICE, "finalizeAttachmentUpload", "attachment_file_not_found", `Attachment file ${fileId} was not found.`, { fileId });
    }

    if (attachmentFileIsReady(file)) {
      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "finalizeAttachmentUpload",
        traceId: conversationTraceId(DIALOG_SERVICE, "finalizeAttachmentUpload"),
        meta: apiMeta({ fileId }),
        data: attachmentUploadDataFromFile(file, descriptor)
      });
    }

    let objectMetadata: Awaited<ReturnType<NonNullable<ObjectStorageSigner["getObjectMetadata"]>>> | undefined;
    if (this.attachmentStorage.objectStorage.getObjectMetadata) {
      objectMetadata = await this.attachmentStorage.objectStorage.getObjectMetadata({
        fileId: file.fileId,
        fileName: file.fileName,
        objectKey: file.objectKey,
        tenantId: file.tenantId ?? tenantId
      });

      if (!objectMetadata) {
        return attachmentFinalizeDeniedEnvelope(file, descriptor, "object_metadata_missing", "Uploaded object metadata was not found.");
      }

      if (objectMetadata.sizeBytes !== undefined && objectMetadata.sizeBytes !== file.sizeBytes) {
        return attachmentFinalizeDeniedEnvelope(file, descriptor, "object_size_mismatch", "Uploaded object size does not match the upload descriptor.");
      }

      const checksum = String(payload.checksum ?? "").trim();
      if (objectMetadata.checksum && checksum && objectMetadata.checksum !== checksum) {
        return attachmentFinalizeDeniedEnvelope(file, descriptor, "object_checksum_mismatch", "Uploaded object checksum does not match the finalize checksum.");
      }
    }

    const checksum = String(payload.checksum ?? objectMetadata?.checksum ?? "").trim();
    const persisted = await this.attachmentStorage.workspaceRepository.saveFile({
      ...file,
      ...(checksum ? { checksum } : {}),
      scanState: "scan_pending",
      storageState: "uploaded"
    });
    const existingScanEvent = (await this.conversationRepository.listOutboxEvents())
      .find((event) => event.type === "attachment.upload.requested" && stringValue(event.payload.fileId, "") === fileId);
    if (!existingScanEvent) {
      await this.conversationRepository.enqueueOutboxEvent(createOutboxEvent({
        aggregateId: descriptor.id,
        aggregateType: "attachment",
        payload: {
          channel: descriptor.channel,
          descriptorId: descriptor.id,
          fileId,
          fileName: persisted.fileName,
          sizeBytes: persisted.sizeBytes
        },
        queue: "file-scan",
        traceId: descriptor.traceId,
        type: "attachment.upload.requested"
      }));
    }

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "finalizeAttachmentUpload",
      traceId: conversationTraceId(DIALOG_SERVICE, "finalizeAttachmentUpload"),
      meta: apiMeta({ fileId }),
      data: attachmentUploadDataFromFile(persisted, descriptor)
    });
  }

  private async resolveMessageAuthorName(scope: TenantScope, tenantId: string): Promise<string> {
    const actorId = scope.actorId?.trim() ?? "";
    if (actorId && scope.actorType === "operator") {
      const users = await this.identityRepository.findTenantUsers(tenantId);
      const operatorName = users.find((user) => user.id === actorId)?.name?.trim();
      if (operatorName) {
        return operatorName;
      }
    }
    return scope.actorName?.trim() || actorId || "Operator";
  }

  async fetchAttachmentUploadStatus(fileId: string, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return invalidEnvelope(DIALOG_SERVICE, "fetchAttachmentUploadStatus", "attachment_file_id_required", "fileId is required.", {});
    }

    const tenantId = requiredTenantId(scope.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "fetchAttachmentUploadStatus", { fileId: normalizedFileId });
    }

    const { descriptor, file } = await this.findAttachmentUploadFile(normalizedFileId, tenantId);
    if (!descriptor || !file) {
      return notFoundEnvelope(DIALOG_SERVICE, "fetchAttachmentUploadStatus", "attachment_file_not_found", `Attachment file ${normalizedFileId} was not found.`, { fileId: normalizedFileId });
    }

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "fetchAttachmentUploadStatus",
      traceId: conversationTraceId(DIALOG_SERVICE, "fetchAttachmentUploadStatus"),
      meta: apiMeta({ fileId: normalizedFileId }),
      data: attachmentUploadDataFromFile(file, descriptor)
    });
  }

  async createOutboundConversationRequest(payload: OutboundPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const channel = String(payload.channel ?? "").trim();
    const message = String(payload.message ?? "").trim();
    const phone = String(payload.phone ?? "").trim();
    const topic = String(payload.topic ?? "").trim();
    const clientName = String(payload.clientName ?? "").trim();
    if (!phone || !channel || !message) {
      return invalidEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", "outbound_payload_required", "phone, channel and message are required.", {
        channel,
        phone
      });
    }

    if (!topic) {
      return invalidEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", "topic_required", "topic is required for outbound conversation delivery.", {
        channel,
        phone
      });
    }

    const tenantId = requiredTenantId(scope.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", { channel, phone });
    }

    const traceId = conversationTraceId(DIALOG_SERVICE, "createOutboundConversationRequest");
    const backendQueueId = makeQueueId("outbound");
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey, backendQueueId);
    const descriptorPayload = {
      ...(clientName ? { clientName } : {}),
      channel,
      message,
      phone,
      queue: "message-delivery",
      topic
    };
    const requestFingerprint = createRequestFingerprint("outbound_conversation", descriptorPayload);
    const existing = await this.conversationRepository.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return conflictEnvelope(DIALOG_SERVICE, "createOutboundConversationRequest", "idempotency_key_reused", "Idempotency key was already used for a different outbound conversation request.", {
          channel,
          idempotencyKey,
          phone
        });
      }

      let queuedConversation = await this.conversationRepository.findConversation(existing.conversationId ?? existing.id);
      if (!queuedConversation) {
        const recovered = createQueuedOutboundConversationRecord(existing, message, clientName, await this.resolveMessageAuthorName(scope, tenantId));
        const recoveredRealtime = this.createRealtimeEvent("conversation.created", "conversation", recovered.id, {
          channel,
          direction: "outbound"
        }, tenantId);
        const mutation = await this.conversationRepository.saveConversationMutation({
          conversation: recovered,
          lifecycleEvent: this.createLifecycleEvent("conversation.created", recovered, recoveredRealtime, scope, {
            channel,
            direction: "outbound",
            topic
          }),
          realtimeEvent: recoveredRealtime
        });
        queuedConversation = mutation.conversation;
        await this.publishRealtimeEvent(mutation.realtimeEvent);
      }
      return createEnvelope({
        service: DIALOG_SERVICE,
        operation: "createOutboundConversationRequest",
        traceId,
        meta: apiMeta({ channel }),
        data: {
          ...outboundConversationDataFromDescriptor(existing),
          conversationId: queuedConversation.id,
          duplicate: true
        }
      });
    }

    const auditId = makeAuditId("outbound");
    const descriptor = createConversationOutboundDescriptor({
      auditId,
      channel,
      conversationId: backendQueueId,
      deliveryState: "queued",
      id: backendQueueId,
      idempotencyKey,
      kind: "outbound_conversation",
      messageId: null,
      payload: descriptorPayload,
      requestFingerprint,
      retryable: true,
      status: "queued",
      tenantId,
      traceId
    });
    const outbox = createOutboxEvent({
      aggregateId: backendQueueId,
      aggregateType: "conversation_outbound",
      payload: {
        channel,
        descriptorId: descriptor.id,
        phone,
        topic
      },
      queue: "message-delivery",
      traceId,
      type: "conversation.outbound.requested"
    });
    const queuedConversationRecord = createQueuedOutboundConversationRecord(descriptor, message, clientName, await this.resolveMessageAuthorName(scope, tenantId));
    const realtimeEvent = this.createRealtimeEvent("conversation.created", "conversation", queuedConversationRecord.id, {
      channel,
      direction: "outbound"
    }, tenantId);
    const persisted = await this.conversationRepository.queueOutboundConversation({
      conversation: queuedConversationRecord,
      descriptor,
      lifecycleEvent: this.createLifecycleEvent("conversation.created", queuedConversationRecord, realtimeEvent, scope, {
        channel,
        direction: "outbound",
        topic
      }),
      outbox,
      realtimeEvent
    });
    const queuedConversation = persisted.conversation;
    await this.publishRealtimeEvent(persisted.realtimeEvent);

    return createEnvelope({
      service: DIALOG_SERVICE,
      operation: "createOutboundConversationRequest",
      traceId,
      meta: apiMeta({ channel }),
      data: {
        ...clone({
          ...(clientName ? { clientName } : {}),
          channel,
          message,
          phone,
          topic
        }),
        backendQueueId,
        conversationId: queuedConversation.id,
        status: "queued",
        consentCheck: "required_before_send",
        auditId,
        descriptorId: persisted.descriptor.id,
        outboxEventId: persisted.outbox?.id,
        queue: persisted.outbox?.queue
      }
    });
  }

  async fetchChannels(): Promise<BackendEnvelope<{ items: Array<Record<string, unknown>> }>> {
    const items = await this.conversationRepository.listChannelCatalog();
    return createEnvelope({
      service: CHANNEL_SERVICE,
      operation: "fetchChannels",
      traceId: conversationTraceId(CHANNEL_SERVICE, "fetchChannels"),
      partial: true,
      meta: apiMeta(),
      data: {
        items: clone(items)
      }
    });
  }

  async normalizeInboundEvent(channel: string, payload: InboundPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const eventId = String(payload.eventId ?? "").trim();

    if (!eventId) {
      return invalidEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", "event_id_required", "Inbound eventId is required for idempotency.", {
        channel
      });
    }

    if (await this.conversationRepository.findInboundEvent(channel, eventId)) {
      return createEnvelope({
        service: CHANNEL_SERVICE,
        operation: "normalizeInboundEvent",
        traceId: conversationTraceId(CHANNEL_SERVICE, "normalizeInboundEvent"),
        meta: apiMeta({ channel, eventId }),
        data: {
          duplicate: true,
          eventId,
          message: null
        }
      });
    }

    const conversation = await this.conversationRepository.findConversation(payload.conversationId ?? "");

    if (!conversation) {
      return notFoundEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        channel,
        conversationId: payload.conversationId
      });
    }

    const tenantId = resolveConversationTenantId(conversation);
    if (!tenantId) {
      return tenantContextRequiredEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", { channel, conversationId: conversation.id });
    }

    const text = String(payload.text ?? "").trim();
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

    if (!text && !attachments.length) {
      return invalidEnvelope(CHANNEL_SERVICE, "normalizeInboundEvent", "message_content_required", "Inbound message text or attachment is required.", {
        channel,
        conversationId: conversation.id
      });
    }

    const csatFeedback = payload.csatFeedback === true;
    const feedbackState = csatFeedback ? conversationCsatFeedback(conversation) : null;
    const message: ConversationMessage = {
      createdAt: new Date().toISOString(),
      id: makeMessageId(csatFeedback ? "feedback" : "client"),
      side: "client",
      text: text || "Attachment received",
      ...(csatFeedback ? { type: "csat_feedback" as const } : {}),
      ...(attachments.length ? { attachments: clone(attachments) } : {}),
      time: NOW_LABEL
    };
    conversation.messages.push(message);
    conversation.preview = csatFeedback ? `Отзыв: ${message.text}` : message.text;
    conversation.time = NOW_LABEL;
    if (csatFeedback) {
      // Отзыв получен: закрытое обращение перестает ждать комментарий,
      // следующее сообщение клиента снова откроет новое обращение.
      conversation.metadata = {
        ...(conversation.metadata ?? {}),
        csatFeedback: {
          offeredAt: feedbackState?.offeredAt ?? new Date().toISOString(),
          ratingId: feedbackState?.ratingId ?? "",
          state: "received"
        }
      };
    }
    const event = this.createRealtimeEvent("message.created", "conversation", conversation.id, {
      channel,
      ...(csatFeedback ? { csatFeedback: true } : {}),
      eventId,
      messageId: message.id
    }, tenantId);
    const receivedAt = new Date().toISOString();
    const persisted = await this.conversationRepository.recordInboundMessage({
      conversation,
      lifecycleEvent: this.createLifecycleEvent(csatFeedback ? "quality.feedback.received" : "message.received", conversation, event, { actorType: "client", tenantId }, {
        channel,
        messageId: String(message.id),
        ...(feedbackState?.ratingId ? { ratingId: feedbackState.ratingId } : {})
      }),
      realtimeEvent: event,
      inboundEvent: {
      channel,
      conversationId: conversation.id,
      eventId,
      messageId: String(message.id),
      receivedAt,
      traceId: event.traceId
      }
    });
    await this.publishRealtimeEvent(persisted.realtimeEvent);

    return createEnvelope({
      service: CHANNEL_SERVICE,
      operation: "normalizeInboundEvent",
      traceId: conversationTraceId(CHANNEL_SERVICE, "normalizeInboundEvent"),
      meta: apiMeta({ channel, eventId }),
      data: {
        duplicate: false,
        eventId,
        message: clone(message),
        realtimeEvent: event
      }
    });
  }

  async recordDeliveryReceipt(channel: string, payload: DeliveryReceiptPayload, scope: TenantScope = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const provider = String(payload.provider ?? "").trim();
    const providerEventId = String(payload.providerEventId ?? "").trim();
    const messageId = String(payload.messageId ?? "").trim();
    const status = String(payload.status ?? "").trim();
    const tenantId = requiredTenantId(scope.tenantId ?? payload.tenantId);

    if (!provider || !providerEventId) {
      return invalidEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", "delivery_receipt_payload_required", "provider, providerEventId, messageId and status are required.", {
        channel,
        messageId,
        provider,
        providerEventId
      });
    }

    if (!tenantId) {
      return tenantContextRequiredEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", { channel, messageId, provider, providerEventId });
    }

    const existingReceipt = (await this.conversationRepository.listDeliveryReceipts({ tenantId }))
      .find((receipt) => receipt.provider === provider && receipt.providerEventId === providerEventId);
    if (existingReceipt) {
      return createEnvelope({
        service: CHANNEL_SERVICE,
        operation: "recordDeliveryReceipt",
        traceId: payload.traceId ?? existingReceipt.traceId,
        meta: apiMeta({ channel, messageId, provider, providerEventId }),
        data: {
          duplicate: true,
          receipt: clone(existingReceipt),
          realtimeEvent: null
        }
      });
    }

    if (!messageId || !status) {
      return invalidEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", "delivery_receipt_payload_required", "provider, providerEventId, messageId and status are required.", {
        channel,
        messageId,
        provider,
        providerEventId
      });
    }

    const outboundDescriptors = await this.conversationRepository.listOutboundDescriptors({ channel, tenantId });
    const matchingDescriptor = outboundDescriptors.find((descriptor) => descriptor.messageId === messageId);
    const conversationId = String(payload.conversationId ?? matchingDescriptor?.conversationId ?? "").trim();
    const conversation = await this.conversationRepository.findConversation(conversationId);

    if (!conversation || !matchesTenantScope(conversation, tenantId)) {
      return notFoundEnvelope(CHANNEL_SERVICE, "recordDeliveryReceipt", "conversation_not_found", `Conversation ${conversationId || "(empty)"} was not found.`, {
        channel,
        conversationId,
        messageId
      });
    }

    const traceId = payload.traceId ?? conversationTraceId(CHANNEL_SERVICE, "recordDeliveryReceipt");
    const receiptId = makeQueueId("receipt");
    const receiptInput: ConversationDeliveryReceipt = {
      channel,
      conversationId: conversation.id,
      id: receiptId,
      idempotencyKey: normalizeIdempotencyKey(payload.idempotencyKey, `${provider}:${providerEventId}`),
      messageId,
      payload: payload.payload ?? null,
      provider,
      providerEventId,
      receivedAt: payload.receivedAt ?? new Date().toISOString(),
      status,
      tenantId,
      traceId
    };
    const receipt = await this.conversationRepository.recordDeliveryReceipt(receiptInput);
    if (receipt.id !== receiptId) {
      return createEnvelope({
        service: CHANNEL_SERVICE,
        operation: "recordDeliveryReceipt",
        traceId: payload.traceId ?? receipt.traceId,
        meta: apiMeta({ channel, messageId, provider, providerEventId }),
        data: {
          duplicate: true,
          receipt: clone(receipt),
          realtimeEvent: null
        }
      });
    }

    const realtimeEvent = await this.recordRealtimeEvent("message.delivery.updated", "conversation", conversation.id, {
      channel,
      messageId,
      provider,
      providerEventId,
      receiptId: receipt.id,
      status: receipt.status
    }, receipt.tenantId);

    return createEnvelope({
      service: CHANNEL_SERVICE,
      operation: "recordDeliveryReceipt",
      traceId,
      meta: apiMeta({ channel, messageId, provider, providerEventId }),
      data: {
        duplicate: false,
        receipt: clone(receipt),
        realtimeEvent
      }
    });
  }

  async fetchRealtimeEvents(
    filters: { limit?: number | string; since?: string } = {},
    scope: TenantScope = {}
  ): Promise<BackendEnvelope<{ events: RealtimeEvent[]; filters: { limit?: number | string; since?: string } }>> {
    const tenantId = String(scope.tenantId ?? "").trim();
    if (!tenantId) {
      return tenantContextRequiredEnvelope(REALTIME_SERVICE, "fetchRealtimeEvents", { filters }) as BackendEnvelope<{
        events: RealtimeEvent[];
        filters: { limit?: number | string; since?: string };
      }>;
    }
    const limit = boundedRealtimeLimit(filters.limit);
    const mergedEvents = mergeRealtimeEvents([
      await this.conversationRepository.listRealtimeEvents({ tenantId, since: filters.since, take: limit }),
      this.liveRealtimeEvents.filter((event) => event.tenantId === tenantId)
    ], filters.since);
    const events = filters.since ? mergedEvents.slice(0, limit) : mergedEvents.slice(-limit);

    return createEnvelope({
      service: REALTIME_SERVICE,
      operation: "fetchRealtimeEvents",
      traceId: conversationTraceId(REALTIME_SERVICE, "fetchRealtimeEvents"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        events: clone(events),
        filters
      }
    });
  }

  private async recordRealtimeEvent(
    eventName: string,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    tenantId: string
  ): Promise<RealtimeEvent> {
    return this.appendAndPublishRealtimeEvent(this.createRealtimeEvent(eventName, resourceType, resourceId, data, tenantId));
  }

  private async dispatchOutboundMessageReply(input: {
    chatId: string;
    conversation: ConversationRecord;
    descriptor: ConversationOutboundDescriptor;
    event: RealtimeEvent;
    message: ConversationMessage;
    outboxEventId?: string | null;
  }): Promise<OutboundMessageDispatchResult | null> {
    try {
      const result = await this.outboundMessageDispatcher.deliverMessage({
        channel: input.conversation.channel,
        ...(input.conversation.channelConnectionId ? { channelConnectionId: input.conversation.channelConnectionId } : {}),
        chatId: input.chatId,
        conversationId: input.conversation.id,
        descriptorId: input.descriptor.id,
        idempotencyKey: input.descriptor.idempotencyKey ?? input.descriptor.id,
        messageId: String(input.message.id),
        outboxEventId: input.outboxEventId ?? null,
        tenantId: resolveConversationTenantId(input.conversation),
        text: input.message.text,
        traceId: input.event.traceId
      });
      return result ?? null;
    } catch (error) {
      return {
        reason: error instanceof Error ? error.message : "outbound_dispatch_failed",
        status: "failed"
      };
    }
  }

  private async findAttachmentUploadFile(fileId: string, tenantId: string): Promise<{
    descriptor?: ConversationOutboundDescriptor;
    file?: FileRecord;
  }> {
    const [file, descriptors] = await Promise.all([
      this.attachmentStorage.workspaceRepository.findFile(fileId, { tenantId }),
      this.conversationRepository.listOutboundDescriptors({ kind: "attachment_upload", tenantId })
    ]);
    const descriptor = descriptors.find((item) => stringValue(item.payload.fileId, item.id) === fileId);

    return { descriptor, file };
  }

  private async appendAndPublishRealtimeEvent(event: RealtimeEvent): Promise<RealtimeEvent> {
    const persisted = await this.conversationRepository.appendRealtimeEvent(event);
    await this.publishRealtimeEvent(persisted);
    return persisted;
  }

  private async publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
    try {
      await this.realtimeFanout.publish(event);
    } catch {
      // Persisted replay remains the source of truth when live fan-out is degraded.
    }
  }

  private createRealtimeEvent(
    eventName: string,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    tenantId: string
  ): RealtimeEvent {
    if (!tenantId) {
      throw new Error("tenant_context_required");
    }

    const occurredAtMs = Math.max(Date.now(), this.lastRealtimeOccurredAtMs + 1);
    this.lastRealtimeOccurredAtMs = occurredAtMs;

    return {
      eventId: makeQueueId("rt"),
      eventName,
      occurredAt: new Date(occurredAtMs).toISOString(),
      resourceId,
      resourceType,
      schemaVersion: "v1",
      tenantId,
      traceId: conversationTraceId(REALTIME_SERVICE, eventName),
      data
    };
  }

  private createLifecycleEvent(
    eventType: ConversationLifecycleEvent["eventType"],
    conversation: ConversationRecord,
    realtimeEvent: RealtimeEvent,
    scope: TenantScope,
    data: Record<string, unknown>,
    reason?: string
  ): ConversationLifecycleEvent {
    return {
      actorId: scope.actorId?.trim() || null,
      actorName: scope.actorName?.trim() || null,
      actorType: scope.actorType ?? "system",
      conversationId: conversation.id,
      data: clone(data),
      eventType,
      id: makeQueueId("lifecycle"),
      ingestedAt: realtimeEvent.occurredAt,
      occurredAt: realtimeEvent.occurredAt,
      reason: reason?.trim() || null,
      schemaVersion: "conversation-lifecycle/v1",
      source: "conversation-service",
      sourceEventId: realtimeEvent.eventId,
      tenantId: realtimeEvent.tenantId,
      traceId: realtimeEvent.traceId
    };
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function conversationTraceId(service: string, operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(service, operation);
}

function normalizeIdempotencyKey(value: unknown, fallback: string): string {
  const key = String(value ?? "").trim();
  if (!key) {
    return fallback;
  }

  // Workers forward the key as an idempotency-key HTTP header, and fetch
  // rejects non-ASCII header values (e.g. Cyrillic file names in client keys).
  return /^[\x21-\x7e]+$/.test(key) ? key : encodeURIComponent(key);
}

function requiredTenantId(value: unknown): string | null {
  const tenantId = String(value ?? "").trim();
  return tenantId || null;
}

function createRequestFingerprint(scope: string, payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify({ payload, scope }))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

type CreateConversationOutboundDescriptorInput = Omit<ConversationOutboundDescriptor, "createdAt" | "outboxEventId"> & {
  createdAt?: string;
  outboxEventId?: string | null;
};

function createConversationOutboundDescriptor(input: CreateConversationOutboundDescriptorInput): ConversationOutboundDescriptor {
  if (!input.tenantId) {
    throw new Error("tenant_context_required");
  }

  return {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
    outboxEventId: input.outboxEventId ?? null
  };
}

function createTelegramCsatSurvey(
  conversation: ConversationRecord,
  traceId: string,
  tenantId: string
): { descriptor: ConversationOutboundDescriptor; outbox: OutboxEvent } | null {
  if (conversation.channel.trim().toLowerCase() !== "telegram") {
    return null;
  }

  const providerConversationId = telegramChatIdFromConversation(conversation);
  if (!providerConversationId) {
    return null;
  }

  const idempotencyKey = `quality:csat:${conversation.id}`;
  const messageId = `csat-survey:${conversation.id}`;
  const descriptor = createConversationOutboundDescriptor({
    auditId: null,
    channel: conversation.channel,
    conversationId: conversation.id,
    deliveryState: "queued",
    id: makeQueueId("delivery"),
    idempotencyKey,
    kind: "message_delivery",
    messageId,
    payload: {
      conversationId: conversation.id,
      messageId,
      providerConversationId,
      purpose: "quality_csat_survey",
      queue: "message-delivery",
      replyMarkup: {
        inline_keyboard: [[1, 2, 3, 4, 5].map((score) => ({
          callback_data: `quality:csat:${score}`,
          text: String(score)
        }))]
      },
      text: "Оцените, пожалуйста, качество поддержки от 1 до 5."
    },
    requestFingerprint: createRequestFingerprint("message_delivery", {
      conversationId: conversation.id,
      purpose: "quality_csat_survey"
    }),
    retryable: true,
    status: "queued",
    tenantId,
    traceId
  });
  const outbox = createOutboxEvent({
    aggregateId: conversation.id,
    aggregateType: "conversation",
    payload: {
      channel: conversation.channel,
      conversationId: conversation.id,
      descriptorId: descriptor.id,
      idempotencyKey,
      messageId,
      retryable: true
    },
    queue: "message-delivery",
    traceId,
    type: "message.delivery.requested"
  });

  return { descriptor, outbox };
}

function telegramChatIdFromConversation(conversation: ConversationRecord): string {
  const taggedChatId = conversation.tags
    .map((tag) => tag.trim())
    .find((tag) => /^(telegram-chat|telegram_chat_id|chat):/i.test(tag));
  return taggedChatId?.slice(taggedChatId.indexOf(":") + 1).trim()
    || conversation.providerConversationId?.trim()
    // phone — legacy-фолбэк: до разделения телефона и адреса доставки chatId хранился в нем.
    || conversation.phone.trim();
}

function outboundDeliveryFromDescriptor(descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  return {
    channel: descriptor.channel,
    deliveryState: descriptor.deliveryState ?? descriptor.status,
    descriptorId: descriptor.id,
    idempotencyKey: descriptor.idempotencyKey,
    outboxEventId: descriptor.outboxEventId,
    queue: descriptor.payload.queue,
    retryable: descriptor.retryable
  };
}

function outboundMessageFromDescriptor(descriptor: ConversationOutboundDescriptor, fallbackText: string, fallbackAttachments: Array<Record<string, unknown>>): Record<string, unknown> {
  const createdAt = stringValue(descriptor.payload.createdAt, "");
  const descriptorAttachments = Array.isArray(descriptor.payload.attachments)
    ? descriptor.payload.attachments.map((attachment) => {
        if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return attachment;
        const { signedFile: _signedFile, ...publicAttachment } = attachment as Record<string, unknown>;
        return publicAttachment;
      })
    : fallbackAttachments;
  const author = stringValue(descriptor.payload.author, "");
  return {
    ...(createdAt ? { createdAt } : {}),
    ...(author ? { author } : {}),
    id: descriptor.messageId ?? stringValue(descriptor.payload.messageId, descriptor.id),
    side: "agent",
    text: stringValue(descriptor.payload.text, fallbackText),
    attachments: descriptorAttachments,
    time: NOW_LABEL
  };
}

function attachmentUploadDataFromDescriptor(descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  return {
    id: descriptor.id,
    fileId: stringValue(descriptor.payload.fileId, descriptor.id),
    channel: descriptor.channel,
    fileName: stringValue(descriptor.payload.fileName, ""),
    mimeType: stringValue(descriptor.payload.mimeType, "application/octet-stream"),
    sizeBytes: numberValue(descriptor.payload.sizeBytes, 0),
    storageState: stringValue(descriptor.payload.storageState, descriptor.status),
    antivirusState: stringValue(descriptor.payload.antivirusState, "scan_pending"),
    deliveryState: descriptor.deliveryState ?? stringValue(descriptor.payload.deliveryState, "not_sent"),
    objectKeyExposed: false,
    auditId: descriptor.auditId,
    descriptorId: descriptor.id,
    outboxEventId: descriptor.outboxEventId,
    queue: descriptor.payload.queue,
    ...(isSignedObjectStorageUrlData(descriptor.payload.signedUpload) ? { signedUpload: descriptor.payload.signedUpload } : {})
  };
}

function attachmentUploadDataFromFile(file: FileRecord, descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  const storageState = stringValue(file.storageState, stringValue(descriptor.payload.storageState, descriptor.status));
  const antivirusState = attachmentAntivirusState(file);
  const ready = attachmentFileIsReady(file);
  const blocked = attachmentScanBlocked(antivirusState);
  const deliveryState = ready ? "ready" : descriptor.deliveryState ?? stringValue(descriptor.payload.deliveryState, "not_sent");
  const queue = stringValue(descriptor.payload.queue, "file-scan");

  return {
    id: descriptor.id,
    fileId: file.fileId,
    channel: descriptor.channel,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    storageState,
    antivirusState,
    deliveryState,
    objectKeyExposed: false,
    auditId: file.auditId,
    descriptorId: descriptor.id,
    outboxEventId: descriptor.outboxEventId,
    queue,
    uploadPolicy: {
      deliveryState,
      queue,
      retryable: !ready && !blocked,
      scanState: antivirusState,
      storageState
    },
    downloadPolicy: {
      permissionRequired: "files.read",
      signedUrlAvailable: ready
    },
    ...(file.scanCheckedAt ? { scanCheckedAt: file.scanCheckedAt } : {}),
    ...(file.scanReason ? { scanReason: file.scanReason } : {}),
    ...(file.scanner ? { scanner: file.scanner } : {})
  };
}

function attachmentFinalizeDeniedEnvelope(
  file: FileRecord,
  descriptor: ConversationOutboundDescriptor,
  code: string,
  message: string
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: DIALOG_SERVICE,
    operation: "finalizeAttachmentUpload",
    traceId: conversationTraceId(DIALOG_SERVICE, "finalizeAttachmentUpload"),
    status: "denied",
    meta: apiMeta({ fileId: file.fileId }),
    data: {
      ...attachmentUploadDataFromFile(file, descriptor),
      auditEvent: {
        id: file.auditId,
        action: "dialog.attachment.finalize_denied",
        fileId: file.fileId,
        immutable: true,
        objectKeyExposed: false
      }
    },
    error: { code, message }
  });
}

function attachmentAntivirusState(file: FileRecord): string {
  const scanState = stringValue(file.scanState, "scan_pending");
  if (scanState === "pending") {
    return "scan_pending";
  }

  if (scanState === "clean") {
    return "scan_clean";
  }

  if (scanState === "infected" || scanState === "blocked") {
    return "scan_blocked";
  }

  if (scanState === "error" || scanState === "failed") {
    return "scan_failed";
  }

  return scanState;
}

function attachmentFileIsReady(file: FileRecord): boolean {
  return file.storageState === "uploaded" && ["clean", "scan_clean"].includes(file.scanState) && file.scanVerdict === "clean";
}

function attachmentScanBlocked(scanState: string): boolean {
  return ["blocked", "infected", "scan_blocked"].includes(scanState);
}

function outboundConversationDataFromDescriptor(descriptor: ConversationOutboundDescriptor): Record<string, unknown> {
  const data: Record<string, unknown> = {
    channel: stringValue(descriptor.payload.channel, descriptor.channel),
    message: stringValue(descriptor.payload.message, ""),
    phone: stringValue(descriptor.payload.phone, ""),
    topic: stringValue(descriptor.payload.topic, ""),
    backendQueueId: descriptor.id,
    conversationId: descriptor.conversationId ?? descriptor.id,
    status: descriptor.status,
    consentCheck: "required_before_send",
    auditId: descriptor.auditId,
    descriptorId: descriptor.id,
    outboxEventId: descriptor.outboxEventId,
    queue: descriptor.payload.queue
  };

  if (typeof descriptor.payload.clientName === "string") {
    data.clientName = descriptor.payload.clientName;
  }

  return data;
}

function createQueuedOutboundConversationRecord(
  descriptor: ConversationOutboundDescriptor,
  fallbackMessage: string,
  fallbackClientName: string,
  authorName?: string
): ConversationRecord {
  const id = descriptor.conversationId ?? descriptor.id;
  const channel = stringValue(descriptor.payload.channel, descriptor.channel);
  const message = stringValue(descriptor.payload.message, fallbackMessage);
  const name = stringValue(descriptor.payload.clientName, fallbackClientName) || "New client";
  const phone = stringValue(descriptor.payload.phone, "");
  const topic = stringValue(descriptor.payload.topic, "");

  return {
    avatar: "",
    channel,
    clientSince: "New contact",
    device: stringValue(descriptor.payload.device, ""),
    entry: channel,
    id,
    initials: initialsForName(name),
    language: "Russian",
    messages: [
      {
        createdAt: descriptor.createdAt,
        id: `${id}-event`,
        text: `Outbound conversation queued in ${stringValue(descriptor.payload.queue, "message-delivery")}; descriptor ${descriptor.id}; audit ${descriptor.auditId ?? "none"}`,
        time: NOW_LABEL,
        type: "event"
      },
      {
        createdAt: descriptor.createdAt,
        id: `${id}-agent`,
        side: "agent",
        text: message,
        ...(authorName ? { author: authorName } : {}),
        time: NOW_LABEL
      }
    ],
    name,
    phone,
    preview: message,
    previous: [],
    sla: "Waiting",
    slaTone: "hold",
    status: descriptor.status,
    tags: ["outbound", "queued", channel.toLowerCase()],
    tenantId: descriptor.tenantId,
    time: NOW_LABEL,
    topic,
    unread: false
  };
}

function initialsForName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "NC";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function createAttachmentObjectKey(): string {
  return `objects/obj_${randomUUID()}`;
}

function isSignedObjectStorageUrlData(value: unknown): value is Record<string, unknown> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).expiresAt === "string"
    && ((value as Record<string, unknown>).method === "GET" || (value as Record<string, unknown>).method === "PUT")
    && typeof (value as Record<string, unknown>).url === "string";
}

function normalizeMimeType(value: unknown): string {
  const mimeType = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mimeType)
    ? mimeType
    : "application/octet-stream";
}

function sanitizeAttachmentFileName(fileName: string): string {
  return fileName
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .at(-1) ?? "upload.bin";
}

function signedObjectStorageUrlData(signedUrl: SignedObjectStorageUrl): Record<string, unknown> {
  return {
    expiresAt: signedUrl.expiresAt,
    ...(signedUrl.headers ? { headers: signedUrl.headers } : {}),
    method: signedUrl.method,
    url: signedUrl.url
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function conflictEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: conversationTraceId(service, operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function invalidEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: conversationTraceId(service, operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: conversationTraceId(service, operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function tenantContextRequiredEnvelope(service: string, operation: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return invalidEnvelope(service, operation, "tenant_context_required", "Tenant context is required for tenant-owned writes.", data);
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeMessageId(scope: string): string {
  return `msg_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function statusSla(status: string): string {
  if (status === "closed") {
    return "Closed";
  }

  if (status === "paused") {
    return "SLA paused";
  }

  if (status === "queued" || status === "waiting_client" || status === "waiting_operator") {
    return "Waiting";
  }

  return "Active";
}

function statusTone(status: string): string {
  if (status === "closed") {
    return "closed";
  }

  if (status === "transferred" || status === "reopened") {
    return "warn";
  }

  if (status === "queued" || status === "waiting_client" || status === "waiting_operator" || status === "paused") {
    return "hold";
  }

  return "ok";
}

function toPositiveInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedRealtimeLimit(value: number | string | undefined): number {
  return Math.min(500, toPositiveInt(value, 200));
}

function matchesTenantScope(conversation: ConversationRecord, tenantId?: string): boolean {
  if (!tenantId) {
    return true;
  }
  return resolveConversationTenantId(conversation) === tenantId;
}

function resolveConversationTenantId(conversation: ConversationRecord): string {
  return requiredTenantId(conversation.tenantId) ?? "";
}

function employeeTeamId(metadata: Record<string, unknown> | undefined): string | undefined {
  const settings = metadata?.employeeSettings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return undefined;
  }
  const teamId = String((settings as Record<string, unknown>).groupId ?? "").trim();
  return teamId || undefined;
}
