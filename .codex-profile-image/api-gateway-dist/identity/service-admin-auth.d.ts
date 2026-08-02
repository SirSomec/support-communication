export declare const SERVICE_ADMIN_ACTION_KEY = "serviceAdminAction";
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
export declare const RequireServiceAdminAction: (action: string) => import("@nestjs/common").CustomDecorator<string>;
export declare function isServiceAdminSessionId(sessionId: string | null | undefined): boolean;
