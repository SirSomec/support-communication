import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import {
  AI_AGENTS_FLAG_KEY,
  aiAgentsKillSwitchSteps,
  evaluateAiAgentsPilot
} from "../apps/api-gateway/src/automation/ai-agents-pilot.ts";
import { featureFlags } from "../apps/api-gateway/src/platform/seed-catalog.ts";
import type { FeatureFlag } from "../apps/api-gateway/src/platform/platform.types.ts";

describe("BAI-706 AI agents pilot feature flag", () => {
  afterEach(() => AutomationRepository.clearDefault());

  it("seeds ai_agents_v1 with kill switch and pilot tenant allowlist", () => {
    const flag = featureFlags.find((item) => item.key === AI_AGENTS_FLAG_KEY);
    assert.ok(flag);
    assert.equal(flag!.killSwitch, true);
    assert.deepEqual(flag!.enabledTenantIds, ["tenant-pilot-001"]);
    assert.equal(evaluateAiAgentsPilot({ tenantId: "tenant-pilot-001" }).eligible, true);
    assert.equal(evaluateAiAgentsPilot({ tenantId: "tenant-volga" }).eligible, false);
  });

  it("hands off AI replies when the pilot flag excludes the tenant", async () => {
    const state = createEmptyAutomationState();
    const nodes = [
      { id: "start", type: "condition" },
      { id: "answer", type: "ai_reply", config: { handoffQueue: "Support", instructions: "Answer" } }
    ];
    const edges = [{ from: "start", to: "answer" }];
    state.botScenarios.push({
      channels: ["SDK"],
      flowEdges: edges,
      flowNodes: nodes,
      id: "bot-pilot",
      name: "Pilot",
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId: "tenant-volga"
    });
    state.botScenarioVersions.push({
      createdAt: "2026-07-12T00:00:00.000Z",
      flowEdges: edges,
      flowNodes: nodes,
      scenarioId: "bot-pilot",
      status: "published",
      tenantId: "tenant-volga",
      versionId: "ver-1"
    });
    const repository = AutomationRepository.inMemory(state);
    const flags: FeatureFlag[] = [
      {
        ...featureFlags.find((item) => item.key === AI_AGENTS_FLAG_KEY)!,
        enabledTenantIds: ["tenant-pilot-001"],
        rollout: 0,
        status: "on"
      }
    ];
    let aiCalled = false;
    const runtime = new BotRuntimeService(repository, {
      featureFlags: flags,
      aiResponder: {
        respond: async () => {
          aiCalled = true;
          return { citations: [], model: "test", text: "ok" };
        }
      }
    });

    const result = await runtime.handleInboundEvent({
      channel: "SDK",
      conversationId: "c1",
      eventId: "e1",
      payload: { text: "hello" },
      scenarioId: "bot-pilot",
      tenantId: "tenant-volga",
      traceId: "trc_pilot"
    });

    assert.equal(aiCalled, false);
    assert.equal(result.step.outcome, "ai_handoff_requested");
    assert.equal(result.step.handoffSummary?.reason, "bot_ai_pilot_disabled");
  });

  it("documents kill switch recovery steps", () => {
    const steps = aiAgentsKillSwitchSteps();
    assert.ok(steps.length >= 4);
    assert.ok(steps.some((step) => /ai_agents_v1/i.test(step)));
    assert.ok(steps.some((step) => /connection/i.test(step)));
  });
});
