import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOperatorHandoffView } from "../apps/api-gateway/src/automation/operator-handoff-view.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";

describe("BAI-702 operator handoff view", () => {
  it("builds a compact operator view with goal, state, AI outcome, citations and reason", () => {
    const view = buildOperatorHandoffView({
      aiOutcome: "Нужна проверка курьера",
      citations: [{ sourceId: "src-1", title: "Доставка", version: 3 }],
      collectedFields: { orderId: "A-1", phone: "+7 999 000-00-00" },
      goal: "Статус заказа",
      queue: "Л1",
      reason: "bot_ai_quota_exhausted",
      scenarioName: "Delivery",
      sessionState: "Клиент ждёт ETA",
      topic: "Delivery / Status"
    });

    assert.equal(view.title, "Handoff summary");
    assert.equal(view.goal, "Статус заказа");
    assert.equal(view.sessionState, "Клиент ждёт ETA");
    assert.equal(view.aiOutcome, "Нужна проверка курьера");
    assert.equal(view.reason, "bot_ai_quota_exhausted");
    assert.deepEqual(view.citations, [{ sourceId: "src-1", title: "Доставка", version: 3 }]);
    assert.ok(view.collectedFields.some((item) => item.key === "orderId"));
  });

  it("returns operatorView from createBotHandoffSummary envelope", async () => {
    const automation = new AutomationService();
    const response = await automation.createBotHandoffSummary({
      aiOutcome: "Нет опоры в знаниях",
      botId: "bot-delivery",
      citations: [{ sourceId: "src-1", title: "FAQ", version: 1 }],
      collectedFields: { orderId: "42" },
      conversationId: "maria",
      goal: "Статус",
      queue: "Л1",
      reason: "bot_ai_knowledge_not_ready",
      scenarioName: "Delivery status",
      sessionState: "Клиент спросил статус",
      tenantId: "tenant-volga",
      topic: "Delivery / Status"
    });

    assert.equal(response.status, "ok");
    assert.equal(response.data.operatorView.goal, "Статус");
    assert.equal(response.data.operatorView.citations[0].title, "FAQ");
    assert.equal(response.data.summary.reason, "bot_ai_knowledge_not_ready");
  });
});
