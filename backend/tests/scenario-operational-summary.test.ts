import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScenarioOperationalSummaries,
  buildTenantAiUsageSummary,
  canViewAiUsage,
  estimateAiCostBucket
} from "../apps/api-gateway/src/automation/scenario-operational-summary.ts";

describe("scenario operational summary", () => {
  it("aggregates status, failures, publishes, handoffs, citations and fallback reason", () => {
    const summaries = buildScenarioOperationalSummaries({
      aiUsage: null,
      publishEvents: [
        {
          action: "bot.publish",
          actor: "admin-1",
          auditId: "aud-1",
          createdAt: "2026-07-12T12:00:00.000Z",
          idempotencyKey: "k1",
          immutable: true,
          runtimeVersion: "v1",
          scenarioId: "bot-ops",
          tenantId: "tenant-volga",
          versionId: "v1"
        }
      ],
      runtimeInstances: [
        {
          attempts: 1,
          context: { lastAiFailure: "bot_ai_quota_exhausted" },
          conversationId: "conv-1",
          createdAt: "2026-07-12T12:01:00.000Z",
          currentNodeId: "ai",
          id: "rt-1",
          lastError: null,
          nextAttemptAt: null,
          scenarioId: "bot-ops",
          status: "handoff",
          tenantId: "tenant-volga",
          updatedAt: "2026-07-12T12:05:00.000Z",
          versionId: "v1"
        }
      ],
      runtimeSteps: [
        {
          conversationId: "conv-1",
          createdAt: "2026-07-12T12:04:00.000Z",
          error: null,
          handoffSummary: { queue: "Л1", reason: "ai_unavailable" },
          id: "step-1",
          inputEvent: { scenarioId: "bot-ops" },
          inputEventId: "evt-1",
          lifecycleEvent: null,
          nodeId: "ai",
          nodeType: "ai_reply",
          outcome: "ai_handoff_requested",
          runtimeId: "rt-1",
          sideEffects: [
            {
              kind: "message_delivery",
              descriptor: {
                payload: {
                  citations: [{ sourceId: "src-1", title: "Оплата", version: 3 }]
                }
              }
            }
          ],
          tenantId: "tenant-volga",
          webhookResponse: null
        },
        {
          conversationId: "conv-2",
          createdAt: "2026-07-12T12:06:00.000Z",
          error: "webhook_timeout",
          handoffSummary: null,
          id: "step-2",
          inputEvent: { scenarioId: "bot-ops" },
          inputEventId: "evt-2",
          lifecycleEvent: null,
          nodeId: "hook",
          nodeType: "webhook",
          outcome: "dead_lettered",
          runtimeId: "rt-1",
          sideEffects: [],
          tenantId: "tenant-volga",
          webhookResponse: null
        }
      ],
      scenarios: [
        {
          channels: ["SDK"],
          flowEdges: [],
          flowNodes: [],
          id: "bot-ops",
          name: "Ops",
          schemaVersion: "bot-flow/v1",
          status: "published",
          tenantId: "tenant-volga"
        }
      ],
      tenantId: "tenant-volga"
    });

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.status, "published");
    assert.equal(summaries[0]?.recentPublishes[0]?.versionId, "v1");
    assert.equal(summaries[0]?.recentHandoffs[0]?.reason, "bot_ai_quota_exhausted");
    assert.equal(summaries[0]?.recentFailures[0]?.error, "webhook_timeout");
    assert.deepEqual(summaries[0]?.lastCitations, [{ sourceId: "src-1", title: "Оплата", version: 3 }]);
    assert.equal(summaries[0]?.lastFallbackReason, "webhook_timeout");
  });

  it("hides AI usage and cost unless the viewer role may see them", () => {
    assert.equal(canViewAiUsage({ permissions: ["automation.read"] }), false);
    assert.equal(canViewAiUsage({ permissions: ["settings.manage"] }), true);
    assert.equal(canViewAiUsage({ isServiceAdmin: true }), true);
    assert.equal(buildTenantAiUsageSummary({ usedTokens: 12_000, viewer: { permissions: ["automation.read"] } }), null);

    const usage = buildTenantAiUsageSummary({
      month: "2026-07",
      monthlyTokenBudget: 50_000,
      usedTokens: 12_000,
      viewer: { permissions: ["settings.manage"] }
    });
    assert.equal(usage?.usedTokens, 12_000);
    assert.equal(usage?.estimatedCostBucket, "medium");
    assert.equal(estimateAiCostBucket(0), "none");
  });
});
