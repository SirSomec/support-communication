import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { writeStructuredLog } from "@support-communication/observability";
import { makeAuditId } from "./backend-ids.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { IdentityRepository, type IdentityTenantUser } from "./identity.repository.js";
import { TeamDirectoryRepository } from "./team-directory.repository.js";
import { createMfaOtpRuntimeFromEnv, type MfaOtpRuntime } from "./mfa-otp.js";
import {
  createInviteMailDeliveryFromEnv,
  createServiceMailOverrideResolver,
  type InviteMailDelivery
} from "../mail/service-mailer.js";

const SERVICE = "settingsService";
const supportedChannels = ["SDK", "Telegram", "MAX", "VK"];

interface EmployeeSettingsOverlay {
  canOverride: boolean;
  channels: string[];
  chatLimit: number;
  groupId: string;
  roleKey: string;
  sensitiveData: boolean;
}

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

interface EmployeeGroup {
  channels: string[];
  id: string;
  memberIds: string[];
  name: string;
  scope: string;
  tenantId: string;
  updatedAt: string;
}

export class SettingsEmployeeService {
  private readonly employeeSettings = new Map<string, EmployeeSettingsOverlay>();
  private readonly groups = new Map<string, EmployeeGroup>();
  private readonly hydratedGroupTenants = new Set<string>();
  private readonly auditEvents: Array<Record<string, unknown>> = [];

  constructor(
    private readonly identityRepository = IdentityRepository.default(),
    private readonly teamDirectoryRepository = TeamDirectoryRepository.default(),
    private readonly recoveryDelivery?: Pick<MfaOtpRuntime, "deliverRecovery">,
    private readonly inviteDelivery?: InviteMailDelivery
  ) {}

  listSettingsAuditEvents() {
    return this.auditEvents.map((event) => ({ ...event }));
  }

  async fetchEmployees(filters: { groupId?: string; query?: string; roleKey?: string; status?: string; tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(filters.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("fetchEmployees");
    }

    await this.hydrateGroups(tenantId);

    const users = await this.identityRepository.findTenantUsers(tenantId);
    const employees = users.map((user) => this.toEmployee(user));
    await this.persistGroups(tenantId);
    const filtered = employees
      .filter((employee) => !filters.status || filters.status === "all" || employee.status === filters.status)
      .filter((employee) => !filters.roleKey || filters.roleKey === "all" || employee.roleKey === filters.roleKey)
      .filter((employee) => !filters.groupId || filters.groupId === "all" || employee.groupId === filters.groupId)
      .filter((employee) => {
        const query = String(filters.query ?? "").trim().toLowerCase();
        const channels = Array.isArray(employee.channels) ? employee.channels : [];
        return !query || [
          employee.name,
          employee.email,
          employee.role,
          employee.groupName,
          employee.status,
          ...channels
        ].join(" ").toLowerCase().includes(query);
      });
    const needsAttention = employees.filter((employee) => {
      const credentials = employee.credentials && typeof employee.credentials === "object"
        ? employee.credentials as { passwordStatus?: unknown }
        : {};
      return employee.mfaStatus === "reset_pending" || credentials.passwordStatus !== "active";
    }).length;

    return createEnvelope({
      service: SERVICE,
      operation: "fetchEmployees",
      traceId: identityTraceId(SERVICE, "fetchEmployees"),
      meta: apiMeta({ filters: { ...filters, tenantId } }),
      data: {
        employees: filtered,
        groups: this.listGroups(tenantId),
        roles: await this.buildRoleReadModel(),
        supportedChannels,
        totals: {
          all: employees.length,
          active: employees.filter((employee) => employee.status === "active").length,
          invited: employees.filter((employee) => employee.status === "invited").length,
          blocked: employees.filter((employee) => employee.status === "blocked").length,
          needsAttention
        }
      }
    });
  }

  async inviteEmployee(payload: EmployeeInvitePayload = {}, options: { tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(payload.tenantId ?? options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("inviteEmployee");
    }
    await this.hydrateGroups(tenantId);

    const email = String(payload.email ?? "").trim().toLowerCase();
    const name = String(payload.name ?? "").trim();
    if (!email || !name) {
      return invalidEnvelope("inviteEmployee", "employee_name_email_required", "Employee name and email are required.", { tenantId });
    }

    const existingUsers = await this.identityRepository.findTenantUsersByEmail(email);
    const existing = existingUsers.find((candidate) => candidate.tenantId === tenantId);
    // Отключённую учётную запись можно пригласить заново с той же почтой:
    // запись переиспользуется и возвращается в состояние "invited".
    if (existing && existing.status !== "deactivated") {
      return invalidEnvelope("inviteEmployee", "employee_email_exists", "Employee email already exists in this tenant.", { tenantId, email });
    }

    const roleKey = normalizeRoleKey(payload.roleKey);
    const groupId = this.resolveGroupId(tenantId, payload.groupId, roleKey);
    if (!groupId) {
      return invalidEnvelope("inviteEmployee", "group_not_found", "Employee group was not found.", { tenantId, groupId: payload.groupId ?? null });
    }
    const now = new Date().toISOString();
    const user: IdentityTenantUser = {
      id: existing?.id ?? `usr_settings_${randomUUID()}`,
      tenantId,
      name,
      email,
      role: roleNameFromKey(roleKey),
      status: "invited",
      mfa: "enabled",
      metadata: {
        ...(existing?.metadata ?? {}),
        employeeSettings: {
          canOverride: roleKey !== "employee",
          channels: ["SDK", "Telegram"],
          chatLimit: roleKey === "admin" ? 20 : 8,
          groupId,
          roleKey,
          sensitiveData: roleKey !== "employee"
        }
      },
      inviteStatus: "pending",
      lastActiveAt: existing?.lastActiveAt ?? null,
      sessions: 0,
      risk: existing?.risk ?? "low",
      device: "Invite pending",
      supportNotes: existing ? "Re-invited from tenant settings." : "Invited from tenant settings."
    };
    const saved = await this.identityRepository.saveTenantUser(user);
    const inviteToken = await this.identityRepository.createInviteToken({
      code: `invite_${randomUUID()}`,
      email,
      tenantId
    });

    // Письмо-приглашение уходит через служебную почту воркспейса (env-фолбэк —
    // внутри доставки). Сбой отправки не отменяет приглашение: код остаётся
    // валидным, а состояние доставки видно администратору в ответе.
    let deliveryState = "sent";
    try {
      const delivery = this.inviteDelivery ?? createInviteMailDeliveryFromEnv();
      await delivery.sendInvite({
        code: inviteToken.code,
        email: inviteToken.email,
        expiresAt: inviteToken.expiresAt,
        inviteeName: name,
        tenantId: inviteToken.tenantId
      });
    } catch (error) {
      deliveryState = "failed";
      writeStructuredLog("warn", "Invite email delivery failed", {
        errorName: error instanceof Error ? error.message : typeof error,
        service: SERVICE,
        tenantId
      });
    }

    this.employeeSettings.set(saved.id, {
      canOverride: roleKey !== "employee",
      channels: ["SDK", "Telegram"],
      chatLimit: roleKey === "admin" ? 20 : 8,
      groupId,
      roleKey,
      sensitiveData: roleKey !== "employee"
    });
    this.syncGroupMember(groupId, saved.id, saved.tenantId);
    await this.persistGroups(tenantId);

    return createEnvelope({
      service: SERVICE,
      operation: "inviteEmployee",
      traceId: identityTraceId(SERVICE, "inviteEmployee"),
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.invite", tenantId, saved.id, "Employee invited from settings", now)),
        employee: this.toEmployee(saved),
        inviteDescriptor: {
          code: inviteToken.code,
          deliveryState,
          email: inviteToken.email,
          expiresAt: inviteToken.expiresAt,
          id: inviteToken.id,
          tenantId: inviteToken.tenantId
        }
      }
    });
  }

  async updateEmployee(employeeId: string, payload: EmployeeMutationPayload = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("updateEmployee", employeeId);
    }
    const tenantMismatch = validateEmployeeTenant("updateEmployee", user, options.tenantId);
    if (tenantMismatch) {
      return tenantMismatch;
    }

    await this.hydrateGroups(user.tenantId);

    const current = this.getEmployeeSettings(user);
    const requestedRoleKey = payload.roleKey === undefined ? current.roleKey : parseRoleKey(payload.roleKey);
    if (!requestedRoleKey) {
      return invalidEnvelope("updateEmployee", "employee_role_invalid", "Employee role is not supported.", { employeeId, tenantId: user.tenantId });
    }
    const nextStatus = payload.status === undefined ? user.status : normalizeEmployeeStatus(payload.status);
    if (!nextStatus) {
      return invalidEnvelope("updateEmployee", "employee_status_invalid", "Employee status is not supported.", { employeeId, tenantId: user.tenantId });
    }
    const nextRoleKey = requestedRoleKey;
    const adminGuard = await this.validateLastActiveAdministrator(user, nextRoleKey, nextStatus, "updateEmployee");
    if (adminGuard) return adminGuard;
    let nextGroupId = current.groupId;
    if (payload.groupId !== undefined) {
      const resolvedGroupId = this.resolveGroupId(user.tenantId, payload.groupId, nextRoleKey);
      if (!resolvedGroupId) {
        return invalidEnvelope("updateEmployee", "group_not_found", "Employee group was not found.", { employeeId, groupId: payload.groupId ?? null, tenantId: user.tenantId });
      }
      nextGroupId = resolvedGroupId;
    }
    const next: EmployeeSettingsOverlay = {
      ...current,
      canOverride: payload.canOverride ?? current.canOverride,
      channels: payload.channels ? normalizeChannels(payload.channels) : current.channels,
      chatLimit: payload.chatLimit === undefined ? current.chatLimit : normalizeChatLimit(payload.chatLimit),
      groupId: nextGroupId,
      roleKey: nextRoleKey,
      sensitiveData: payload.sensitiveData ?? current.sensitiveData
    };

    const saved = await this.identityRepository.saveTenantUser({
      ...user,
      metadata: { ...(user.metadata ?? {}), employeeSettings: next },
      role: roleNameFromKey(next.roleKey),
      status: nextStatus
    });
    this.employeeSettings.set(saved.id, next);
    this.syncGroupMember(next.groupId, saved.id, saved.tenantId);
    await this.persistGroups(saved.tenantId);
    if (next.roleKey !== current.roleKey) {
      // Права активных сессий пересчитываются сразу, иначе смена роли
      // «не работает» до следующего входа сотрудника.
      await this.identityRepository.refreshTenantOperatorSessionPermissions(saved.id);
    }

    return createEnvelope({
      service: SERVICE,
      operation: "updateEmployee",
      traceId: identityTraceId(SERVICE, "updateEmployee"),
      meta: apiMeta({ employeeId: saved.id, tenantId: saved.tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.update", saved.tenantId, saved.id, "Employee settings updated")),
        employee: this.toEmployee(saved)
      }
    });
  }

  async resetEmployeePassword(employeeId: string, payload: { reason?: string } = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("resetEmployeePassword", employeeId);
    }
    const tenantMismatch = validateEmployeeTenant("resetEmployeePassword", user, options.tenantId);
    if (tenantMismatch) {
      return tenantMismatch;
    }

    await this.hydrateGroups(user.tenantId);
    const recoveryToken = await this.identityRepository.createRecoveryToken(user.email);
    const delivery = this.recoveryDelivery ?? createMfaOtpRuntimeFromEnv(process.env, {
      serviceMail: createServiceMailOverrideResolver()
    });
    const delivered = await delivery.deliverRecovery({
      email: user.email,
      expiresAt: recoveryToken.expiresAt,
      recoveryToken: recoveryToken.token,
      requestId: recoveryToken.id
    });
    const requestedAt = new Date().toISOString();
    const saved = await this.identityRepository.saveTenantUser({
      ...user,
      metadata: {
        ...(user.metadata ?? {}),
        passwordRecovery: {
          expiresAt: recoveryToken.expiresAt,
          providerMessageId: delivered.providerMessageId,
          reason: String(payload.reason ?? "").trim() || "Password reset requested by tenant administrator",
          requestId: recoveryToken.id,
          requestedAt,
          status: "queued"
        }
      }
    });

    return createEnvelope({
      service: SERVICE,
      operation: "resetEmployeePassword",
      traceId: identityTraceId(SERVICE, "resetEmployeePassword"),
      meta: apiMeta({ employeeId: saved.id, tenantId: saved.tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.password_reset", saved.tenantId, saved.id, payload.reason ?? "Password reset sent")),
        employee: {
          ...this.toEmployee(saved),
          credentials: { passwordStatus: "reset_sent" }
        },
        recovery: {
          expiresAt: recoveryToken.expiresAt,
          requestId: recoveryToken.id,
          status: "queued"
        }
      }
    });
  }

  async resetEmployeeMfa(employeeId: string, payload: { reason?: string } = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("resetEmployeeMfa", employeeId);
    }
    const tenantMismatch = validateEmployeeTenant("resetEmployeeMfa", user, options.tenantId);
    if (tenantMismatch) {
      return tenantMismatch;
    }

    await this.hydrateGroups(user.tenantId);
    const saved = await this.identityRepository.saveTenantUser({ ...user, mfa: "reset_pending" });
    return createEnvelope({
      service: SERVICE,
      operation: "resetEmployeeMfa",
      traceId: identityTraceId(SERVICE, "resetEmployeeMfa"),
      meta: apiMeta({ employeeId: saved.id, tenantId: saved.tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.mfa_reset", saved.tenantId, saved.id, payload.reason ?? "MFA reset requested")),
        employee: this.toEmployee(saved)
      }
    });
  }

  async deactivateEmployee(employeeId: string, payload: { reason?: string } = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("deactivateEmployee", employeeId);
    }
    const tenantMismatch = validateEmployeeTenant("deactivateEmployee", user, options.tenantId);
    if (tenantMismatch) {
      return tenantMismatch;
    }

    await this.hydrateGroups(user.tenantId);
    const adminGuard = await this.validateLastActiveAdministrator(user, this.getEmployeeSettings(user).roleKey, "deactivated", "deactivateEmployee");
    if (adminGuard) return adminGuard;

    const saved = await this.identityRepository.saveTenantUser({ ...user, status: "deactivated", sessions: 0 });
    return createEnvelope({
      service: SERVICE,
      operation: "deactivateEmployee",
      traceId: identityTraceId(SERVICE, "deactivateEmployee"),
      meta: apiMeta({ employeeId: saved.id, tenantId: saved.tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.deactivate", saved.tenantId, saved.id, payload.reason ?? "Employee deactivated")),
        employee: this.toEmployee(saved)
      }
    });
  }

  async deleteEmployee(employeeId: string, payload: { reason?: string } = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("deleteEmployee", employeeId);
    }
    const tenantMismatch = validateEmployeeTenant("deleteEmployee", user, options.tenantId);
    if (tenantMismatch) {
      return tenantMismatch;
    }

    await this.hydrateGroups(user.tenantId);
    const adminGuard = await this.validateLastActiveAdministrator(user, this.getEmployeeSettings(user).roleKey, "deactivated", "deleteEmployee");
    if (adminGuard) return adminGuard;

    const deleted = await this.identityRepository.deleteTenantUser(user.id);
    this.employeeSettings.delete(user.id);
    this.removeGroupMember(user.id, user.tenantId);
    await this.persistGroups(user.tenantId);

    return createEnvelope({
      service: SERVICE,
      operation: "deleteEmployee",
      traceId: identityTraceId(SERVICE, "deleteEmployee"),
      meta: apiMeta({ employeeId: user.id, tenantId: user.tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.delete", user.tenantId, user.id, payload.reason ?? "Employee deleted")),
        deleted: Boolean(deleted),
        email: user.email,
        employeeId: user.id
      }
    });
  }

  async resendEmployeeInvite(employeeId: string, payload: { reason?: string } = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("resendEmployeeInvite", employeeId);
    }
    const tenantMismatch = validateEmployeeTenant("resendEmployeeInvite", user, options.tenantId);
    if (tenantMismatch) {
      return tenantMismatch;
    }
    if (user.status !== "invited") {
      return invalidEnvelope("resendEmployeeInvite", "employee_not_invited", "Invite can be resent only for employees in invited state.", {
        employeeId: user.id,
        status: user.status,
        tenantId: user.tenantId
      });
    }

    await this.hydrateGroups(user.tenantId);
    const inviteToken = await this.identityRepository.createInviteToken({
      code: `invite_${randomUUID()}`,
      email: user.email,
      tenantId: user.tenantId
    });
    let deliveryState = "sent";
    try {
      const delivery = this.inviteDelivery ?? createInviteMailDeliveryFromEnv();
      await delivery.sendInvite({
        code: inviteToken.code,
        email: inviteToken.email,
        expiresAt: inviteToken.expiresAt,
        inviteeName: user.name,
        tenantId: inviteToken.tenantId
      });
    } catch (error) {
      deliveryState = "failed";
      writeStructuredLog("warn", "Invite email delivery failed", {
        errorName: error instanceof Error ? error.message : typeof error,
        service: SERVICE,
        tenantId: user.tenantId
      });
    }
    const saved = await this.identityRepository.saveTenantUser({ ...user, inviteStatus: "pending" });

    return createEnvelope({
      service: SERVICE,
      operation: "resendEmployeeInvite",
      traceId: identityTraceId(SERVICE, "resendEmployeeInvite"),
      meta: apiMeta({ employeeId: saved.id, tenantId: saved.tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.invite_resend", saved.tenantId, saved.id, payload.reason ?? "Invite resent")),
        employee: this.toEmployee(saved),
        inviteDescriptor: {
          code: inviteToken.code,
          deliveryState,
          email: inviteToken.email,
          expiresAt: inviteToken.expiresAt,
          id: inviteToken.id,
          tenantId: inviteToken.tenantId
        }
      }
    });
  }

  async fetchRoles(): Promise<BackendEnvelope<Record<string, unknown>>> {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchRoles",
      traceId: identityTraceId(SERVICE, "fetchRoles"),
      meta: apiMeta(),
      data: { roles: await this.buildRoleReadModel() }
    });
  }

  private async validateLastActiveAdministrator(
    user: IdentityTenantUser,
    nextRoleKey: string,
    nextStatus: string,
    operation: string
  ): Promise<BackendEnvelope<Record<string, unknown>> | null> {
    const currentRoleKey = this.getEmployeeSettings(user).roleKey;
    if (currentRoleKey !== "admin" || user.status !== "active" || (nextRoleKey === "admin" && nextStatus === "active")) {
      return null;
    }
    const tenantUsers = await this.identityRepository.findTenantUsers(user.tenantId);
    const activeAdmins = tenantUsers.filter((candidate) =>
      candidate.id !== user.id
      && candidate.status === "active"
      && this.getEmployeeSettings(candidate).roleKey === "admin"
    );
    return activeAdmins.length ? null : invalidEnvelope(operation, "last_admin_required", "At least one active administrator must remain in the tenant.", {
      employeeId: user.id,
      tenantId: user.tenantId
    });
  }

  async fetchGroups(options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("fetchGroups");
    }

    await this.hydrateGroups(tenantId);

    return createEnvelope({
      service: SERVICE,
      operation: "fetchGroups",
      traceId: identityTraceId(SERVICE, "fetchGroups"),
      meta: apiMeta({ tenantId }),
      data: { groups: this.listGroups(tenantId) }
    });
  }

  async createGroup(payload: GroupMutationPayload = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(payload.tenantId ?? options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("createGroup");
    }

    await this.hydrateGroups(tenantId);

    const name = String(payload.name ?? "").trim();
    if (!name) {
      return invalidEnvelope("createGroup", "group_name_required", "Group name is required.", { tenantId });
    }

    const group: EmployeeGroup = {
      channels: normalizeChannels(payload.channels ?? supportedChannels),
      id: `group-${slugify(name)}-${randomUUID().slice(0, 8)}`,
      memberIds: [],
      name,
      scope: String(payload.scope ?? "Tenant support").trim(),
      tenantId,
      updatedAt: new Date().toISOString()
    };
    this.groups.set(groupKey(tenantId, group.id), group);
    if (payload.memberIds?.length) {
      await this.applyGroupMembers(tenantId, group.id, payload.memberIds);
    }
    await this.persistGroups(tenantId);

    const persisted = this.getGroup(tenantId, group.id) ?? group;
    return createEnvelope({
      service: SERVICE,
      operation: "createGroup",
      traceId: identityTraceId(SERVICE, "createGroup"),
      meta: apiMeta({ groupId: group.id, tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.group.create", tenantId, group.id, "Employee group created")),
        group: { ...persisted, channels: [...persisted.channels], memberIds: [...persisted.memberIds] }
      }
    });
  }

  async updateGroup(groupId: string, payload: GroupMutationPayload = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(payload.tenantId ?? options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("updateGroup", { groupId });
    }

    await this.hydrateGroups(tenantId);

    const group = this.groups.get(groupKey(tenantId, groupId));
    if (!group) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateGroup",
        traceId: identityTraceId(SERVICE, "updateGroup"),
        status: "not_found",
        meta: apiMeta({ groupId, tenantId }),
        data: { groupId, tenantId },
        error: { code: "group_not_found", message: `Group ${groupId} was not found.` }
      });
    }

    const updated: EmployeeGroup = {
      ...group,
      channels: payload.channels ? normalizeChannels(payload.channels) : group.channels,
      memberIds: [...group.memberIds],
      name: String(payload.name ?? group.name).trim() || group.name,
      scope: String(payload.scope ?? group.scope).trim() || group.scope,
      updatedAt: new Date().toISOString()
    };
    this.groups.set(groupKey(tenantId, groupId), updated);
    if (payload.memberIds !== undefined) {
      await this.applyGroupMembers(tenantId, groupId, payload.memberIds);
    }
    await this.persistGroups(tenantId);
    const persisted = this.getGroup(tenantId, groupId) ?? updated;

    return createEnvelope({
      service: SERVICE,
      operation: "updateGroup",
      traceId: identityTraceId(SERVICE, "updateGroup"),
      meta: apiMeta({ groupId, tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.group.update", tenantId, groupId, "Employee group updated")),
        group: { ...persisted, channels: [...persisted.channels], memberIds: [...persisted.memberIds] }
      }
    });
  }

  async deleteGroup(groupId: string, payload: GroupMutationPayload & { reason?: string } = {}, options: EmployeeTenantOptions = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(payload.tenantId ?? options.tenantId);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("deleteGroup", { groupId });
    }

    await this.hydrateGroups(tenantId);
    const group = this.groups.get(groupKey(tenantId, groupId));
    if (!group) {
      return createEnvelope({
        service: SERVICE,
        operation: "deleteGroup",
        traceId: identityTraceId(SERVICE, "deleteGroup"),
        status: "not_found",
        meta: apiMeta({ groupId, tenantId }),
        data: { groupId, tenantId },
        error: { code: "group_not_found", message: `Group ${groupId} was not found.` }
      });
    }

    const remaining = this.listGroups(tenantId).filter((item) => item.id !== groupId);
    if (!remaining.length) {
      return invalidEnvelope("deleteGroup", "group_last_remaining", "At least one employee group must remain.", { groupId, tenantId });
    }
    const fallbackGroupId = remaining.some((item) => item.id === "group-line-1") ? "group-line-1" : remaining[0].id;

    // Сотрудники удаляемой группы переводятся в фолбэк-группу, чтобы каждый
    // сотрудник всегда оставался ровно в одной группе.
    const users = await this.identityRepository.findTenantUsers(tenantId);
    const movedEmployeeIds: string[] = [];
    for (const user of users) {
      const settings = this.getEmployeeSettings(user);
      if (settings.groupId !== groupId) {
        continue;
      }
      const next: EmployeeSettingsOverlay = { ...settings, groupId: fallbackGroupId };
      await this.identityRepository.saveTenantUser({
        ...user,
        metadata: { ...(user.metadata ?? {}), employeeSettings: next }
      });
      this.employeeSettings.set(user.id, next);
      this.syncGroupMember(fallbackGroupId, user.id, tenantId);
      movedEmployeeIds.push(user.id);
    }

    this.groups.delete(groupKey(tenantId, groupId));
    await this.teamDirectoryRepository.deleteTeam(tenantId, groupId);
    await this.persistGroups(tenantId);

    return createEnvelope({
      service: SERVICE,
      operation: "deleteGroup",
      traceId: identityTraceId(SERVICE, "deleteGroup"),
      meta: apiMeta({ groupId, tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.group.delete", tenantId, groupId, payload.reason ?? "Employee group deleted")),
        fallbackGroupId,
        groupId,
        movedEmployeeIds
      }
    });
  }

  // Приводит состав группы к заданному списку: добавленные сотрудники
  // закрепляются за группой, исключённые переезжают в фолбэк-группу.
  private async applyGroupMembers(tenantId: string, groupId: string, requestedMemberIds: string[]): Promise<void> {
    const group = this.groups.get(groupKey(tenantId, groupId));
    if (!group) {
      return;
    }

    const users = await this.identityRepository.findTenantUsers(tenantId);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const nextMemberIds = Array.from(new Set(requestedMemberIds.map(String).filter((id) => usersById.has(id))));
    const previousMemberIds = users
      .filter((user) => this.getEmployeeSettings(user).groupId === groupId)
      .map((user) => user.id);
    const removed = previousMemberIds.filter((id) => !nextMemberIds.includes(id));
    const added = nextMemberIds.filter((id) => !previousMemberIds.includes(id));
    const fallback = this.listGroups(tenantId).find((item) => item.id !== groupId);
    const fallbackGroupId = fallback?.id ?? groupId;

    for (const employeeId of [...added, ...removed]) {
      const user = usersById.get(employeeId);
      if (!user) {
        continue;
      }
      const targetGroupId = added.includes(employeeId) ? groupId : fallbackGroupId;
      const settings = this.getEmployeeSettings(user);
      if (settings.groupId === targetGroupId) {
        continue;
      }
      const next: EmployeeSettingsOverlay = { ...settings, groupId: targetGroupId };
      await this.identityRepository.saveTenantUser({
        ...user,
        metadata: { ...(user.metadata ?? {}), employeeSettings: next }
      });
      this.employeeSettings.set(user.id, next);
      this.syncGroupMember(targetGroupId, user.id, tenantId);
    }
  }

  private toEmployee(user: IdentityTenantUser): Record<string, unknown> {
    const settings = this.getEmployeeSettings(user);
    const group = this.getGroup(user.tenantId, settings.groupId);
    return {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      employee: user.name,
      email: user.email,
      role: roleNameFromKey(settings.roleKey),
      roleKey: settings.roleKey,
      group: group?.name ?? settings.groupId,
      groupId: settings.groupId,
      groupName: group?.name ?? settings.groupId,
      status: user.status,
      channels: settings.channels,
      chatLimit: settings.chatLimit,
      canOverride: settings.canOverride,
      sensitiveData: settings.sensitiveData,
      credentials: { passwordStatus: passwordStatusFromUser(user) },
      passwordStatus: passwordStatusFromUser(user),
      mfaStatus: normalizeMfaStatus(user.mfa),
      inviteStatus: user.inviteStatus,
      lastLogin: user.lastActiveAt ?? "Never",
      lastActiveAt: user.lastActiveAt,
      sessions: user.sessions,
      risk: user.risk,
      device: user.device,
      exceptions: buildExceptions(user, settings)
    };
  }

  private getEmployeeSettings(user: IdentityTenantUser): EmployeeSettingsOverlay {
    const existing = this.employeeSettings.get(user.id);
    if (existing) {
      return existing;
    }

    const roleKey = normalizeRoleKey(user.role);
    const persisted = employeeSettingsFromMetadata(user.metadata);
    const settings: EmployeeSettingsOverlay = persisted ?? {
      canOverride: roleKey !== "employee",
      channels: roleKey === "admin" ? supportedChannels : roleKey === "senior" ? ["SDK", "Telegram", "VK"] : ["SDK", "Telegram"],
      chatLimit: roleKey === "admin" ? 20 : roleKey === "senior" ? 14 : 8,
      groupId: this.resolveGroupId(user.tenantId, undefined, roleKey) ?? normalizeGroupId(undefined, roleKey),
      roleKey,
      sensitiveData: roleKey !== "employee"
    };
    this.employeeSettings.set(user.id, settings);
    this.syncGroupMember(settings.groupId, user.id, user.tenantId);
    return settings;
  }

  private listGroups(tenantId: string): EmployeeGroup[] {
    return Array.from(this.groups.values()).map((group) => ({
      ...group,
      channels: [...group.channels],
      memberIds: [...group.memberIds]
    })).filter((group) => group.tenantId === tenantId);
  }

  private getGroup(tenantId: string, groupId: string): EmployeeGroup | undefined {
    return this.groups.get(groupKey(tenantId, groupId));
  }

  private ensureDefaultGroupsForTenant(tenantId: string): void {
    for (const group of defaultGroups) {
      const key = groupKey(tenantId, group.id);
      if (!this.groups.has(key)) {
        this.groups.set(key, {
          ...group,
          channels: [...group.channels],
          memberIds: [...group.memberIds],
          tenantId
        });
      }
    }
  }

  // Сотрудник состоит ровно в одной группе: добавление в целевую группу
  // одновременно убирает его из всех остальных групп тенанта.
  private syncGroupMember(groupId: string, employeeId: string, tenantId: string): void {
    for (const [key, group] of this.groups) {
      if (group.tenantId !== tenantId) {
        continue;
      }
      const isTarget = group.id === groupId;
      const isMember = group.memberIds.includes(employeeId);
      if (isTarget && !isMember) {
        this.groups.set(key, {
          ...group,
          memberIds: [...group.memberIds, employeeId],
          updatedAt: new Date().toISOString()
        });
      } else if (!isTarget && isMember) {
        this.groups.set(key, {
          ...group,
          memberIds: group.memberIds.filter((memberId) => memberId !== employeeId),
          updatedAt: new Date().toISOString()
        });
      }
    }
  }

  private removeGroupMember(employeeId: string, tenantId: string): void {
    for (const [key, group] of this.groups) {
      if (group.tenantId !== tenantId || !group.memberIds.includes(employeeId)) {
        continue;
      }
      this.groups.set(key, {
        ...group,
        memberIds: group.memberIds.filter((memberId) => memberId !== employeeId),
        updatedAt: new Date().toISOString()
      });
    }
  }

  private resolveGroupId(tenantId: string, requested: unknown, roleKey: string): string | null {
    const raw = String(requested ?? "").trim();
    if (raw) {
      return this.groups.has(groupKey(tenantId, raw)) ? raw : null;
    }
    const fallback = normalizeGroupId(undefined, roleKey);
    if (this.groups.has(groupKey(tenantId, fallback))) {
      return fallback;
    }
    return this.listGroups(tenantId)[0]?.id ?? null;
  }

  private async hydrateGroups(tenantId: string): Promise<void> {
    if (this.hydratedGroupTenants.has(tenantId)) {
      return;
    }

    const tenant = await this.identityRepository.findTenant(tenantId);
    const persistedTeams = await this.teamDirectoryRepository.listTeams(tenantId);
    const compatibleGroups = persistedTeams.length ? persistedTeams : tenant?.employeeGroups ?? [];
    for (const group of compatibleGroups) {
      if (group.tenantId === tenantId && group.id) {
        this.groups.set(groupKey(tenantId, group.id), {
          ...group,
          channels: normalizeChannels(group.channels),
          memberIds: Array.from(new Set(group.memberIds.map(String).filter(Boolean)))
        });
      }
    }
    this.hydratedGroupTenants.add(tenantId);
    // Стартовые группы создаются только для тенанта без единой группы —
    // иначе удалённые группы «воскресали» бы после перезапуска сервиса.
    if (!this.listGroups(tenantId).length) {
      this.ensureDefaultGroupsForTenant(tenantId);
    }
  }

  private async persistGroups(tenantId: string): Promise<void> {
    const tenant = await this.identityRepository.findTenant(tenantId);
    if (!tenant) {
      return;
    }
    const users = await this.identityRepository.findTenantUsers(tenantId);
    const validUserIds = new Set(users.map((user) => user.id));
    const groups = this.listGroups(tenantId).map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((memberId) => validUserIds.has(memberId)),
      status: "active"
    }));
    await Promise.all(groups.map((group) => this.teamDirectoryRepository.saveTeam(group)));
    await this.identityRepository.saveTenant({
      ...tenant,
      employeeGroups: groups
    });
  }

  private persistAuditEvent<TEvent extends Record<string, unknown>>(event: TEvent): TEvent {
    this.auditEvents.push({ ...event });
    return event;
  }

  // Тенанту показываются только назначаемые роли: платформенная роль
  // service_admin в этот список не попадает (раньше она отображалась вторым
  // «Сотрудником» и ломала смену ролей).
  private async buildRoleReadModel() {
    const permissionRoles = await this.identityRepository.listPermissionRoles();
    const order = new Map(assignableRoleKeys.map((key, index) => [key, index]));
    return permissionRoles
      .filter((role) => order.has(role.key))
      .sort((left, right) => (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0))
      .map((role) => ({
        key: role.key,
        name: roleNameFromKey(role.key),
        description: roleDescriptionFromKey(role.key),
        actions: role.actions,
        groupIds: role.groupIds
      }));
  }
}

const defaultGroups: Array<Omit<EmployeeGroup, "tenantId">> = [
  { channels: ["SDK", "Telegram"], id: "group-line-1", memberIds: [], name: "Line 1", scope: "First response", updatedAt: "2026-07-01T00:00:00.000Z" },
  { channels: ["Telegram", "MAX", "VK"], id: "group-vip", memberIds: [], name: "VIP support", scope: "High value clients", updatedAt: "2026-07-01T00:00:00.000Z" },
  { channels: supportedChannels, id: "group-admins", memberIds: [], name: "Administrators", scope: "Settings and audit", updatedAt: "2026-07-01T00:00:00.000Z" }
];

function groupKey(tenantId: string, groupId: string): string {
  return `${tenantId}:${groupId}`;
}

function employeeSettingsFromMetadata(metadata: Record<string, unknown> | undefined): EmployeeSettingsOverlay | null {
  const candidate = metadata?.employeeSettings;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const value = candidate as Record<string, unknown>;
  const roleKey = normalizeRoleKey(value.roleKey);
  return {
    canOverride: Boolean(value.canOverride),
    channels: normalizeChannels(Array.isArray(value.channels) ? value.channels.map(String) : []),
    chatLimit: normalizeChatLimit(value.chatLimit),
    groupId: normalizeGroupId(value.groupId, roleKey),
    roleKey,
    sensitiveData: Boolean(value.sensitiveData)
  };
}

function auditEvent(action: string, tenantId: string, targetId: string, reason: string, at = new Date().toISOString()) {
  return {
    action,
    at,
    id: makeAuditId("settings_employee"),
    immutable: true,
    reason,
    result: "ok",
    targetId,
    tenantId
  };
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>) {
  return createEnvelope({
    service: SERVICE,
    operation,
    traceId: identityTraceId(SERVICE, operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(operation: string, employeeId: string) {
  return createEnvelope({
    service: SERVICE,
    operation,
    traceId: identityTraceId(SERVICE, operation),
    status: "not_found",
    meta: apiMeta({ employeeId }),
    data: { employeeId },
    error: { code: "employee_not_found", message: `Employee ${employeeId} was not found.` }
  });
}

function validateEmployeeTenant(operation: string, user: IdentityTenantUser, expectedTenantId?: string): BackendEnvelope<Record<string, unknown>> | null {
  const tenantId = String(expectedTenantId ?? "").trim();
  if (!tenantId) {
    return tenantContextRequiredEnvelope(operation, { employeeId: user.id });
  }

  if (tenantId === user.tenantId) {
    return null;
  }

  return createEnvelope({
    service: SERVICE,
    operation,
    traceId: identityTraceId(SERVICE, operation),
    status: "denied",
    meta: apiMeta({ employeeId: user.id, tenantId }),
    data: {
      employeeId: user.id,
      requestedTenantId: tenantId,
      tenantId: user.tenantId
    },
    error: {
      code: "employee_tenant_mismatch",
      message: `Employee ${user.id} does not belong to tenant ${tenantId}.`
    }
  });
}

function normalizeTenantId(value: unknown): string {
  return String(value ?? "").trim();
}

function tenantContextRequiredEnvelope(operation: string, data: Record<string, unknown> = {}) {
  return invalidEnvelope(operation, "tenant_context_required", "Tenant context is required for settings operations.", {
    ...data,
    tenantId: null
  });
}

function normalizeRoleKey(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["admin", "administrator", "owner", "администратор"].includes(raw)) return "admin";
  if (["senior", "senior operator", "старший сотрудник", "lead"].includes(raw)) return "senior";
  return "employee";
}

function parseRoleKey(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["admin", "administrator", "owner", "администратор"].includes(raw)) return "admin";
  if (["senior", "senior operator", "старший сотрудник", "lead"].includes(raw)) return "senior";
  if (["employee", "operator", "сотрудник"].includes(raw)) return "employee";
  return null;
}

function normalizeEmployeeStatus(value: unknown): string | null {
  const status = String(value ?? "").trim().toLowerCase();
  return ["active", "blocked", "deactivated", "inactive", "invited"].includes(status) ? status : null;
}

const assignableRoleKeys = ["employee", "senior", "admin"];

function roleNameFromKey(roleKey: string): string {
  if (roleKey === "admin") return "Администратор";
  if (roleKey === "senior") return "Старший сотрудник";
  if (roleKey === "service_admin") return "Администратор сервиса";
  return "Сотрудник";
}

function roleDescriptionFromKey(roleKey: string): string {
  if (roleKey === "admin") return "Полный доступ: настройки, команда, отчёты и интеграции.";
  if (roleKey === "senior") return "Диалоги, панель контроля, отчёты, качество и командные шаблоны.";
  return "Диалоги, клиенты и личные шаблоны ответов.";
}

function normalizeGroupId(value: unknown, roleKey: string): string {
  const raw = String(value ?? "").trim();
  if (raw) return raw;
  if (roleKey === "admin") return "group-admins";
  if (roleKey === "senior") return "group-vip";
  return "group-line-1";
}

function normalizeChannels(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  const normalized = list
    .map((value) => String(value ?? "").trim())
    .filter((value) => supportedChannels.includes(value));
  return normalized.length ? Array.from(new Set(normalized)) : ["SDK"];
}

function normalizeChatLimit(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 8;
  return Math.min(30, Math.max(1, Math.round(numeric)));
}

function passwordStatusFromUser(user: IdentityTenantUser): string {
  if (user.status === "invited") return "invite_pending";
  const recovery = user.metadata?.passwordRecovery;
  if (recovery && typeof recovery === "object" && !Array.isArray(recovery)
    && (recovery as Record<string, unknown>).status === "queued") return "reset_sent";
  return "active";
}

// MFA на платформе — это обязательный одноразовый код на почту при входе.
// Он включён для всех сотрудников по умолчанию; отдельного состояния
// «не настроена» больше нет, единственное исключение — ожидание повторного
// входа после сброса администратором.
function normalizeMfaStatus(value: string): string {
  return value === "reset_pending" ? "reset_pending" : "enabled";
}

function buildExceptions(user: IdentityTenantUser, settings: EmployeeSettingsOverlay): string[] {
  const exceptions: string[] = [];
  if (normalizeMfaStatus(user.mfa) === "reset_pending") exceptions.push("MFA сброшена — подтвердится при следующем входе");
  if (!settings.sensitiveData) exceptions.push("Персональные данные клиентов скрыты");
  if (settings.canOverride) exceptions.push("Разрешено назначение сверх лимита чатов");
  return exceptions;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
}
