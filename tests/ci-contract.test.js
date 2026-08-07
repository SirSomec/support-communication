import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

describe("continuous integration contract", () => {
  it("gates pull requests on code, data-isolation, migration, and browser checks", () => {
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /npm run typecheck/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /npm run tenant-isolation:verify/);
    assert.match(workflow, /npm run migration-rollback-check:verify/);
    assert.match(workflow, /npm run prisma:generate/);
    assert.match(workflow, /npm run prisma:validate/);
    assert.match(workflow, /npx playwright test/);
    assert.match(workflow, /SMOKE_DATABASE_NAME:/);
  });

  it("builds backend packages and the web widget before root unit contracts", () => {
    const backendBuild = [
      "      - run: npm run build",
      "        working-directory: backend"
    ].join("\n");
    const widgetBuild = [
      "      - run: npm run build",
      "        working-directory: packages/web-widget"
    ].join("\n");
    const rootUnitTests = "      - run: npm run test:unit";

    assert.notEqual(workflow.indexOf(backendBuild), -1);
    assert.notEqual(workflow.indexOf(widgetBuild), -1);
    assert.ok(workflow.indexOf(backendBuild) < workflow.indexOf(rootUnitTests));
    assert.ok(workflow.indexOf(widgetBuild) < workflow.indexOf(rootUnitTests));
  });
});
