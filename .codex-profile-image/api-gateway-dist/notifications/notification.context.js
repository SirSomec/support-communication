export function resolveNotificationRequestContext(request) {
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
//# sourceMappingURL=notification.context.js.map