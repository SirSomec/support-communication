import { type BackendEnvelope } from "@support-communication/envelope";
import { SettingsRulesRepository } from "./settings-rules.repository.js";
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
export declare class SettingsRulesService {
    private readonly repository;
    private readonly auditEvents;
    constructor(repository?: SettingsRulesRepository);
    listSettingsAuditEvents(): {
        action: string;
        createdAt: string;
        id: string;
        immutable: true;
        reason: string;
        ruleId: string;
        tenantId: string;
    }[];
    listSettingsAuditEventsAsync(tenantId?: string): Promise<SettingsRuleAuditEvent[]>;
    fetchRules(filters?: {
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateRule(ruleId: string, payload?: RuleMutationPayload, options?: SettingsTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    testRule(ruleId: string, payload?: {
        sampleSize?: number;
    }, options?: SettingsTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    private listTenantRules;
    private getRule;
    private ensureDefaultRulesForTenant;
    private persistAuditEvent;
}
export {};
