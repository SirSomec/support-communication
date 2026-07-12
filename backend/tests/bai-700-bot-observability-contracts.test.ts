import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  metricsRegistry,
  resetMetricsRegistry,
  sanitizeMetricLabel
} from "../packages/observability/src/index.ts";
import {
  recordBotAiRequest,
  recordBotHandoff,
  recordBotPublishFailure,
  recordBotRetrieval,
  recordBotTriggerMatch
} from "../apps/api-gateway/src/automation/bot-observability.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";

describe("BAI-700 bot observability", () => {
  afterEach(() => {
    resetMetricsRegistry();
    AutomationRepository.clearDefault();
  });

  it("records trigger, retrieval, AI, handoff and publish metrics with sanitized labels", () => {
    recordBotTriggerMatch({ channel: "SDK", result: "matched", scenarioId: "bot-ops", tenantId: "tenant-volga" });
    recordBotTriggerMatch({ channel: "SDK", result: "no_match", tenantId: "tenant-volga" });
    recordBotRetrieval({ cache: "hit", passageCount: 2, scenarioId: "bot-ops", tenantId: "tenant-volga", topScore: 0.8 });
    recordBotAiRequest({
      connectionId: "conn-1",
      latencyMs: 120,
      scenarioId: "bot-ops",
      status: "ok",
      tenantId: "tenant-volga",
      tokens: 40
    });
    recordBotAiRequest({
      errorCode: "bot_ai_quota_exhausted",
      latencyMs: 5,
      scenarioId: "bot-ops",
      status: "error",
      tenantId: "tenant-volga"
    });
    recordBotHandoff({ reason: "bot_ai_quota_exhausted", scenarioId: "bot-ops", tenantId: "tenant-volga" });
    recordBotPublishFailure({ errorCode: "trigger_conflict", scenarioId: "bot-ops", tenantId: "tenant-volga" });

    const snapshot = Object.fromEntries(metricsRegistry().snapshot().map((metric) => [metric.name, metric]));
    assert.equal((snapshot.bot_trigger_match_total as { samples: Array<{ value: number }> }).samples.reduce((sum, sample) => sum + sample.value, 0), 2);
    assert.equal((snapshot.bot_retrieval_requests_total as { samples: Array<{ value: number }> }).samples[0]?.value, 1);
    assert.equal((snapshot.bot_ai_requests_total as { samples: Array<{ value: number }> }).samples.reduce((sum, sample) => sum + sample.value, 0), 2);
    assert.equal((snapshot.bot_handoff_total as { samples: Array<{ value: number }> }).samples[0]?.value, 1);
    assert.equal((snapshot.bot_publish_failures_total as { samples: Array<{ value: number }> }).samples[0]?.value, 1);

    const prometheus = metricsRegistry().renderPrometheus();
    assert.match(prometheus, /bot_trigger_match_total\{/);
    assert.doesNotMatch(prometheus, /user@example.com|Bearer sk-|conversation_id=/);
    assert.equal(sanitizeMetricLabel("user@example.com"), "redacted");
    assert.equal(sanitizeMetricLabel("secret-token-value-with-enough-length-1234567890"), "redacted");
  });

  it("emits publish failure metrics from AutomationService without PII", async () => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    const automation = new AutomationService();
    const failed = await automation.publishBotScenario({
      channels: ["SDK"],
      flowEdges: [],
      flowNodes: [{ id: "ai", type: "ai_reply", title: "AI" }],
      id: "bot-obs-fail",
      name: "Obs fail",
      sourceBindings: []
    }, { tenantId: "tenant-volga" });

    assert.notEqual(failed.status, "ok");
    const publishFailures = metricsRegistry().snapshot().find((metric) => metric.name === "bot_publish_failures_total");
    assert.ok(publishFailures);
    assert.ok((publishFailures as { samples: Array<{ labels: Record<string, string>; value: number }> }).samples.some((sample) =>
      sample.labels.error_code === "bot_scenario_not_found" || sample.labels.error_code === "bot_publish_prerequisites_invalid" || sample.labels.error_code === "bot_flow_invalid"
    ));
    assert.doesNotMatch(metricsRegistry().renderPrometheus(), /Пришлите номер|password|sk_/i);
  });
});
