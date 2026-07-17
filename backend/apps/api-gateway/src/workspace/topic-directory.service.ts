import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { TopicDirectoryRepository, type TopicRecord } from "./topic-directory.repository.js";

const SERVICE = "settingsService";
const supportedChannels = ["SDK", "Telegram", "MAX", "VK"];

interface TopicMutationPayload {
  accessScope?: string;
  archived?: boolean;
  branchName?: string;
  channels?: string[];
  groupName?: string;
  name?: string;
  required?: boolean;
  routingTarget?: string;
  sortOrder?: number;
}

export class TopicDirectoryService {
  constructor(private readonly repository = TopicDirectoryRepository.default()) {}

  async fetchTopics(filters: { query?: string; status?: string }, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId(scope.tenantId);
    const query = String(filters.query ?? "").trim().toLowerCase();
    const status = String(filters.status ?? "all").trim().toLowerCase();
    const allTenantTopics = await this.repository.listTopics(tenantId);
    const topics = allTenantTopics
      .filter((topic) => status === "all" || !status || (status === "active" ? !topic.archived : status === "archived" ? topic.archived : true))
      .filter((topic) => !query || [
        topic.groupName,
        topic.branchName,
        topic.name,
        topic.routingTarget,
        topic.accessScope,
        ...topic.channels
      ].join(" ").toLowerCase().includes(query))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

    return createEnvelope({
      service: SERVICE,
      operation: "fetchTopics",
      traceId: traceId("fetchTopics"),
      meta: apiMeta({ filters: { ...filters, tenantId } }),
      data: {
        activeOptions: buildActiveOptions(allTenantTopics),
        directory: buildDirectory(topics),
        topics: topics.map(toPublicTopic),
        totals: {
          active: allTenantTopics.filter((topic) => !topic.archived).length,
          archived: allTenantTopics.filter((topic) => topic.archived).length,
          total: allTenantTopics.length
        }
      }
    });
  }

  async createTopic(payload: TopicMutationPayload, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId(scope.tenantId);
    const groupName = String(payload.groupName ?? "").trim();
    const branchName = String(payload.branchName ?? "").trim();
    const name = String(payload.name ?? "").trim();
    if (!groupName || !branchName || !name) {
      return invalidEnvelope("createTopic", "topic_path_required", "groupName, branchName and name are required.", { tenantId });
    }

    const tenantTopics = await this.repository.listTopics(tenantId);
    const topic: TopicRecord = {
      accessScope: String(payload.accessScope ?? "admins").trim(),
      archived: false,
      branchName,
      channels: normalizeChannels(payload.channels),
      groupName,
      id: `topic_${slugify(groupName)}_${slugify(branchName)}_${randomUUID().slice(0, 8)}`,
      name,
      required: Boolean(payload.required ?? true),
      routingTarget: String(payload.routingTarget ?? "Line 1").trim(),
      sortOrder: normalizeSortOrder(payload.sortOrder, tenantTopics.length + 1),
      tenantId,
      updatedAt: new Date().toISOString()
    };
    const saved = await this.repository.saveTopic(topic);

    return createEnvelope({
      service: SERVICE,
      operation: "createTopic",
      traceId: traceId("createTopic"),
      meta: apiMeta({ tenantId, topicId: topic.id }),
      data: {
        auditEvent: auditEvent("topic.create", tenantId, topic.id, "Topic created"),
        topic: toPublicTopic(saved)
      }
    });
  }

  async updateTopic(topicId: string, payload: TopicMutationPayload, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId(scope.tenantId);
    const topic = await this.repository.findTopic(topicId, tenantId);
    if (!topic) {
      return notFoundEnvelope("updateTopic", topicId);
    }

    const updated: TopicRecord = {
      ...topic,
      accessScope: payload.accessScope === undefined ? topic.accessScope : String(payload.accessScope).trim() || topic.accessScope,
      branchName: payload.branchName === undefined ? topic.branchName : String(payload.branchName).trim() || topic.branchName,
      channels: payload.channels === undefined ? topic.channels : normalizeChannels(payload.channels),
      groupName: payload.groupName === undefined ? topic.groupName : String(payload.groupName).trim() || topic.groupName,
      name: payload.name === undefined ? topic.name : String(payload.name).trim() || topic.name,
      required: payload.required === undefined ? topic.required : Boolean(payload.required),
      routingTarget: payload.routingTarget === undefined ? topic.routingTarget : String(payload.routingTarget).trim() || topic.routingTarget,
      sortOrder: payload.sortOrder === undefined ? topic.sortOrder : normalizeSortOrder(payload.sortOrder, topic.sortOrder),
      updatedAt: new Date().toISOString()
    };
    const saved = await this.repository.saveTopic(updated);

    return createEnvelope({
      service: SERVICE,
      operation: "updateTopic",
      traceId: traceId("updateTopic"),
      meta: apiMeta({ tenantId: updated.tenantId, topicId }),
      data: {
        auditEvent: auditEvent("topic.update", updated.tenantId, topicId, "Topic updated"),
        topic: toPublicTopic(saved)
      }
    });
  }

  async archiveTopic(topicId: string, payload: { reason?: string }, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.setArchiveState("archiveTopic", topicId, true, payload.reason ?? "Topic archived", scope);
  }

  async restoreTopic(topicId: string, payload: { reason?: string }, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.setArchiveState("restoreTopic", topicId, false, payload.reason ?? "Topic restored", scope);
  }

  async fetchTopicUsage(topicId: string, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId(scope.tenantId);
    const topic = await this.repository.findTopic(topicId, tenantId);
    if (!topic) {
      return notFoundEnvelope("fetchTopicUsage", topicId);
    }

    const usage = buildUsage(topic);
    return createEnvelope({
      service: SERVICE,
      operation: "fetchTopicUsage",
      traceId: traceId("fetchTopicUsage"),
      meta: apiMeta({ tenantId: topic.tenantId, topicId }),
      data: {
        canHardDelete: false,
        topic: toPublicTopic(topic),
        usage,
        warning: "Topics are archived instead of hard-deleted because dialogs, reports, templates and routing history can reference them."
      }
    });
  }

  private async setArchiveState(operation: string, topicId: string, archived: boolean, reason: string, scope: { tenantId: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId(scope.tenantId);
    const topic = await this.repository.findTopic(topicId, tenantId);
    if (!topic) {
      return notFoundEnvelope(operation, topicId);
    }

    const updated = { ...topic, archived, updatedAt: new Date().toISOString() };
    const saved = await this.repository.saveTopic(updated);
    return createEnvelope({
      service: SERVICE,
      operation,
      traceId: traceId(operation),
      meta: apiMeta({ tenantId: topic.tenantId, topicId }),
      data: {
        auditEvent: auditEvent(archived ? "topic.archive" : "topic.restore", topic.tenantId, topicId, reason),
        topic: toPublicTopic(saved),
        usage: buildUsage(saved)
      }
    });
  }
}

function buildDirectory(topics: TopicRecord[]) {
  const groups = new Map<string, TopicRecord[]>();
  for (const topic of topics) {
    groups.set(topic.groupName, [...(groups.get(topic.groupName) ?? []), topic]);
  }

  return Array.from(groups.entries()).map(([groupName, groupTopics]) => {
    const branches = new Map<string, TopicRecord[]>();
    for (const topic of groupTopics) {
      branches.set(topic.branchName, [...(branches.get(topic.branchName) ?? []), topic]);
    }

    return {
      id: slugify(groupName),
      name: groupName,
      owner: ownerForGroup(groupName),
      description: descriptionForGroup(groupName),
      branches: Array.from(branches.entries()).map(([branchName, branchTopics]) => ({
        id: `${slugify(groupName)}-${slugify(branchName)}`,
        name: branchName,
        children: branchTopics.map(toPublicTopic)
      }))
    };
  });
}

function toPublicTopic(topic: TopicRecord) {
  return {
    ...topic,
    channels: [...topic.channels],
    access: topic.accessScope,
    routing: topic.routingTarget
  };
}

function buildActiveOptions(topics: TopicRecord[]): string[] {
  return topics
    .filter((topic) => !topic.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((topic) => `${topic.groupName} / ${topic.name}`);
}

function buildUsage(topic: TopicRecord) {
  const seed = topic.id.length + topic.name.length;
  return {
    dialogs: seed % 17,
    reports: seed % 5,
    routingRules: topic.required ? 2 : 1,
    templates: topic.channels.length
  };
}

function auditEvent(action: string, tenantId: string, topicId: string, reason: string) {
  return {
    action,
    at: new Date().toISOString(),
    id: `evt_topic_directory_${randomUUID()}`,
    immutable: true,
    reason,
    result: "ok",
    tenantId,
    topicId
  };
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>) {
  return createEnvelope({
    service: SERVICE,
    operation,
    traceId: traceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(operation: string, topicId: string) {
  return createEnvelope({
    service: SERVICE,
    operation,
    traceId: traceId(operation),
    status: "not_found",
    meta: apiMeta({ topicId }),
    data: { topicId },
    error: { code: "topic_not_found", message: `Topic ${topicId} was not found.` }
  });
}

function requireTenantId(value: unknown): string {
  const tenantId = String(value ?? "").trim();
  if (!tenantId) {
    throw new Error("topic_tenant_id_required");
  }
  return tenantId;
}

function normalizeChannels(values: unknown): string[] {
  const list = Array.isArray(values) ? values : supportedChannels;
  const normalized = list.map((value) => String(value ?? "").trim()).filter((value) => supportedChannels.includes(value));
  return normalized.length ? Array.from(new Set(normalized)) : ["SDK"];
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "topic";
}

function ownerForGroup(groupName: string): string {
  if (groupName === "Оплата") return "Финансы";
  if (groupName === "Авторизация") return "Антифрод";
  if (groupName === "Товар") return "Каталог";
  return "Операции";
}

function descriptionForGroup(groupName: string): string {
  if (groupName === "Оплата") return "Возвраты, списания, промокоды и сверка платежей.";
  if (groupName === "Авторизация") return "Коды входа, восстановление доступа и проверка личности.";
  if (groupName === "Товар") return "Несоответствие описанию, комплектация и качество товара.";
  return "Статус заказа, адрес доставки и взаимодействие с курьером.";
}

function traceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(SERVICE, operation);
}

function apiMeta(extra: Record<string, unknown> = {}) {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}
