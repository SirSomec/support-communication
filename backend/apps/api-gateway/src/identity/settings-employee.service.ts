import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
import { permissionRoles } from "./identity.fixtures.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { IdentityRepository, type IdentityTenantUser } from "./identity.repository.js";

const SERVICE = "settingsService";
const DEFAULT_TENANT_ID = "tenant-northstar";
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
}

interface EmployeeGroup {
  channels: string[];
  id: string;
  memberIds: string[];
  name: string;
  scope: string;
  updatedAt: string;
}

export class SettingsEmployeeService {
  private readonly employeeSettings = new Map<string, EmployeeSettingsOverlay>();
  private readonly groups = new Map<string, EmployeeGroup>(defaultGroups.map((group) => [group.id, { ...group, channels: [...group.channels], memberIds: [...group.memberIds] }]));
  private readonly auditEvents: Array<Record<string, unknown>> = [];

  constructor(private readonly identityRepository = IdentityRepository.default()) {}

  listSettingsAuditEvents() {
    return this.auditEvents.map((event) => ({ ...event }));
  }

  async fetchEmployees(filters: { groupId?: string; query?: string; roleKey?: string; status?: string; tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = normalizeTenantId(filters.tenantId);
    const users = await this.identityRepository.findTenantUsers(tenantId);
    const employees = users.map((user) => this.toEmployee(user));
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
      return employee.mfaStatus !== "enabled" || credentials.passwordStatus !== "active";
    }).length;

    return createEnvelope({
      service: SERVICE,
      operation: "fetchEmployees",
      traceId: identityTraceId(SERVICE, "fetchEmployees"),
      meta: apiMeta({ filters: { ...filters, tenantId } }),
      data: {
        employees: filtered,
        groups: this.listGroups(),
        roles: buildRoleReadModel(),
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
    const email = String(payload.email ?? "").trim().toLowerCase();
    const name = String(payload.name ?? "").trim();
    if (!email || !name) {
      return invalidEnvelope("inviteEmployee", "employee_name_email_required", "Employee name and email are required.", { tenantId });
    }

    const existing = await this.identityRepository.findTenantUserByEmail(email);
    if (existing && existing.tenantId === tenantId) {
      return invalidEnvelope("inviteEmployee", "employee_email_exists", "Employee email already exists in this tenant.", { tenantId, email });
    }

    const roleKey = normalizeRoleKey(payload.roleKey);
    const groupId = normalizeGroupId(payload.groupId, roleKey);
    const now = new Date().toISOString();
    const user: IdentityTenantUser = {
      id: `usr_settings_${randomUUID()}`,
      tenantId,
      name,
      email,
      role: roleNameFromKey(roleKey),
      status: "invited",
      mfa: "not_configured",
      inviteStatus: "pending",
      lastActiveAt: null,
      sessions: 0,
      risk: "low",
      device: "Invite pending",
      supportNotes: "Invited from tenant settings."
    };
    const saved = await this.identityRepository.saveTenantUser(user);
    this.employeeSettings.set(saved.id, {
      canOverride: roleKey !== "employee",
      channels: ["SDK", "Telegram"],
      chatLimit: roleKey === "admin" ? 20 : 8,
      groupId,
      roleKey,
      sensitiveData: roleKey !== "employee"
    });
    this.syncGroupMember(groupId, saved.id);

    return createEnvelope({
      service: SERVICE,
      operation: "inviteEmployee",
      traceId: identityTraceId(SERVICE, "inviteEmployee"),
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.employee.invite", tenantId, saved.id, "Employee invited from settings", now)),
        employee: this.toEmployee(saved)
      }
    });
  }

  async updateEmployee(employeeId: string, payload: EmployeeMutationPayload = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("updateEmployee", employeeId);
    }

    const current = this.getEmployeeSettings(user);
    const nextRoleKey = payload.roleKey === undefined ? current.roleKey : normalizeRoleKey(payload.roleKey);
    const nextGroupId = payload.groupId === undefined ? current.groupId : normalizeGroupId(payload.groupId, nextRoleKey);
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
      role: roleNameFromKey(next.roleKey),
      status: payload.status ?? user.status
    });
    this.employeeSettings.set(saved.id, next);
    this.syncGroupMember(next.groupId, saved.id);

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

  async resetEmployeePassword(employeeId: string, payload: { reason?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("resetEmployeePassword", employeeId);
    }

    const saved = await this.identityRepository.saveTenantUser({
      ...user,
      supportNotes: `${user.supportNotes ?? ""} Password reset sent. ${String(payload.reason ?? "").trim()}`.trim()
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
        }
      }
    });
  }

  async resetEmployeeMfa(employeeId: string, payload: { reason?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("resetEmployeeMfa", employeeId);
    }

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

  async deactivateEmployee(employeeId: string, payload: { reason?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const user = await this.identityRepository.findTenantUser(employeeId);
    if (!user) {
      return notFoundEnvelope("deactivateEmployee", employeeId);
    }

    if (this.getEmployeeSettings(user).roleKey === "admin") {
      const tenantUsers = await this.identityRepository.findTenantUsers(user.tenantId);
      const activeAdmins = tenantUsers.filter((candidate) => candidate.id !== user.id && candidate.status === "active" && this.getEmployeeSettings(candidate).roleKey === "admin");
      if (!activeAdmins.length) {
        return invalidEnvelope("deactivateEmployee", "last_admin_required", "At least one active administrator must remain in the tenant.", {
          employeeId,
          tenantId: user.tenantId
        });
      }
    }

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

  async fetchRoles(): Promise<BackendEnvelope<Record<string, unknown>>> {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchRoles",
      traceId: identityTraceId(SERVICE, "fetchRoles"),
      meta: apiMeta(),
      data: { roles: buildRoleReadModel() }
    });
  }

  async fetchGroups(): Promise<BackendEnvelope<Record<string, unknown>>> {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchGroups",
      traceId: identityTraceId(SERVICE, "fetchGroups"),
      meta: apiMeta(),
      data: { groups: this.listGroups() }
    });
  }

  async createGroup(payload: GroupMutationPayload = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return invalidEnvelope("createGroup", "group_name_required", "Group name is required.", {});
    }

    const group: EmployeeGroup = {
      channels: normalizeChannels(payload.channels ?? supportedChannels),
      id: `group-${slugify(name)}-${randomUUID().slice(0, 8)}`,
      memberIds: payload.memberIds ?? [],
      name,
      scope: String(payload.scope ?? "Tenant support").trim(),
      updatedAt: new Date().toISOString()
    };
    this.groups.set(group.id, group);

    return createEnvelope({
      service: SERVICE,
      operation: "createGroup",
      traceId: identityTraceId(SERVICE, "createGroup"),
      meta: apiMeta({ groupId: group.id }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.group.create", DEFAULT_TENANT_ID, group.id, "Employee group created")),
        group
      }
    });
  }

  async updateGroup(groupId: string, payload: GroupMutationPayload = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const group = this.groups.get(groupId);
    if (!group) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateGroup",
        traceId: identityTraceId(SERVICE, "updateGroup"),
        status: "not_found",
        meta: apiMeta({ groupId }),
        data: { groupId },
        error: { code: "group_not_found", message: `Group ${groupId} was not found.` }
      });
    }

    const updated: EmployeeGroup = {
      ...group,
      channels: payload.channels ? normalizeChannels(payload.channels) : group.channels,
      memberIds: payload.memberIds ?? group.memberIds,
      name: String(payload.name ?? group.name).trim() || group.name,
      scope: String(payload.scope ?? group.scope).trim() || group.scope,
      updatedAt: new Date().toISOString()
    };
    this.groups.set(groupId, updated);

    return createEnvelope({
      service: SERVICE,
      operation: "updateGroup",
      traceId: identityTraceId(SERVICE, "updateGroup"),
      meta: apiMeta({ groupId }),
      data: {
        auditEvent: this.persistAuditEvent(auditEvent("settings.group.update", DEFAULT_TENANT_ID, groupId, "Employee group updated")),
        group: updated
      }
    });
  }

  private toEmployee(user: IdentityTenantUser): Record<string, unknown> {
    const settings = this.getEmployeeSettings(user);
    const group = this.groups.get(settings.groupId);
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
      mfaStatus: user.mfa,
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
    const settings: EmployeeSettingsOverlay = {
      canOverride: roleKey !== "employee",
      channels: roleKey === "admin" ? supportedChannels : roleKey === "senior" ? ["SDK", "Telegram", "VK"] : ["SDK", "Telegram"],
      chatLimit: roleKey === "admin" ? 20 : roleKey === "senior" ? 14 : 8,
      groupId: normalizeGroupId(undefined, roleKey),
      roleKey,
      sensitiveData: roleKey !== "employee"
    };
    this.employeeSettings.set(user.id, settings);
    this.syncGroupMember(settings.groupId, user.id);
    return settings;
  }

  private listGroups(): EmployeeGroup[] {
    return Array.from(this.groups.values()).map((group) => ({
      ...group,
      channels: [...group.channels],
      memberIds: [...group.memberIds]
    }));
  }

  private syncGroupMember(groupId: string, employeeId: string): void {
    const group = this.groups.get(groupId);
    if (!group || group.memberIds.includes(employeeId)) {
      return;
    }

    this.groups.set(groupId, {
      ...group,
      memberIds: [...group.memberIds, employeeId],
      updatedAt: new Date().toISOString()
    });
  }

  private persistAuditEvent<TEvent extends Record<string, unknown>>(event: TEvent): TEvent {
    this.auditEvents.push({ ...event });
    return event;
  }
}

const defaultGroups: EmployeeGroup[] = [
  { channels: ["SDK", "Telegram"], id: "group-line-1", memberIds: [], name: "Line 1", scope: "First response", updatedAt: "2026-07-01T00:00:00.000Z" },
  { channels: ["Telegram", "MAX", "VK"], id: "group-vip", memberIds: [], name: "VIP support", scope: "High value clients", updatedAt: "2026-07-01T00:00:00.000Z" },
  { channels: supportedChannels, id: "group-admins", memberIds: [], name: "Administrators", scope: "Settings and audit", updatedAt: "2026-07-01T00:00:00.000Z" }
];

function buildRoleReadModel() {
  return permissionRoles.map((role) => ({
    key: role.key,
    name: roleNameFromKey(role.key),
    description: role.description,
    actions: role.actions,
    groupIds: role.groupIds
  }));
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

function normalizeTenantId(value: unknown): string {
  return String(value ?? DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
}

function normalizeRoleKey(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["admin", "administrator", "owner", "администратор"].includes(raw)) return "admin";
  if (["senior", "senior operator", "старший сотрудник", "lead"].includes(raw)) return "senior";
  return "employee";
}

function roleNameFromKey(roleKey: string): string {
  if (roleKey === "admin") return "Администратор";
  if (roleKey === "senior") return "Старший сотрудник";
  return "Сотрудник";
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
  if (String(user.supportNotes ?? "").includes("Password reset sent")) return "reset_sent";
  return "active";
}

function buildExceptions(user: IdentityTenantUser, settings: EmployeeSettingsOverlay): string[] {
  const exceptions: string[] = [];
  if (user.mfa !== "enabled") exceptions.push("MFA requires attention");
  if (!settings.sensitiveData) exceptions.push("Sensitive data masked");
  if (settings.canOverride) exceptions.push("Queue override allowed");
  return exceptions;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
}
