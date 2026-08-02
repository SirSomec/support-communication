import { SettingsEmployeeService } from "./settings-employee.service.js";
import { SettingsRulesService } from "./settings-rules.service.js";
import { type ServiceAdminRequest } from "./service-admin-auth.js";
import { type TenantOperatorRequest } from "./tenant-operator-auth.js";
type SettingsRequest = TenantOperatorRequest & ServiceAdminRequest;
export declare class SettingsController {
    private readonly settingsEmployeeService;
    private readonly settingsRulesService;
    constructor(settingsEmployeeService: SettingsEmployeeService, settingsRulesService: SettingsRulesService);
    fetchEmployees(query: {
        groupId?: string;
        query?: string;
        roleKey?: string;
        status?: string;
        tenantId?: string;
    }, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    inviteEmployee(payload: {
        email?: string;
        groupId?: string;
        name?: string;
        roleKey?: string;
        tenantId?: string;
    }, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateEmployee(employeeId: string, payload: Record<string, unknown>, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resetEmployeePassword(employeeId: string, request: SettingsRequest, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resetEmployeeMfa(employeeId: string, request: SettingsRequest, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deactivateEmployee(employeeId: string, request: SettingsRequest, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deleteEmployee(employeeId: string, request: SettingsRequest, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resendEmployeeInvite(employeeId: string, request: SettingsRequest, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchRoles(): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchGroups(query: {
        tenantId?: string;
    }, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createGroup(payload: {
        channels?: string[];
        memberIds?: string[];
        name?: string;
        scope?: string;
    }, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateGroup(groupId: string, payload: {
        channels?: string[];
        memberIds?: string[];
        name?: string;
        scope?: string;
    }, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deleteGroup(groupId: string, request: SettingsRequest, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchRules(query: {
        tenantId?: string;
    }, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateRule(ruleId: string, payload: Record<string, unknown>, request: SettingsRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    testRule(ruleId: string, request: SettingsRequest, payload?: {
        sampleSize?: number;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export {};
