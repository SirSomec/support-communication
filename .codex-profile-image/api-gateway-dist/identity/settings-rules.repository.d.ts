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
        findMany(input: {
            orderBy: Array<{
                severity: "asc";
            } | {
                title: "asc";
            }>;
            where: {
                tenantId: string;
            };
        }): Promise<PrismaSettingsRuleRow[]>;
        upsert(input: {
            create: Record<string, unknown>;
            update: Record<string, unknown>;
            where: {
                tenantId_id: {
                    id: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaSettingsRuleRow>;
    };
    settingsRuleAuditEvent: {
        create(input: {
            data: Record<string, unknown>;
        }): Promise<PrismaSettingsRuleAuditRow>;
        findMany(input: {
            orderBy: {
                createdAt: "asc";
            };
            where: {
                tenantId?: string;
            };
        }): Promise<PrismaSettingsRuleAuditRow[]>;
    };
}
export declare class SettingsRulesRepository implements SettingsRulesRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): SettingsRulesRepository;
    static inMemory(): SettingsRulesRepository;
    static prisma(client: PrismaSettingsRulesClient): SettingsRulesRepository;
    static useDefault(repository: SettingsRulesRepository): void;
    listAuditEvents(tenantId?: string): Promise<SettingsRuleAuditEvent[]>;
    listRules(tenantId: string): Promise<SettingsRule[]>;
    saveAuditEvent(event: SettingsRuleAuditEvent): Promise<SettingsRuleAuditEvent>;
    saveRule(rule: SettingsRule): Promise<SettingsRule>;
}
export {};
