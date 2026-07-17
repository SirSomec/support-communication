import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeScenarioSourceState } from "../src/features/automation/scenarioKnowledgeSourceState.js";

describe("scenario knowledge source state", () => {
  it("keeps ready approved sources selectable without extra hints", () => {
    const state = describeScenarioSourceState({ approvalStatus: "approved", status: "ready" });
    assert.deepEqual(state, { hidden: false, hint: "", selectable: true });
  });

  it("keeps ready pending sources selectable but explains the approval gate", () => {
    const state = describeScenarioSourceState({ approvalStatus: "pending", status: "ready" });
    assert.equal(state.selectable, true);
    assert.match(state.hint, /ждёт одобрения/);
  });

  it("shows preparing and failed sources as visible but not selectable", () => {
    for (const status of ["fetching", "indexing", "uploaded"]) {
      const state = describeScenarioSourceState({ status });
      assert.equal(state.selectable, false, status);
      assert.match(state.hint, /готовится/);
      assert.equal(state.hidden, false);
    }
    assert.match(describeScenarioSourceState({ status: "failed" }).hint, /ошибка подготовки/);
    assert.match(describeScenarioSourceState({ status: "disabled" }).hint, /отключён/);
    assert.match(describeScenarioSourceState({ status: "draft" }).hint, /черновик/);
  });

  it("hides archived sources and honours legacy ready markers", () => {
    assert.equal(describeScenarioSourceState({ status: "archived" }).hidden, true);
    assert.equal(describeScenarioSourceState({ isReady: true, status: "custom" }).selectable, true);
    assert.equal(describeScenarioSourceState({ status: "published" }).selectable, true);
  });
});
