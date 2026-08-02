import { createEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import { authorizeServiceAdminPolicy } from "../identity/privileged-policy.js";
function resolveTenantBoundId(payload, request) {
    return String(payload.tenantId ?? "").trim() || String(request.serviceAdminContext?.currentTenantId ?? "").trim();
}
export function bindServiceAdminTenantContext(payload, request) {
    const tenantId = resolveTenantBoundId(payload, request);
    return {
        ...payload,
        actor: request.serviceAdminContext?.actor,
        ...(request.serviceAdminContext ? { tenantId } : {})
    };
}
export function startServiceAdminImpersonationFromRoute(serviceAdminService, payload, request, identityRepository = IdentityRepository.default()) {
    const denied = denyMissingTenantScope("startImpersonation", payload, request);
    if (denied) {
        return denied;
    }
    const tenantId = resolveTenantBoundId(payload, request);
    return authorizeServiceAdminPolicy({
        action: "impersonation.start",
        identityRepository,
        request,
        resource: "impersonation",
        tenantId
    }).then((policyDenied) => {
        if (policyDenied) {
            return policyDenied;
        }
        return serviceAdminService.startImpersonation(bindServiceAdminTenantContext(payload, request));
    });
}
export function requestServiceAdminBreakGlassApprovalFromRoute(serviceAdminService, payload, request, identityRepository = IdentityRepository.default()) {
    const denied = denyMissingTenantScope("requestBreakGlassApproval", payload, request);
    if (denied) {
        return denied;
    }
    const tenantId = resolveTenantBoundId(payload, request);
    return authorizeServiceAdminPolicy({
        action: "break-glass.request",
        identityRepository,
        request,
        resource: "break-glass",
        tenantId
    }).then((policyDenied) => {
        if (policyDenied) {
            return policyDenied;
        }
        return serviceAdminService.requestBreakGlassApproval(bindServiceAdminTenantContext(payload, request));
    });
}
function denyMissingTenantScope(operation, payload, request) {
    if (!request.serviceAdminContext) {
        return null;
    }
    if (resolveTenantBoundId(payload, request)) {
        return null;
    }
    return createEnvelope({
        service: "supportAdminService",
        operation,
        status: "invalid",
        meta: {
            source: "api",
            apiVersion: "v1"
        },
        data: {
            actorId: request.serviceAdminContext.actor.id,
            rejectedTenantId: payload.tenantId ?? null,
            sessionId: request.serviceAdminContext.sessionId ?? null
        },
        error: {
            code: "service_admin_tenant_scope_required",
            message: "Service-admin tenant scope is required for tenant-bound impersonation routes."
        }
    });
}
//# sourceMappingURL=service-admin.route.js.map