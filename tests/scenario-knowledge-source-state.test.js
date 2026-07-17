import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeScenarioSourceState } from "../src/features/automation/scenarioKnowledgeSourceState.js";

describe("scenario knowledge source state", () => {
  it("keeps every non-archived source selectable — approval logic retired", () => {
    for (const source of [
      { approvalStatus: "approved", status: "ready" },
      { approvalStatus: "pending", status: "ready" },
      { status: "indexing" },
      { status: "fetching" },
      { status: "uploaded" },
      { status: "failed" },
      { status: "disabled" },
      { status: "draft" },
      { isReady: true, status: "custom" },
      { status: "published" }
    ]) {
      const state = describeScenarioSourceState(source);
      assert.equal(state.selectable, true, JSON.stringify(source));
      assert.equal(state.hidden, false, JSON.stringify(source));
    }
  });

  it("keeps informational hints about lifecycle without approval mentions", () => {
    assert.equal(describeScenarioSourceState({ approvalStatus: "pending", status: "ready" }).hint, "");
    assert.match(describeScenarioSourceState({ status: "indexing" }).hint, /готовится/);
    assert.match(describeScenarioSourceState({ status: "failed" }).hint, /ошибка подготовки/);
    assert.match(describeScenarioSourceState({ status: "disabled" }).hint, /отключён/);
    assert.match(describeScenarioSourceState({ status: "draft" }).hint, /черновик/);
    for (const status of ["ready", "indexing", "failed", "disabled", "draft"]) {
      assert.doesNotMatch(describeScenarioSourceState({ status }).hint, /одобр/i, status);
    }
  });

  it("hides only archived sources", () => {
    assert.equal(describeScenarioSourceState({ status: "archived" }).hidden, true);
  });
});
