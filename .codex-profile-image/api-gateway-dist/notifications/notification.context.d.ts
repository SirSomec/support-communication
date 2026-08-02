import type { ServiceAdminRequest } from "../identity/service-admin-auth.js";
import type { TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import type { NotificationRequestContext } from "./notification.service.js";
export declare function resolveNotificationRequestContext(request: TenantOperatorRequest & ServiceAdminRequest): NotificationRequestContext;
