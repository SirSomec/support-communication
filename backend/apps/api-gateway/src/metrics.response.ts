import { metricsRegistry } from "@support-communication/observability";

export function renderRuntimeMetrics(): string {
  return metricsRegistry().renderPrometheus();
}
