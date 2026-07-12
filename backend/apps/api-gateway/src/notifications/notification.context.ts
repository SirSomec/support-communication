import type { ServiceAdminRequest } from "../identity/service-admin-auth.js";
import type { TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import type { NotificationRequestContext } from "./notification.service.js";

export function resolveNotificationRequestContext(
  request: TenantOperatorRequest & ServiceAdminRequest
): NotificationRequestContext {
  if (request.tenantOperatorContext) {
    return {
      tenantId: request.tenantOperatorContext.tenantId,
      userId: request.tenantOperatorContext.userId
    };
  }

  return request.serviceAdminContext?.currentTenantId
    ? {
        tenantId: request.serviceAdminContext.currentTenantId,
        userId: request.serviceAdminContext.actor.id
      }
    : {};
}
