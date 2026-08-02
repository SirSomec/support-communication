import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
export function apiMeta(extra = {}) {
    return {
        source: "api",
        apiVersion: "v1",
        ...extra
    };
}
export function identityTraceId(service, operation) {
    return getCurrentTraceId() ?? createRequestTraceId(service, operation);
}
//# sourceMappingURL=identity-meta.js.map