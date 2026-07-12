import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOperatorHandoffViewModel } from "../src/features/dialogs/operatorHandoffModel.js";

describe("BAI-702 operator handoff frontend model", () => {
  it("masks phone for operators without sensitive access and keeps topic/citations", () => {
    const view = buildOperatorHandoffViewModel({
      aiOutcome: "Нужна проверка",
      citations: [{ sourceId: "src-1", title: "Доставка", version: 2 }],
      collectedFields: { orderId: "A-1", phone: "+7 999 204-18-44" },
      goal: "Статус заказа",
      phone: "+7 999 204-18-44",
      queue: "Л1",
      reason: "ai_unavailable",
      scenarioName: "Delivery",
      sessionState: "Клиент ждёт ответ"
    }, { canViewSensitive: false, topic: "Товар / Несоответствие" });

    assert.equal(view.title, "Handoff summary");
    assert.match(view.phone, /\*\*\*/);
    assert.doesNotMatch(view.phone, /204-18-44/);
    assert.equal(view.topic, "Товар / Несоответствие");
    assert.match(view.citationsLabel, /Доставка/);
  });
});
