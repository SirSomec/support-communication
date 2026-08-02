import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "./identity.repository.js";
import { TeamDirectoryRepository } from "./team-directory.repository.js";
import { type MfaOtpRuntime } from "./mfa-otp.js";
import { type InviteMailDelivery } from "../mail/service-mailer.js";
interface EmployeeMutationPayload {
    canOverride?: boolean;
    channels?: string[];
    chatLimit?: number;
    groupId?: string;
    roleKey?: string;
    sensitiveData?: boolean;
    status?: string;
}
interface EmployeeInvitePayload {
    email?: string;
    groupId?: string;
    name?: string;
    roleKey?: string;
    tenantId?: string;
}
interface GroupMutationPayload {
    channels?: string[];
    memberIds?: string[];
    name?: string;
    scope?: string;
    tenantId?: string;
}
interface EmployeeTenantOptions {
    tenantId?: string;
}
export declare class SettingsEmployeeService {
    private readonly identityRepository;
    private readonly teamDirectoryRepository;
    private readonly recoveryDelivery?;
    private readonly inviteDelivery?;
    private readonly employeeSettings;
    private readonly groups;
    private readonly hydratedGroupTenants;
    private readonly auditEvents;
    constructor(identityRepository?: IdentityRepository, teamDirectoryRepository?: TeamDirectoryRepository, recoveryDelivery?: Pick<MfaOtpRuntime, "deliverRecovery"> | undefined, inviteDelivery?: InviteMailDelivery | undefined);
    listSettingsAuditEvents(): {
        [x: string]: unknown;
    }[];
    fetchEmployees(filters?: {
        groupId?: string;
        query?: string;
        roleKey?: string;
        status?: string;
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    inviteEmployee(payload?: EmployeeInvitePayload, options?: {
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateEmployee(employeeId: string, payload?: EmployeeMutationPayload, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    resetEmployeePassword(employeeId: string, payload?: {
        reason?: string;
    }, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    resetEmployeeMfa(employeeId: string, payload?: {
        reason?: string;
    }, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    deactivateEmployee(employeeId: string, payload?: {
        reason?: string;
    }, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteEmployee(employeeId: string, payload?: {
        reason?: string;
    }, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    resendEmployeeInvite(employeeId: string, payload?: {
        reason?: string;
    }, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchRoles(): Promise<BackendEnvelope<Record<string, unknown>>>;
    private validateLastActiveAdministrator;
    fetchGroups(options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    createGroup(payload?: GroupMutationPayload, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateGroup(groupId: string, payload?: GroupMutationPayload, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteGroup(groupId: string, payload?: GroupMutationPayload & {
        reason?: string;
    }, options?: EmployeeTenantOptions): Promise<BackendEnvelope<Record<string, unknown>>>;
    private applyGroupMembers;
    private toEmployee;
    private getEmployeeSettings;
    private listGroups;
    private getGroup;
    private ensureDefaultGroupsForTenant;
    private syncGroupMember;
    private removeGroupMember;
    private resolveGroupId;
    private hydrateGroups;
    private persistGroups;
    private persistAuditEvent;
    private buildRoleReadModel;
}
export {};
