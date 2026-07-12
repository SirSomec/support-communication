import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_ALERT_DEFINITIONS,
  evaluateBotAlerts,
  summarizeBotMetricsForAlerts
} from "../apps/api-gateway/src/automation/bot-alert-catalog.ts";

describe("BAI-701 bot alerts and runbook catalog", () => {
  it("defines owner and recovery steps for every alert kind", () => {
    for (const definition of Object.values(BOT_ALERT_DEFINITIONS)) {
      assert.ok(definition.owner.trim().length > 0);
      assert.ok(definition.recoverySteps.length >= 3);
      assert.ok(definition.title.trim().length > 0);
    }
  });

  it("evaluates provider outage, quota spike, unsafe denial and high fallback", () => {
    const alerts = evaluateBotAlerts({
      aiErrorCount: 5,
      aiOkCount: 1,
      deliveryFailureCount: 0,
      handoffCount: 8,
      publishFailureCount: 0,
      quotaErrorCount: 3,
      sourceErrorCount: 0,
      unsafeDenialCount: 2
    });

    const ids = alerts.map((item) => item.id).sort();
    assert.deepEqual(ids, ["high_fallback_rate", "provider_outage", "quota_spike", "unsafe_source_denial"].sort());
    assert.equal(alerts.find((item) => item.id === "provider_outage")?.definition.owner, "service-admin");
  });

  it("summarizes metric snapshots into alert inputs without requiring PII labels", () => {
    const summary = summarizeBotMetricsForAlerts([
      {
        name: "bot_ai_requests_total",
        samples: [
          { labels: { error_code: "none", status: "ok", tenant_id: "tenant-volga" }, value: 4 },
          { labels: { error_code: "bot_ai_quota_exhausted", status: "error", tenant_id: "tenant-volga" }, value: 2 }
        ],
        type: "counter"
      },
      {
        name: "bot_source_errors_total",
        samples: [
          { labels: { failure_code: "url_source_ssrf_denied", tenant_id: "tenant-volga" }, value: 1 }
        ],
        type: "counter"
      },
      {
        name: "bot_handoff_total",
        samples: [{ labels: { reason: "ai_unavailable", tenant_id: "tenant-volga" }, value: 6 }],
        type: "counter"
      }
    ]);

    assert.equal(summary.aiOkCount, 4);
    assert.equal(summary.aiErrorCount, 2);
    assert.equal(summary.quotaErrorCount, 2);
    assert.equal(summary.unsafeDenialCount, 1);
    assert.equal(summary.handoffCount, 6);
  });
});
