import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("redirect from login for an active tenant session", () => {
  it("hydrates a tenant session on the login route", () => {
    const source = readFileSync("src/App.jsx", "utf8");

    assert.match(source, /window\.location\.hash === "#\/login"/);
  });

  it("replaces the login route with the workspace after session validation", () => {
    const source = readFileSync("src/app/useWorkspaceRoute.js", "utf8");

    assert.match(source, /route\.namespace === "auth"/);
    assert.match(source, /tenantSession\.authenticated/);
    assert.match(source, /window\.history\.replaceState\(null, "", "#\/app"\)/);
  });
});
