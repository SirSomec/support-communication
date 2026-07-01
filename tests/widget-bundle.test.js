import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(repoRoot, "packages", "web-widget", "dist", "widget.js");

describe("web widget bundle", () => {
  it("exports SupportWidget.init global from dist/widget.js", () => {
    assert.equal(existsSync(bundlePath), true, "Run npm run widget:build before this test.");

    const bundle = readFileSync(bundlePath, "utf8");
    const sandbox = { SupportWidget: undefined };
    vm.runInNewContext(bundle, sandbox, { filename: bundlePath });

    assert.equal(typeof sandbox.SupportWidget, "object");
    assert.equal(typeof sandbox.SupportWidget.init, "function");
  });
});
