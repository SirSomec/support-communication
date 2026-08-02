let configuredDefault = null;
export class SettingsRulesRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        return configuredDefault ?? SettingsRulesRepository.inMemory();
    }
    static inMemory() {
        const rules = new Map();
        const auditEvents = new Map();
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
                if (!existing)
                    auditEvents.set(event.id, clone(event));
                return clone(existing ?? event);
            },
            async saveRule(rule) {
                rules.set(ruleKey(rule.tenantId, rule.id), clone(rule));
                return clone(rule);
            }
        });
    }
    static prisma(client) {
        return new SettingsRulesRepository(new PrismaSettingsRulesRepository(client));
    }
    static useDefault(repository) {
        configuredDefault = repository;
    }
    listAuditEvents(tenantId) {
        return this.adapter.listAuditEvents(tenantId);
    }
    listRules(tenantId) {
        return this.adapter.listRules(tenantId);
    }
    saveAuditEvent(event) {
        return this.adapter.saveAuditEvent(event);
    }
    saveRule(rule) {
        return this.adapter.saveRule(rule);
    }
}
class PrismaSettingsRulesRepository {
    client;
    constructor(client) {
        this.client = client;
    }
    async listAuditEvents(tenantId) {
        const rows = await this.client.settingsRuleAuditEvent.findMany({
            orderBy: { createdAt: "asc" },
            where: tenantId ? { tenantId } : {}
        });
        return rows.map(toAuditEvent);
    }
    async listRules(tenantId) {
        const rows = await this.client.settingsRule.findMany({
            orderBy: [{ severity: "asc" }, { title: "asc" }],
            where: { tenantId }
        });
        return rows.map(toRule);
    }
    async saveAuditEvent(event) {
        try {
            return toAuditEvent(await this.client.settingsRuleAuditEvent.create({
                data: { ...event, createdAt: new Date(event.createdAt) }
            }));
        }
        catch (error) {
            if (isUniqueConstraintError(error)) {
                const existing = (await this.listAuditEvents(event.tenantId)).find((item) => item.id === event.id);
                if (existing)
                    return existing;
            }
            throw error;
        }
    }
    async saveRule(rule) {
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
function toRule(row) {
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
function toAuditEvent(row) {
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
function scalarRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value)
        .filter((entry) => ["boolean", "number", "string"].includes(typeof entry[1])));
}
function stringArray(value) {
    return Array.isArray(value) ? value.map(String) : [];
}
function ruleKey(tenantId, id) {
    return `${tenantId}:${id}`;
}
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function isUniqueConstraintError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
function clone(value) {
    return structuredClone(value);
}
//# sourceMappingURL=settings-rules.repository.js.map