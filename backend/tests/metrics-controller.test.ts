import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { metricsRegistry, resetMetricsRegistry } from "../packages/observability/src/index.ts";
import { renderRuntimeMetrics } from "../apps/api-gateway/src/metrics.response.ts";

describe("metrics response", () => {
  it("exports the in-process registry in Prometheus format", () => {
    resetMetricsRegistry();
    metricsRegistry().counter("runtime_probe_total", "Runtime probe count").inc({ service: "api-gateway" });

    const response = renderRuntimeMetrics();

    assert.match(response, /# HELP runtime_probe_total Runtime probe count/);
    assert.match(response, /runtime_probe_total\{service="api-gateway"\} 1/);
  });
});
