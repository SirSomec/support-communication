import {
  METRIC_BUCKETS,
  metricsRegistry,
  sanitizeMetricLabel,
  type MetricLabels,
  type MetricsRegistry
} from "@support-communication/observability";

/** Bot/AI automation metrics with bounded labels (tenant/scenario/reason codes only). */
export function botMetrics(registry: MetricsRegistry = metricsRegistry()): {
  aiLatencyMs: { observe(labels?: MetricLabels, value?: number): void };
  aiRequests: { inc(labels?: MetricLabels, value?: number): void };
  aiTokens: { inc(labels?: MetricLabels, value?: number): void };
  deliveryFailures: { inc(labels?: MetricLabels, value?: number): void };
  feedback: { inc(labels?: MetricLabels, value?: number): void };
  handoffs: { inc(labels?: MetricLabels, value?: number): void };
  publishFailures: { inc(labels?: MetricLabels, value?: number): void };
  retrievalPassages: { observe(labels?: MetricLabels, value?: number): void };
  retrievalRequests: { inc(labels?: MetricLabels, value?: number): void };
  retrievalTopScore: { observe(labels?: MetricLabels, value?: number): void };
  sourceErrors: { inc(labels?: MetricLabels, value?: number): void };
  triggerMatches: { inc(labels?: MetricLabels, value?: number): void };
} {
  return {
    aiLatencyMs: registry.histogram("bot_ai_latency_ms", "AI provider latency in milliseconds", METRIC_BUCKETS.latencyMs),
    aiRequests: registry.counter("bot_ai_requests_total", "AI completion attempts"),
    aiTokens: registry.counter("bot_ai_tokens_total", "AI tokens recorded after successful completion"),
    deliveryFailures: registry.counter("bot_delivery_failures_total", "Outbound bot delivery or handoff failures"),
    feedback: registry.counter("bot_ai_feedback_total", "Operator/admin bot AI feedback outcomes"),
    handoffs: registry.counter("bot_handoff_total", "Bot handoffs to operators"),
    publishFailures: registry.counter("bot_publish_failures_total", "Bot scenario publish failures"),
    retrievalPassages: registry.histogram("bot_retrieval_passages", "Passages returned by retrieval", METRIC_BUCKETS.counts),
    retrievalRequests: registry.counter("bot_retrieval_requests_total", "Knowledge retrieval requests"),
    retrievalTopScore: registry.histogram("bot_retrieval_top_score", "Top retrieval passage score", METRIC_BUCKETS.scores),
    sourceErrors: registry.counter("bot_source_errors_total", "Knowledge source failures"),
    triggerMatches: registry.counter("bot_trigger_match_total", "Inbound trigger match outcomes")
  };
}

export function recordBotTriggerMatch(input: {
  channel?: string;
  result: "matched" | "no_match";
  scenarioId?: string;
  tenantId: string;
}): void {
  botMetrics().triggerMatches.inc({
    channel: sanitizeMetricLabel(input.channel ?? "unknown"),
    result: input.result,
    scenario_id: sanitizeMetricLabel(input.scenarioId ?? "none"),
    tenant_id: sanitizeMetricLabel(input.tenantId)
  });
}

export function recordBotRetrieval(input: {
  cache: "hit" | "miss";
  /** BAI-875: which strategy produced the passages (llm_fallback = llm failed, lexical answered). */
  mode?: "lexical" | "llm" | "llm_fallback";
  passageCount: number;
  scenarioId?: string;
  tenantId: string;
  topScore?: number;
}): void {
  const labels = baseLabels(input);
  const metrics = botMetrics();
  metrics.retrievalRequests.inc({ ...labels, cache: input.cache, mode: input.mode ?? "lexical" });
  metrics.retrievalPassages.observe(labels, input.passageCount);
  if (typeof input.topScore === "number" && Number.isFinite(input.topScore)) {
    metrics.retrievalTopScore.observe(labels, Math.max(0, Math.min(1, input.topScore)));
  }
}

export function recordBotSourceError(input: { failureCode: string; tenantId: string }): void {
  botMetrics().sourceErrors.inc({
    failure_code: sanitizeMetricLabel(input.failureCode),
    tenant_id: sanitizeMetricLabel(input.tenantId)
  });
}

export function recordBotAiRequest(input: {
  connectionId?: string;
  errorCode?: string;
  latencyMs?: number;
  scenarioId?: string;
  status: "ok" | "error";
  tenantId: string;
  tokens?: number;
}): void {
  const metrics = botMetrics();
  const labels: MetricLabels = {
    ...baseLabels(input),
    error_code: sanitizeMetricLabel(input.errorCode ?? "none"),
    status: input.status
  };
  metrics.aiRequests.inc(labels);
  if (typeof input.latencyMs === "number") metrics.aiLatencyMs.observe(baseLabels(input), Math.max(0, input.latencyMs));
  if (input.status === "ok" && typeof input.tokens === "number") {
    metrics.aiTokens.inc({
      connection_id: sanitizeMetricLabel(input.connectionId ?? "unknown"),
      tenant_id: sanitizeMetricLabel(input.tenantId)
    }, Math.max(0, Math.floor(input.tokens)));
  }
}

export function recordBotHandoff(input: { reason: string; scenarioId?: string; tenantId: string }): void {
  botMetrics().handoffs.inc({
    ...baseLabels(input),
    reason: sanitizeMetricLabel(input.reason)
  });
}

export function recordBotAiFeedback(input: {
  outcome: string;
  scenarioId?: string;
  tenantId: string;
}): void {
  botMetrics().feedback.inc({
    ...baseLabels(input),
    outcome: sanitizeMetricLabel(input.outcome)
  });
}

export function recordBotPublishFailure(input: { errorCode: string; scenarioId?: string; tenantId: string }): void {
  botMetrics().publishFailures.inc({
    ...baseLabels(input),
    error_code: sanitizeMetricLabel(input.errorCode)
  });
}

export function recordBotDeliveryFailure(input: {
  kind: "handoff" | "message";
  scenarioId?: string;
  tenantId: string;
}): void {
  botMetrics().deliveryFailures.inc({
    ...baseLabels(input),
    kind: input.kind
  });
}

function baseLabels(input: { scenarioId?: string; tenantId: string }): MetricLabels {
  return {
    scenario_id: sanitizeMetricLabel(input.scenarioId ?? "none"),
    tenant_id: sanitizeMetricLabel(input.tenantId)
  };
}
