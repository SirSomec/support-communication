import { SetMetadata } from "@nestjs/common";
export const SERVICE_ADMIN_ACTION_KEY = "serviceAdminAction";
export const RequireServiceAdminAction = (action) => SetMetadata(SERVICE_ADMIN_ACTION_KEY, action);
export function isServiceAdminSessionId(sessionId) {
    return typeof sessionId === "string" && sessionId.length > 0 && !sessionId.startsWith("top-session_");
}
//# sourceMappingURL=service-admin-auth.js.map