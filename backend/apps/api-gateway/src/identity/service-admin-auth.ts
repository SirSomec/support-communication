import { SetMetadata } from "@nestjs/common";

export const SERVICE_ADMIN_ACTION_KEY = "serviceAdminAction";

export interface ServiceAdminActor {
  id: string;
  name: string;
}

export interface ServiceAdminContext {
  actor: ServiceAdminActor;
  currentTenantId?: string;
  permissions: string[];
  roles?: string[];
  sessionId?: string;
}

export interface ServiceAdminRequest {
  headers: Record<string, string | string[] | undefined>;
  serviceAdminContext?: ServiceAdminContext;
}

export const RequireServiceAdminAction = (action: string) => SetMetadata(SERVICE_ADMIN_ACTION_KEY, action);
