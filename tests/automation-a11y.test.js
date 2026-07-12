import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNextRadioOptionId, isRadioGroupNavigationKey } from "../src/features/automation/automationA11y.js";

describe("BAI-608 automation a11y helpers", () => {
  const options = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" }
  ];

  it("moves radio selection with arrows and Home/End", () => {
    assert.equal(getNextRadioOptionId(options, "a", "ArrowRight"), "b");
    assert.equal(getNextRadioOptionId(options, "c", "ArrowRight"), "a");
    assert.equal(getNextRadioOptionId(options, "a", "ArrowLeft"), "c");
    assert.equal(getNextRadioOptionId(options, "b", "Home"), "a");
    assert.equal(getNextRadioOptionId(options, "a", "End"), "c");
  });

  it("recognizes radiogroup navigation keys", () => {
    assert.equal(isRadioGroupNavigationKey("ArrowDown"), true);
    assert.equal(isRadioGroupNavigationKey("Enter"), false);
  });
});
