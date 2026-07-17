import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("screen state strip tones", () => {
  it("renders partial data with a warning icon and warning styles", () => {
    const component = readFileSync(new URL("../src/ui.jsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../src/ui.css", import.meta.url), "utf8");

    assert.match(component, /partial:\s*AlertTriangle/);
    assert.match(styles, /\.screen-state-item\.partial/);
    assert.match(styles, /\.screen-state-item\.partial svg/);
  });
});
