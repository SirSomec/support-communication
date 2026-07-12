import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
import { IdentityRepository, type IdentityPermissionRole, type IdentityRbacRoleGrant } from "./identity.repository.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";

const SERVICE = "permissionService";
type ResolvedRole = string | "unknown";

const ACTION_TO_SECTION: Record<string, string> = {
  "dialogs.read": "dialogs",
  "dialogs.manage": "dialogs",
  "panel.read": "panel",
  "routing.read": "panel",
  "routing.redistribute": "panel",
  "clients.read": "clients",
  "clients.merge": "clients",
  "templates.read": "templates",
  "templates.write": "templates",
  "visitors.read": "visitors",
  "automation.proactive.read": "visitors",
  "reports.read": "reports",
  "reports.export": "reports",
  "quality.read": "quality",
  "quality.scoring-audits.write": "quality",
  "quality.ratings.write": "quality",
  "quality.manual-reviews.write": "quality",
  "knowledge.read": "quality",
  "knowledge.sources.read": "quality",
  "knowledge.sources.write": "quality",
  "automation.read": "automation",
  "automation.scenarios.read": "automation",
  "automation.scenarios.write": "automation",
  "automation.scenarios.archive": "automation",
  "automation.scenarios.restore": "automation",
  "ai.connections.manage": "settings",
  "audit.read": "audit",
  "settings.read": "settings",
  "settings.manage": "settings",
  "settings.write": "settings",
  "settings.integrations.read": "settings",
  "settings.integrations.write": "settings",
  "ai.connections.manage": "settings"
};

const ALL_SECTIONS = [
  "dialogs",
  "panel",
  "clients",
  "templates",
  "visitors",
  "reports",
  "quality",
  "automation",
  "audit",
  "settings"
];

interface PermissionPayload {
  action: string;
  actorId?: string | null;
  actorRole?: string;
  resource: string;
  roleMode?: string;
  tenantId?: string;
}

export interface PermissionDecision {
  allowed: boolean;
  action: string;
  resource: string;
  role: ResolvedRole;
  grantId?: string;
  policyVersionId?: string;
  serverValidated: true;
  tenantId?: string;
  groupIds: string[];
  auditEvent: {
    id: string;
    action: string;
    resource: string;
    role: ResolvedRole;
    result: "allowed" | "denied";
    immutable: true;
  };
}

export interface PermissionModel {
  roles: Array<{
    actions: string[];
    aliases: string[];
    key: string;
    sections: string[];
  }>;
  actions: string[];
  actionSectionMap: Record<string, string>;
  sections: string[];
  serverValidation: true;
  denialAudit: true;
  groups: string[];
}

export class PermissionService {
  constructor(private readonly identityRepository = IdentityRepository.default()) {}

  async validatePermission({ action, actorId = null, actorRole, resource, roleMode, tenantId }: PermissionPayload): Promise<BackendEnvelope<PermissionDecision | Record<string, unknown>>> {
    if (!String(action ?? "").trim() || !String(resource ?? "").trim()) {
      return createEnvelope({
        service: SERVICE,
        operation: "validatePermission",
        traceId: identityTraceId(SERVICE, "validatePermission"),
        status: "invalid",
        meta: apiMeta(),
        data: { action, resource },
        error: { code: "permission_payload_required", message: "action and resource are required." }
      });
    }

    const permissionRoles = await this.identityRepository.listPermissionRoles();
    const permissionRole = resolvePermissionRole(actorRole ?? roleMode, permissionRoles);
    const role = permissionRole?.key ?? "unknown";
    const auditRoleKey = permissionRole?.key ?? null;
    const activePolicy = await this.identityRepository.getActiveRbacPolicyVersion();
    const grants = activePolicy && permissionRole
      ? await this.identityRepository.listRbacRoleGrants({ policyVersionId: activePolicy.id, roleKey: permissionRole.key })
      : [];
    const matchedGrant = resolveGrant({ action, grants, resource, tenantId });
    const allowed = Boolean(permissionRole && activePolicy && matchedGrant?.effect === "allow");
    const auditEvent = {
      id: makeAuditId("perm"),
      action,
      resource,
      role,
      result: allowed ? "allowed" as const : "denied" as const,
      immutable: true as const
    };

    if (!allowed) {
      await this.identityRepository.recordPermissionDenialEvent({
        action,
        actorId,
        at: new Date().toISOString(),
        id: makeAuditId("rbac_denial"),
        immutable: true,
        policyVersionId: activePolicy?.id ?? null,
        reason: !activePolicy
          ? "No active RBAC policy version was available."
          : role === "unknown"
            ? "Actor role is not recognized by the permission model."
            : "No tenant-scoped grant matched.",
        resource,
        roleKey: auditRoleKey,
        tenantId: tenantId ?? null,
        traceId: identityTraceId(SERVICE, "permissionDenial")
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "validatePermission",
      traceId: identityTraceId(SERVICE, "validatePermission"),
      status: allowed ? "ok" : "denied",
      meta: apiMeta(),
      error: allowed
        ? null
        : role === "unknown"
          ? { code: "role_unrecognized", message: "Actor role is not recognized by the permission model." }
          : !activePolicy
            ? { code: "rbac_policy_unavailable", message: "No active RBAC policy version is available." }
          : { code: "permission_denied", message: `${role} cannot perform ${action}` },
      data: {
        allowed,
        action,
        resource,
        role,
        grantId: matchedGrant?.id,
        policyVersionId: activePolicy?.id,
        serverValidated: true,
        tenantId,
        groupIds: permissionRole?.groupIds ?? [],
        auditEvent
      }
    });
  }

  async fetchPermissionModel(): Promise<BackendEnvelope<PermissionModel>> {
    const permissionRoles = await this.identityRepository.listPermissionRoles();

    return createEnvelope({
      service: SERVICE,
      operation: "fetchPermissionModel",
      traceId: identityTraceId(SERVICE, "fetchPermissionModel"),
      partial: true,
      meta: apiMeta(),
      data: {
        roles: permissionRoles.map((role) => ({
          key: role.key,
          aliases: role.aliases,
          actions: role.actions,
          sections: resolveSectionsForRole(role)
        })),
        actions: Array.from(new Set(permissionRoles.flatMap((role) => role.actions))),
        actionSectionMap: ACTION_TO_SECTION,
        sections: ALL_SECTIONS,
        serverValidation: true,
        denialAudit: true,
        groups: Array.from(new Set(permissionRoles.flatMap((role) => role.groupIds)))
      }
    });
  }
}

function resolveSectionsForRole(role: IdentityPermissionRole): string[] {
  if (role.actions.includes("*")) {
    return ALL_SECTIONS;
  }

  return [...new Set(
    role.actions
      .map((action) => ACTION_TO_SECTION[action])
      .filter(Boolean)
  )];
}

function resolvePermissionRole(roleMode: string | undefined, permissionRoles: IdentityPermissionRole[]): IdentityPermissionRole | undefined {
  const value = String(roleMode ?? "").trim().toLowerCase();
  const normalizedValue = value === "senior operator" ? "senior" : value;
  return permissionRoles.find((role) =>
    role.key.toLowerCase() === normalizedValue ||
    role.aliases.some((alias) => alias.toLowerCase() === normalizedValue)
  );
}

function resolveGrant({
  action,
  grants,
  resource,
  tenantId
}: {
  action: string;
  grants: IdentityRbacRoleGrant[];
  resource: string;
  tenantId?: string;
}): IdentityRbacRoleGrant | undefined {
  const matching = grants.filter((grant) => (
    (grant.action === "*" || grant.action === action)
    && (grant.resource === "*" || grant.resource === resource)
    && (grant.tenantId === null || grant.tenantId === (tenantId ?? null))
  ));
  return matching.find((grant) => grant.effect === "deny") ?? matching.find((grant) => grant.effect === "allow");
}
