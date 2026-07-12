import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createScenarioFromWizard } from "../src/features/automation/automationModel.js";

describe("scenario creation wizard model", () => {
  it("creates a complete no-code draft from human-readable choices", () => {
    const scenario = createScenarioFromWizard("bot-wizard-1", {
      channels: ["Telegram", "SDK"],
      firstMessage: "Пришлите номер заказа — я всё проверю.",
      goal: "status",
      handoffQueue: "Заказы",
      handoffRule: "no_answer",
      name: "Статус заказа",
      trigger: "keyword"
    });

    assert.equal(scenario.status, "draft");
    assert.deepEqual(scenario.channels, ["Telegram", "SDK"]);
    assert.equal(scenario.flowNodes.length, 4);
    assert.deepEqual(scenario.flowEdges.map((edge) => edge.label), ["запустить", "проверить", "передать"]);
    assert.equal(scenario.flowNodes[0].title, "Ключевая фраза в сообщении");
    assert.equal(scenario.flowNodes[1].detail, "Пришлите номер заказа — я всё проверю.");
    assert.match(scenario.flowNodes[3].title, /Заказы/);
    assert.match(scenario.previewMessages[2].text, /Заказы/);
  });

  it("uses safe defaults when the wizard has incomplete choices", () => {
    const scenario = createScenarioFromWizard("bot-wizard-2", { name: "  " });

    assert.equal(scenario.name, "Ответы на частые вопросы");
    assert.deepEqual(scenario.channels, ["SDK"]);
    assert.equal(scenario.flowNodes[0].channel, "SDK");
    assert.equal(scenario.handoff, "Очередь 1-я линия");
  });

  it("keeps only unique valid knowledge source bindings from the wizard", () => {
    const scenario = createScenarioFromWizard("bot-wizard-sources", {
      sourceBindings: [
        { sourceId: "knowledge-return-policy", sourceVersion: "v3" },
        { sourceId: "knowledge-return-policy", sourceVersion: "v4" },
        { sourceId: "  knowledge-delivery  " },
        { sourceId: "" }
      ]
    });

    assert.deepEqual(scenario.sourceBindings, [
      { sourceId: "knowledge-return-policy", sourceVersion: "v3" },
      { sourceId: "knowledge-delivery" }
    ]);
  });
});
