import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScenarioListRow,
  createScenarioFromWizard,
  describeMatchMode,
  describeScenarioTrigger,
  formatScenarioStatusLabel,
  scenarioStatusTone
} from "../src/features/automation/automationModel.js";

describe("BAI-600 scenario list model", () => {
  it("summarizes phrase triggers without exposing raw enum names as the primary label", () => {
    const scenario = createScenarioFromWizard("bot-list-1", {
      matchMode: "tokens",
      name: "Оплата",
      trigger: "keyword",
      triggerPhrases: ["где оплата", "счёт", "invoice", "платеж"]
    });

    assert.equal(describeMatchMode("tokens"), "по словам");
    assert.match(describeScenarioTrigger(scenario), /Фраза \(по словам\):/);
    assert.match(describeScenarioTrigger(scenario), /где оплата/);
    assert.match(describeScenarioTrigger(scenario), /\+1/);
    assert.equal(describeScenarioTrigger({ triggerRules: [{ type: "new_conversation" }] }), "Первое сообщение клиента");
  });

  it("builds a list row with status, AI/sources, publication and readiness errors", () => {
    const scenario = createScenarioFromWizard("bot-list-2", {
      name: "Доставка",
      sourceBindings: [{ sourceId: "faq-delivery", sourceVersion: "2" }],
      trigger: "first_message"
    });
    scenario.status = "published";
    scenario.activeVersionId = "rev-2";
    scenario.enabled = false;

    const row = buildScenarioListRow(scenario, {
      aiReadiness: { status: "not_configured" },
      knowledgeSources: [{ id: "faq-delivery", title: "Правила доставки" }],
      versions: [
        { createdAt: "2026-07-12T09:00:00.000Z", scenarioId: "bot-list-2", status: "published", versionId: "rev-1" },
        { createdAt: "2026-07-12T11:30:00.000Z", scenarioId: "bot-list-2", status: "published", versionId: "rev-2" }
      ]
    });

    assert.equal(row.name, "Доставка");
    assert.equal(row.statusLabel, formatScenarioStatusLabel("published"));
    assert.equal(row.statusTone, scenarioStatusTone("published"));
    assert.equal(row.triggerSummary, "Первое сообщение клиента");
    assert.match(row.aiSummary, /Правила доставки/);
    assert.match(row.lastPublishedLabel, /12/);
    assert.equal(row.hasErrors, true);
    assert.ok(row.errors.some((item) => /AI-подключение не настроено/.test(item)));
    assert.ok(row.errors.some((item) => /остановлен/.test(item)));
  });

  it("marks scenarios without AI as clean when sources are absent", () => {
    const row = buildScenarioListRow({
      channels: ["SDK"],
      flowNodes: [{ id: "n1", type: "message" }],
      id: "plain",
      name: "Простой ответ",
      status: "draft",
      triggerRules: [{ type: "manual" }]
    }, { aiReadiness: { status: "not_configured" }, knowledgeSources: [], versions: [] });

    assert.equal(row.aiSummary, "Без AI");
    assert.equal(row.hasErrors, false);
    assert.equal(row.lastPublishedLabel, "Ещё не публиковался");
  });
});
