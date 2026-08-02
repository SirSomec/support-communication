import { IdentityRepository } from "./identity.repository.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { PermissionService } from "./permission.service.js";
import { createEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
const SERVICE = "permissionService";
export async function authorizeServiceAdminPolicy({ action, identityRepository = IdentityRepository.default(), request, resource, tenantId }) {
    const privilegedActions = await identityRepository.listPrivilegedServiceAdminActions();
    const permissionRoles = await identityRepository.listPermissionRoles();
    const normalizedAction = String(action ?? "").trim();
    const normalizedResource = String(resource ?? "").trim();
    if (!isKnownPrivilegedAction(normalizedAction, privilegedActions)) {
        const activePolicy = await identityRepository.getActiveRbacPolicyVersion();
        const roleKey = resolvePermissionRoleKey(request.serviceAdminContext?.roles?.[0], permissionRoles);
        await identityRepository.recordPermissionDenialEvent({
            action: normalizedAction,
            actorId: request.serviceAdminContext?.actor.id ?? null,
            at: new Date().toISOString(),
            id: makeAuditId("rbac_denial"),
            immutable: true,
            policyVersionId: activePolicy?.id ?? null,
            reason: "Privileged service-admin action is not recognized by the policy resolver.",
            resource: normalizedResource,
            roleKey,
            tenantId: tenantId ?? null,
            traceId: identityTraceId(SERVICE, "unknownPrivilegedAction")
        });
        return createEnvelope({
            service: SERVICE,
            operation: "authorizeServiceAdminPolicy",
            traceId: identityTraceId(SERVICE, "authorizeServiceAdminPolicy"),
            status: "denied",
            meta: apiMeta({ tenantId }),
            data: {
                action: normalizedAction,
                allowed: false,
                resource: normalizedResource,
                role: roleKey ?? "unknown",
                serverValidated: true,
                tenantId
            },
            error: {
                code: "service_admin_action_unrecognized",
                message: `Privileged service-admin action ${normalizedAction || "(empty)"} is not recognized.`
            }
        });
    }
    const permission = await new PermissionService(identityRepository).validatePermission({
        action: normalizedAction,
        actorId: request.serviceAdminContext?.actor.id ?? null,
        actorRole: request.serviceAdminContext?.roles?.[0],
        resource: normalizedResource,
        tenantId
    });
    return permission.status === "ok" ? null : permission;
}
function isKnownPrivilegedAction(action, privilegedActions) {
    return Boolean(action) && privilegedActions.includes(action);
}
function resolvePermissionRoleKey(role, permissionRoles) {
    const value = String(role ?? "").trim().toLowerCase();
    const permissionRole = permissionRoles.find((item) => item.key.toLowerCase() === value ||
        item.aliases.some((alias) => alias.toLowerCase() === value));
    return permissionRole?.key ?? null;
}
//# sourceMappingURL=privileged-policy.js.map