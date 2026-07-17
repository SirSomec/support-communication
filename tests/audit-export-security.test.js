import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell } from "../src/features/audit/auditExport.js";

describe("audit CSV export", () => {
  it("neutralizes spreadsheet formulas from audit fields", () => {
    assert.equal(csvCell("=HYPERLINK(\"https://evil.example\")"), '"\'=HYPERLINK(""https://evil.example"")"');
    assert.equal(csvCell("  +SUM(1,1)"), "'  +SUM(1,1)");
    assert.equal(csvCell("@SUM(1,1)"), "'@SUM(1,1)");
  });

  it("quotes delimiters, new lines, carriage returns and quotes", () => {
    assert.equal(csvCell("one;two"), '"one;two"');
    assert.equal(csvCell("one\ntwo"), '"one\ntwo"');
    assert.equal(csvCell('one"two'), '"one""two"');
  });
});
