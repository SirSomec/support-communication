import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { SettingsRulesRepository } from "./settings-rules.repository.js";

const SERVICE = "settingsService";
const SEED_TENANT_ID = "tenant-northstar";

export interface SettingsRule {
  affectedWorkflows: string[];
  description: string;
  enabled: boolean;
  id: string;
  lastChangedAt: string;
  lastViolation: string;
  owner: string;
  parameters: Record<string, string | number | boolean>;
  scope: string;
  severity: "critical" | "high" | "medium";
  tenantId: string;
  title: string;
}

export interface SettingsRuleAuditEvent {
  action: string;
  createdAt: string;
  id: string;
  immutable: true;
  reason: string;
  ruleId: string;
  tenantId: string;
}

interface RuleMutationPayload {
  confirmed?: boolean;
  enabled?: boolean;
  parameters?: Record<string, unknown>;
  reason?: string;
  tenantId?: string;
}

interface SettingsTenantOptions {
  tenantId?: string;
}

export class SettingsRulesService {
  private readonly auditEvents: SettingsRuleAuditEvent[] = [];

  constructor(private readonly repository = SettingsRulesRepository.default()) {}

  listSettingsAuditEvents() {
    return this.auditEvents.map((event) => ({ ...event }));
  }

  listSettingsAuditEventsAsync(tenantId?: string) {
    return this.repository.listAuditEvents(normalizeTenantId(tenantId) || undefined);
  }

  async fetchRules(filters: { tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(filters.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("fetchRules");
    }

    const rules = await this.listTenantRules(tenantId);

    return createEnvelope({
      service: SERVICE,
      operation: "fetchRules",
      traceId: identityTraceId(SERVICE, "fetchRules"),
      meta: apiMeta({ filters: { ...filters, tenantId } }),
      data: buildRulesWorkspace(rules)
    });
  }

  async updateRule(ruleId: string, payload: RuleMutationPayload = {}, options: SettingsTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(payload.tenantId ?? options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("updateRule", { ruleId });
    }

    const rule = await this.getRule(tenantId, ruleId);
    if (!rule) {
      return invalidEnvelope("updateRule", "rule_not_found", "Settings rule was not found.", { ruleId, tenantId });
    }

    if (rule.severity === "critical" && rule.enabled && payload.enabled === false && payload.confirmed !== true) {
      return invalidEnvelope("updateRule", "critical_rule_confirmation_required", "Critical rules require explicit confirmation before disabling.", { ruleId, tenantId });
    }

    const nextRule: SettingsRule = {
      ...rule,
      enabled: typeof payload.enabled === "boolean" ? payload.enabled : rule.enabled,
      lastChangedAt: new Date().toISOString(),
      parameters: {
        ...rule.parameters,
        ...normalizeParameters(payload.parameters)
      }
    };
    await this.repository.saveRule(nextRule);
    const auditEvent = await this.persistAuditEvent(buildAuditEvent("settings.rule.update", tenantId, ruleId, payload.reason));

    return createEnvelope({
      service: SERVICE,
      operation: "updateRule",
      traceId: identityTraceId(SERVICE, "updateRule"),
      meta: apiMeta({ ruleId, tenantId }),
      data: {
        auditEvent,
        rule: toPublicRule(nextRule),
        workspace: buildRulesWorkspace(await this.listTenantRules(tenantId))
      }
    });
  }

  async testRule(ruleId: string, payload: { sampleSize?: number } = {}, options: SettingsTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("testRule", { ruleId });
    }

    const rule = await this.getRule(tenantId, ruleId);
    if (!rule) {
      return invalidEnvelope("testRule", "rule_not_found", "Settings rule was not found.", { ruleId, tenantId });
    }

    const sampleSize = clampNumber(payload.sampleSize, 25, 1, 500);
    const affectedCount = Math.max(0, Math.round(sampleSize * affectedRatio(rule)));

    const auditEvent = await this.persistAuditEvent(buildAuditEvent("settings.rule.test", tenantId, ruleId));

    return createEnvelope({
      service: SERVICE,
      operation: "testRule",
      traceId: identityTraceId(SERVICE, "testRule"),
      meta: apiMeta({ ruleId, sampleSize, tenantId }),
      data: {
        auditEvent,
        result: {
          affectedCount,
          affectedWorkflows: rule.affectedWorkflows,
          sampleSize,
          status: rule.enabled ? "pass" : "disabled",
          summary: rule.enabled
            ? `${affectedCount} сценариев будет проверено правилом.`
            : "Правило выключено и не будет применено к рабочим сценариям."
        },
        rule: toPublicRule(rule)
      }
    });
  }

  private async listTenantRules(tenantId: string) {
    const rules = await this.ensureDefaultRulesForTenant(tenantId);
    return rules
      .sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || left.title.localeCompare(right.title));
  }

  private async getRule(tenantId: string, ruleId: string): Promise<SettingsRule | undefined> {
    return (await this.ensureDefaultRulesForTenant(tenantId)).find((rule) => rule.id === ruleId);
  }

  private async ensureDefaultRulesForTenant(tenantId: string): Promise<SettingsRule[]> {
    const persisted = await this.repository.listRules(tenantId);
    const byId = new Map(persisted.map((rule) => [rule.id, rule]));
    for (const rule of seedRules) {
      if (!byId.has(rule.id)) {
        const saved = await this.repository.saveRule(cloneRule({ ...rule, tenantId }));
        byId.set(saved.id, saved);
      }
    }
    return [...byId.values()].map(cloneRule);
  }

  private async persistAuditEvent(event: SettingsRuleAuditEvent): Promise<SettingsRuleAuditEvent> {
    this.auditEvents.push({ ...event });
    return this.repository.saveAuditEvent(event);
  }
}

function buildRulesWorkspace(rules: SettingsRule[]) {
  return {
    groups: [
      { key: "dialogs", label: "Диалоги", ruleIds: rules.filter((rule) => rule.affectedWorkflows.includes("dialogs")).map((rule) => rule.id) },
      { key: "routing", label: "Маршрутизация", ruleIds: rules.filter((rule) => rule.affectedWorkflows.includes("routing")).map((rule) => rule.id) },
      { key: "audit", label: "Аудит", ruleIds: rules.filter((rule) => rule.affectedWorkflows.includes("audit")).map((rule) => rule.id) }
    ],
    rules: rules.map(toPublicRule),
    totals: {
      active: rules.filter((rule) => rule.enabled).length,
      critical: rules.filter((rule) => rule.severity === "critical").length,
      disabled: rules.filter((rule) => !rule.enabled).length,
      total: rules.length
    }
  };
}

function toPublicRule(rule: SettingsRule) {
  return {
    ...rule,
    parameters: { ...rule.parameters }
  };
}

function buildAuditEvent(action: string, tenantId: string, ruleId: string, reason = "Settings rule mutation"): SettingsRuleAuditEvent {
  return {
    action,
    createdAt: new Date().toISOString(),
    id: makeAuditId("settings_rule"),
    immutable: true,
    reason,
    ruleId,
    tenantId
  };
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SERVICE,
    operation,
    status: "invalid",
    traceId: identityTraceId(SERVICE, operation),
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function normalizeTenantId(tenantId?: string) {
  return String(tenantId ?? "").trim();
}

function tenantContextRequiredEnvelope(operation: string, data: Record<string, unknown> = {}) {
  return invalidEnvelope(operation, "tenant_context_required", "Tenant context is required for settings operations.", {
    ...data,
    tenantId: null
  });
}

function normalizeParameters(parameters?: Record<string, unknown>) {
  if (!parameters || typeof parameters !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([, value]) => ["boolean", "number", "string"].includes(typeof value))
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  ) as Record<string, string | number | boolean>;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function affectedRatio(rule: SettingsRule) {
  if (rule.id === "close-topic-required") {
    return 0.18;
  }

  if (rule.id === "operator-chat-limit") {
    return 0.11;
  }

  return rule.severity === "critical" ? 0.05 : 0.03;
}

function severityRank(severity: SettingsRule["severity"]) {
  return severity === "critical" ? 0 : severity === "high" ? 1 : 2;
}

function cloneRule(rule: SettingsRule): SettingsRule {
  return {
    ...rule,
    affectedWorkflows: [...rule.affectedWorkflows],
    parameters: { ...rule.parameters }
  };
}

const seedRules: SettingsRule[] = [
  {
    affectedWorkflows: ["dialogs", "routing"],
    description: "Сервер и интерфейс требуют активную тематику перед переводом обращения в закрытое состояние.",
    enabled: true,
    id: "close-topic-required",
    lastChangedAt: "2026-06-30T09:00:00.000Z",
    lastViolation: "Владимир Б., Telegram",
    owner: "Диалоги",
    parameters: { blockClose: true },
    scope: "Все каналы",
    severity: "critical",
    tenantId: SEED_TENANT_ID,
    title: "Нельзя закрыть диалог без тематики"
  },
  {
    affectedWorkflows: ["dialogs", "audit"],
    description: "Composer разделяет публичный ответ и внутреннюю заметку; outbound payload не содержит private note.",
    enabled: true,
    id: "internal-note-is-private",
    lastChangedAt: "2026-06-28T14:30:00.000Z",
    lastViolation: "Нет нарушений",
    owner: "Composer",
    parameters: { redactPrivateNote: true },
    scope: "SDK, Telegram, MAX, VK",
    severity: "critical",
    tenantId: SEED_TENANT_ID,
    title: "Внутренний комментарий не отправляется клиенту"
  },
  {
    affectedWorkflows: ["routing"],
    description: "Маршрутизация проверяет текущую нагрузку, личный лимит и разрешение supervisor override.",
    enabled: true,
    id: "operator-chat-limit",
    lastChangedAt: "2026-06-29T18:10:00.000Z",
    lastViolation: "VK rescue queue",
    owner: "Routing",
    parameters: { defaultLimit: 8, supervisorOverride: true },
    scope: "Очереди и сотрудники",
    severity: "high",
    tenantId: SEED_TENANT_ID,
    title: "Оператор не получает чаты сверх лимита"
  },
  {
    affectedWorkflows: ["routing", "employees"],
    description: "Supervisor override разрешен только ролям senior и admin; обычный сотрудник не может забирать чат поверх лимита.",
    enabled: true,
    id: "limit-override-allowed-roles",
    lastChangedAt: "2026-06-29T18:20:00.000Z",
    lastViolation: "Нет нарушений",
    owner: "Routing",
    parameters: { allowedRoles: "senior,admin" },
    scope: "Очереди и сотрудники",
    severity: "high",
    tenantId: SEED_TENANT_ID,
    title: "Override лимита доступен только разрешенным ролям"
  },
  {
    affectedWorkflows: ["dialogs", "audit"],
    description: "Паспортные данные, телефоны и платежные реквизиты маскируются для ролей без sensitive-data доступа.",
    enabled: true,
    id: "sensitive-data-masked-by-role",
    lastChangedAt: "2026-06-28T16:40:00.000Z",
    lastViolation: "Нет нарушений",
    owner: "Security",
    parameters: { maskPhones: true, maskPaymentData: true },
    scope: "Диалоги, клиенты, отчеты",
    severity: "critical",
    tenantId: SEED_TENANT_ID,
    title: "Чувствительные данные маскируются по роли"
  },
  {
    affectedWorkflows: ["audit", "reports"],
    description: "CSV, XLSX и PDF экспорты пишут неизменяемое событие с пользователем, фильтрами и trace id.",
    enabled: true,
    id: "report-export-audit",
    lastChangedAt: "2026-06-27T11:20:00.000Z",
    lastViolation: "Нет нарушений",
    owner: "Audit",
    parameters: { retainDays: 365 },
    scope: "Отчеты",
    severity: "medium",
    tenantId: SEED_TENANT_ID,
    title: "Экспорт отчетов фиксируется в аудите"
  },
  {
    affectedWorkflows: ["routing"],
    description: "Новые обращения направляются по каналу, тематике, рабочему времени и группе поддержки.",
    enabled: true,
    id: "route-by-channel-topic-working-time",
    lastChangedAt: "2026-06-30T10:15:00.000Z",
    lastViolation: "MAX night queue",
    owner: "Routing",
    parameters: { afterHoursQueue: "queue-night", respectTopicTarget: true },
    scope: "Все входящие очереди",
    severity: "high",
    tenantId: SEED_TENANT_ID,
    title: "Маршрутизация учитывает канал, тематику, время и группу"
  },
  {
    affectedWorkflows: ["routing", "dialogs"],
    description: "Если основная группа перегружена, обращение переводится в fallback очередь и получает escalation timer.",
    enabled: true,
    id: "overload-fallback-escalation",
    lastChangedAt: "2026-06-30T10:25:00.000Z",
    lastViolation: "Telegram VIP fallback",
    owner: "Routing",
    parameters: { fallbackQueue: "queue-overflow", escalationMinutes: 15 },
    scope: "Очереди и SLA",
    severity: "high",
    tenantId: SEED_TENANT_ID,
    title: "Перегрузка включает fallback и эскалацию"
  }
];
