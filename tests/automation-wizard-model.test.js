import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientExperiencePreview,
  clearWizardDraft,
  createDefaultWizardForm,
  createScenarioFromWizard,
  describeAiReadiness,
  findTriggerPhraseConflicts,
  loadWizardDraft,
  previewKeywordTrigger,
  saveWizardDraft,
  scenarioWizardSteps
} from "../src/features/automation/automationModel.js";

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

  it("persists wizard draft between steps and explains what the client will see", () => {
    assert.deepEqual(scenarioWizardSteps, ["Задача", "Запуск", "Как помогает", "Знания и передача", "Проверка"]);
    const storage = createMemoryStorage();
    const form = {
      ...createDefaultWizardForm(),
      channels: ["Telegram"],
      firstMessage: "Здравствуйте! Пришлите номер заказа.",
      name: "Статус",
      trigger: "keyword",
      triggerPhrases: ["где заказ"]
    };

    saveWizardDraft(form, 2, storage);
    const restored = loadWizardDraft(storage);
    assert.equal(restored.step, 2);
    assert.equal(restored.form.name, "Статус");
    assert.deepEqual(restored.form.triggerPhrases, ["где заказ"]);

    const preview = buildClientExperiencePreview(form);
    assert.match(preview.teamSees, /Статус/);
    assert.ok(preview.clientSees.some((line) => /где заказ/.test(line)));
    assert.ok(preview.clientSees.some((line) => /Пришлите номер заказа/.test(line)));

    clearWizardDraft(storage);
    assert.equal(loadWizardDraft(storage), null);
  });

  it("explains AI readiness, language, tone and editable fallback before draft creation", () => {
    const ready = describeAiReadiness({ readyConnectionCount: 1, status: "ready" });
    const missing = describeAiReadiness({ status: "not_configured" });
    assert.equal(ready.tone, "ok");
    assert.equal(missing.canFix, true);
    assert.match(missing.reason, /ключа/i);

    const scenario = createScenarioFromWizard("bot-ai-transparent", {
      fallbackMessage: "Не нашёл ответ — передам оператору.",
      language: "en",
      tone: "formal"
    });
    const aiNode = scenario.flowNodes.find((node) => node.type === "ai_reply");
    assert.equal(aiNode.config.language, "en");
    assert.equal(aiNode.config.tone, "formal");
    assert.equal(aiNode.config.fallbackMessage, "Не нашёл ответ — передам оператору.");
  });

  it("previews keyword matches and detects phrase conflicts without raw enum labels", () => {
    const hit = previewKeywordTrigger("Подскажите где мой заказ пожалуйста", ["где мой заказ"], "contains");
    const miss = previewKeywordTrigger("хочу вернуть товар", ["где мой заказ"], "exact");
    assert.equal(hit.matches, true);
    assert.equal(hit.modeLabel, "содержит текст");
    assert.equal(miss.matches, false);

    const conflicts = findTriggerPhraseConflicts(["где мой заказ"], [
      { id: "other", name: "Старый статус", status: "published", triggerRules: [{ phrases: ["Где мой заказ"], type: "phrase" }] }
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].scenarioName, "Старый статус");
  });
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); }
  };
}
