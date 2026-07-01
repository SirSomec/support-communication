import { createRequestTraceId, runWithTraceId, writeStructuredLog } from "@support-communication/observability";

interface TraceableRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  traceId?: string;
}

interface TraceableResponse {
  setHeader(name: string, value: string): void;
}

export function requestTraceMiddleware(request: TraceableRequest, response: TraceableResponse, next: () => void): void {
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
