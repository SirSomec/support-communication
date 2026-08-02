import { createRequestTraceId, runWithTraceId, writeStructuredLog } from "@support-communication/observability";
export function requestTraceMiddleware(request, response, next) {
    const headerValue = request.headers["x-request-id"];
    const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const traceId = createRequestTraceId("api-gateway", "http", requestId);
    request.traceId = traceId;
    response.setHeader("X-Request-Id", traceId);
    writeStructuredLog("info", "HTTP request received", {
        method: request.method,
        operation: "http.request",
        path: request.originalUrl,
        service: "api-gateway",
        traceId
    });
    runWithTraceId(traceId, next);
}
//# sourceMappingURL=trace-id.middleware.js.map