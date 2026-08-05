import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";

const productionChannels = ["SDK", "Telegram", "VK", "MAX"] as const;

describe("AI dialog billing across production channels", () => {
  it("reserves a prepaid dialog before generating an answer on every channel", async () => {
    for (const channel of productionChannels) {
      const state = createEmptyAutomationState();
      const nodes = [{ id: "start", type: "condition" as const }, { id: "answer", type: "ai_reply" as const }];
      const edges = [{ from: "start", to: "answer" }];
      state.botScenarios.push({ channels: [channel], flowEdges: edges, flowNodes: nodes, id: `bot-${channel}`, name: `${channel} bot`, schemaVersion: "bot-flow/v1", status: "published", tenantId: "tenant-1" });
      state.botScenarioVersions.push({ createdAt: "2026-08-05T10:00:00.000Z", flowEdges: edges, flowNodes: nodes, scenarioId: `bot-${channel}`, status: "published", tenantId: "tenant-1", versionId: `v1-${channel}` });
      let reservations = 0;
      const runtime = new BotRuntimeService(AutomationRepository.inMemory(state), {
        aiDialogBilling: {
          reserveAiProcessedDialog: async () => {
            reservations += 1;
            return { data: {}, status: "ok" };
          }
        },
        aiResponder: { respond: async () => ({ citations: [], model: "test-model", text: "answer" }) }
      });

      const result = await runtime.handleInboundEvent({ channel, conversationId: `conv-${channel}`, eventId: `evt-${channel}`, payload: { text: "question" }, scenarioId: `bot-${channel}`, tenantId: "tenant-1", traceId: `trace-${channel}` });

      assert.equal(result.step.outcome, "ai_reply_queued", channel);
      assert.equal(reservations, 1, channel);
    }
  });

  it("keeps every production ingress on a billing-configured runtime", () => {
    const apiMain = source("../apps/api-gateway/src/main.ts");
    assert.ok(apiMain.indexOf("configureBillingRepository(config") < apiMain.indexOf("NestFactory.create"));

    for (const file of [
      "../apps/api-gateway/src/integrations/telegram-webhook.controller.ts",
      "../apps/api-gateway/src/integrations/provider-webhook.controller.ts",
      "../apps/api-gateway/src/integrations/public-api.controller.ts",
      "../apps/api-gateway/src/integrations/open-channel/open-channel-public.controller.ts"
    ]) {
      assert.match(source(file), /automationService\.handleBotRuntimeInboundEvent\(event\)/, file);
    }

    const pollingMain = source("../apps/api-gateway/src/integrations/telegram-polling.main.ts");
    assert.ok(pollingMain.indexOf("configureBillingRepository(source)") < pollingMain.indexOf("new AutomationService"));

    const reconciliationMain = source("../apps/api-gateway/src/automation/bot-runtime-reconciliation.main.ts");
    assert.match(reconciliationMain, /aiDialogBilling:\s*billingService/);

    const automationService = source("../apps/api-gateway/src/automation/automation.service.ts");
    assert.match(automationService, /retryBotRuntimeInboundEvent[\s\S]*?aiDialogBilling:\s*options\.aiDialogBilling \?\? this\.billingService/);
  });
});

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
