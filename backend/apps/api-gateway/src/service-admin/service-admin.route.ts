import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import { authorizeServiceAdminPolicy } from "../identity/privileged-policy.js";
import type { ServiceAdminActor, ServiceAdminRequest } from "../identity/service-admin-auth.js";
import type { ServiceAdminService } from "./service-admin.service.js";

type TenantBoundServiceAdminPayload = {
  actor?: ServiceAdminActor;
  tenantId?: string;
};

function resolveTenantBoundId(
  payload: TenantBoundServiceAdminPayload,
  request: ServiceAdminRequest
): string {
  return String(payload.tenantId ?? "").trim() || String(request.serviceAdminContext?.currentTenantId ?? "").trim();
}

export function bindServiceAdminTenantContext<TPayload extends TenantBoundServiceAdminPayload>(
  payload: TPayload,
  request: ServiceAdminRequest
): TPayload {
  const tenantId = resolveTenantBoundId(payload, request);
  return {
    ...payload,
    actor: request.serviceAdminContext?.actor,
    ...(request.serviceAdminContext ? { tenantId } : {})
  };
}

export function startServiceAdminImpersonationFromRoute<TPayload extends TenantBoundServiceAdminPayload>(
  serviceAdminService: ServiceAdminService,
  payload: TPayload,
  request: ServiceAdminRequest,
  identityRepository = IdentityRepository.default()
) {
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

export function requestServiceAdminBreakGlassApprovalFromRoute<TPayload extends TenantBoundServiceAdminPayload>(
  serviceAdminService: ServiceAdminService,
  payload: TPayload,
  request: ServiceAdminRequest,
  identityRepository = IdentityRepository.default()
) {
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

function denyMissingTenantScope<TPayload extends TenantBoundServiceAdminPayload>(
  operation: string,
  payload: TPayload,
  request: ServiceAdminRequest
): BackendEnvelope<Record<string, unknown>> | null {
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
