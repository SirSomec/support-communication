import type { SettingsRule, SettingsRuleAuditEvent } from "./settings-rules.service.js";

export interface SettingsRulesRepositoryPort {
  listAuditEvents(tenantId?: string): Promise<SettingsRuleAuditEvent[]>;
  listRules(tenantId: string): Promise<SettingsRule[]>;
  saveAuditEvent(event: SettingsRuleAuditEvent): Promise<SettingsRuleAuditEvent>;
  saveRule(rule: SettingsRule): Promise<SettingsRule>;
}

interface PrismaSettingsRuleRow {
  affectedWorkflows: unknown;
  description: string;
  enabled: boolean;
  id: string;
  lastChangedAt: Date | string;
  lastViolation: string;
  owner: string;
  parameters: unknown;
  scope: string;
  severity: string;
  tenantId: string;
  title: string;
}

interface PrismaSettingsRuleAuditRow {
  action: string;
  createdAt: Date | string;
  id: string;
  immutable: boolean;
  reason: string;
  ruleId: string;
  tenantId: string;
}

export interface PrismaSettingsRulesClient {
  settingsRule: {
    findMany(input: { orderBy: Array<{ severity: "asc" } | { title: "asc" }>; where: { tenantId: string } }): Promise<PrismaSettingsRuleRow[]>;
    upsert(input: { create: Record<string, unknown>; update: Record<string, unknown>; where: { tenantId_id: { id: string; tenantId: string } } }): Promise<PrismaSettingsRuleRow>;
  };
  settingsRuleAuditEvent: {
    create(input: { data: Record<string, unknown> }): Promise<PrismaSettingsRuleAuditRow>;
    findMany(input: { orderBy: { createdAt: "asc" }; where: { tenantId?: string } }): Promise<PrismaSettingsRuleAuditRow[]>;
  };
}

let configuredDefault: SettingsRulesRepository | null = null;

export class SettingsRulesRepository implements SettingsRulesRepositoryPort {
  private constructor(private readonly adapter: SettingsRulesRepositoryPort) {}

  static default(): SettingsRulesRepository {
    return configuredDefault ?? SettingsRulesRepository.inMemory();
  }

  static inMemory(): SettingsRulesRepository {
    const rules = new Map<string, SettingsRule>();
    const auditEvents = new Map<string, SettingsRuleAuditEvent>();
    return new SettingsRulesRepository({
      async listAuditEvents(tenantId) {
        return clone([...auditEvents.values()]
          .filter((event) => !tenantId || event.tenantId === tenantId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)));
      },
      async listRules(tenantId) {
        return clone([...rules.values()].filter((rule) => rule.tenantId === tenantId));
      },
      async saveAuditEvent(event) {
        const existing = auditEvents.get(event.id);
        if (!existing) auditEvents.set(event.id, clone(event));
        return clone(existing ?? event);
      },
      async saveRule(rule) {
        rules.set(ruleKey(rule.tenantId, rule.id), clone(rule));
        return clone(rule);
      }
    });
  }

  static prisma(client: PrismaSettingsRulesClient): SettingsRulesRepository {
    return new SettingsRulesRepository(new PrismaSettingsRulesRepository(client));
  }

  static useDefault(repository: SettingsRulesRepository): void {
    configuredDefault = repository;
  }

  listAuditEvents(tenantId?: string): Promise<SettingsRuleAuditEvent[]> {
    return this.adapter.listAuditEvents(tenantId);
  }

  listRules(tenantId: string): Promise<SettingsRule[]> {
    return this.adapter.listRules(tenantId);
  }

  saveAuditEvent(event: SettingsRuleAuditEvent): Promise<SettingsRuleAuditEvent> {
    return this.adapter.saveAuditEvent(event);
  }

  saveRule(rule: SettingsRule): Promise<SettingsRule> {
    return this.adapter.saveRule(rule);
  }
}

class PrismaSettingsRulesRepository implements SettingsRulesRepositoryPort {
  constructor(private readonly client: PrismaSettingsRulesClient) {}

  async listAuditEvents(tenantId?: string): Promise<SettingsRuleAuditEvent[]> {
    const rows = await this.client.settingsRuleAuditEvent.findMany({
      orderBy: { createdAt: "asc" },
      where: tenantId ? { tenantId } : {}
    });
    return rows.map(toAuditEvent);
  }

  async listRules(tenantId: string): Promise<SettingsRule[]> {
    const rows = await this.client.settingsRule.findMany({
      orderBy: [{ severity: "asc" }, { title: "asc" }],
      where: { tenantId }
    });
    return rows.map(toRule);
  }

  async saveAuditEvent(event: SettingsRuleAuditEvent): Promise<SettingsRuleAuditEvent> {
    try {
      return toAuditEvent(await this.client.settingsRuleAuditEvent.create({
        data: { ...event, createdAt: new Date(event.createdAt) }
      }));
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = (await this.listAuditEvents(event.tenantId)).find((item) => item.id === event.id);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async saveRule(rule: SettingsRule): Promise<SettingsRule> {
    const data = {
      ...rule,
      affectedWorkflows: [...rule.affectedWorkflows],
      lastChangedAt: new Date(rule.lastChangedAt),
      parameters: { ...rule.parameters }
    };
    return toRule(await this.client.settingsRule.upsert({
      create: data,
      update: data,
      where: { tenantId_id: { id: rule.id, tenantId: rule.tenantId } }
    }));
  }
}

function toRule(row: PrismaSettingsRuleRow): SettingsRule {
  return {
    affectedWorkflows: stringArray(row.affectedWorkflows),
    description: row.description,
    enabled: row.enabled,
    id: row.id,
    lastChangedAt: toIso(row.lastChangedAt),
    lastViolation: row.lastViolation,
    owner: row.owner,
    parameters: scalarRecord(row.parameters),
    scope: row.scope,
    severity: row.severity === "critical" || row.severity === "high" ? row.severity : "medium",
    tenantId: row.tenantId,
    title: row.title
  };
}

function toAuditEvent(row: PrismaSettingsRuleAuditRow): SettingsRuleAuditEvent {
  return {
    action: row.action,
    createdAt: toIso(row.createdAt),
    id: row.id,
    immutable: true,
    reason: row.reason,
    ruleId: row.ruleId,
    tenantId: row.tenantId
  };
}

function scalarRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string | number | boolean] => ["boolean", "number", "string"].includes(typeof entry[1])));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function ruleKey(tenantId: string, id: string): string {
  return `${tenantId}:${id}`;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
