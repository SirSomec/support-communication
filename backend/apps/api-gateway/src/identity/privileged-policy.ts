import { IdentityRepository } from "./identity.repository.js";

import { apiMeta, identityTraceId } from "./identity-meta.js";

import { PermissionService } from "./permission.service.js";

import { type ServiceAdminRequest } from "./service-admin-auth.js";

import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";

import { makeAuditId } from "./backend-ids.js";



const SERVICE = "permissionService";



export interface ServiceAdminPolicyInput {

  action: string;

  identityRepository?: IdentityRepository;

  request: ServiceAdminRequest;

  resource: string;

  tenantId?: string;

}


export async function authorizeServiceAdminPolicy({

  action,

  identityRepository = IdentityRepository.default(),

  request,

  resource,

  tenantId

}: ServiceAdminPolicyInput): Promise<BackendEnvelope<Record<string, unknown>> | null> {

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



  return permission.status === "ok" ? null : permission as BackendEnvelope<Record<string, unknown>>;

}



function isKnownPrivilegedAction(action: string, privilegedActions: string[]): boolean {

  return Boolean(action) && privilegedActions.includes(action);

}



function resolvePermissionRoleKey(role: string | undefined, permissionRoles: import("./identity.repository.js").IdentityPermissionRole[]): string | null {

  const value = String(role ?? "").trim().toLowerCase();

  const permissionRole = permissionRoles.find((item) =>

    item.key.toLowerCase() === value ||

    item.aliases.some((alias) => alias.toLowerCase() === value)

  );

  return permissionRole?.key ?? null;

}
