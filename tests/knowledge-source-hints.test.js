import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSourceBotHints,
  isActiveBotScenario,
  isSourceBotEligible
} from "../src/features/knowledge/knowledgeSourceHints.js";

const activeScenario = { enabled: true, name: "Ответы на частые вопросы", scenarioId: "bot-1", status: "published" };

function source(overrides = {}) {
  return { approvalStatus: "approved", id: "ks-1", readiness: "ready", status: "ready", ...overrides };
}

describe("knowledge source bot hints", () => {
  it("mirrors the server retrieval eligibility triple", () => {
    assert.equal(isSourceBotEligible(source()), true);
    assert.equal(isSourceBotEligible(source({ approvalStatus: "pending" })), false);
    assert.equal(isSourceBotEligible(source({ readiness: "not_ready" })), false);
    assert.equal(isSourceBotEligible(source({ status: "draft" })), false);
  });

  it("marks an approved bound source as answering clients", () => {
    const hints = buildSourceBotHints(source(), [activeScenario]);
    assert.deepEqual(hints.map((hint) => hint.id), ["eligible"]);
    assert.equal(hints[0].tone, "ok");
  });

  it("asks for approval when content is ready but pending", () => {
    const hints = buildSourceBotHints(source({ approvalStatus: "pending" }), [activeScenario]);
    assert.deepEqual(hints.map((hint) => hint.id), ["approval-pending"]);
    assert.match(hints[0].title, /одобрите/);
  });

  it("explains a draft source is not used by the bot yet", () => {
    const hints = buildSourceBotHints(
      source({ approvalStatus: "pending", readiness: "not_ready", status: "draft" }),
      [activeScenario]
    );
    assert.deepEqual(hints.map((hint) => hint.id), ["not-ready"]);
    assert.equal(hints[0].tone, "warn");
  });

  it("flags a source that no bot scenario references", () => {
    const hints = buildSourceBotHints(source(), []);
    assert.deepEqual(hints.map((hint) => hint.id), ["eligible", "unbound"]);
    assert.match(hints[1].title, /сценарий.*опубликуете/i);
  });

  it("flags bindings that lead only to disabled or unpublished bots", () => {
    assert.equal(isActiveBotScenario({ enabled: true, status: "published" }), true);
    assert.equal(isActiveBotScenario({ enabled: false, status: "published" }), false);
    assert.equal(isActiveBotScenario({ enabled: true, status: "disabled" }), false);

    const hints = buildSourceBotHints(source(), [
      { enabled: true, name: "Выключенный бот", scenarioId: "bot-2", status: "disabled" }
    ]);
    assert.deepEqual(hints.map((hint) => hint.id), ["eligible", "bots-inactive"]);
    assert.match(hints[1].title, /Выключенный бот/);
  });

  it("stays quiet for archived sources and ignores archived scenarios", () => {
    assert.deepEqual(buildSourceBotHints(source({ status: "archived" }), []), []);
    const hints = buildSourceBotHints(source(), [
      { enabled: true, name: "Архивный", scenarioId: "bot-3", status: "archived" }
    ]);
    assert.deepEqual(hints.map((hint) => hint.id), ["eligible", "unbound"]);
  });
});
