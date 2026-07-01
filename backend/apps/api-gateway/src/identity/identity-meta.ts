import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";

export function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

export function identityTraceId(service: string, operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(service, operation);
}
