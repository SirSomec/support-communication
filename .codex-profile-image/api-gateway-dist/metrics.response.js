import { metricsRegistry } from "@support-communication/observability";
export function renderRuntimeMetrics() {
    return metricsRegistry().renderPrometheus();
}
//# sourceMappingURL=metrics.response.js.map