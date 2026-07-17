import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRuleParameter } from "../src/features/settings/rulesModel.js";

describe("settings rule parameter normalization", () => {
  it("does not persist unchanged or cleared numeric fields as zero", () => {
    assert.deepEqual(normalizeRuleParameter(10, "10"), { changed: false, value: 10 });
    assert.deepEqual(normalizeRuleParameter(10, ""), { changed: false, value: 10 });
    assert.deepEqual(normalizeRuleParameter(10, " 12 "), { changed: true, value: 12 });
  });
});
