import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const regressionWorkflow = readFileSync(new URL("../.github/workflows/browser-regression.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("Playwright CI workflow", () => {
  it("keeps a cached, apt-free release smoke as the image publication gate", () => {
    assert.equal(packageJson.scripts["test:release-smoke"], "playwright test --grep @release");
    assert.match(ciWorkflow, /name: Playwright release smoke/);
    assert.match(ciWorkflow, /if: github\.event_name == 'push'/);
    assert.match(ciWorkflow, /uses: actions\/cache@v4/);
    assert.match(ciWorkflow, /path: ~\/\.cache\/ms-playwright/);
    assert.match(ciWorkflow, /run: npx playwright install chromium/);
    assert.match(ciWorkflow, /run: npm run test:release-smoke/);
    assert.doesNotMatch(ciWorkflow, /playwright install --with-deps/);
  });

  it("runs the complete browser suite outside the release gate", () => {
    assert.match(regressionWorkflow, /pull_request:/);
    assert.match(regressionWorkflow, /schedule:/);
    assert.match(regressionWorkflow, /workflow_dispatch:/);
    assert.match(regressionWorkflow, /run: npx playwright test/);
    assert.doesNotMatch(regressionWorkflow, /--grep @release/);
  });
});
