import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTenantSessionHydration } from "../src/app/useTenantSessionState.js";

describe("tenant session hydration", () => {
  it("blocks the workspace guard synchronously when app session checks are re-enabled", () => {
    assert.deepEqual(resolveTenantSessionHydration({ hydrationMode: "disabled", loading: false }, true), {
      hydrated: false,
      loading: true
    });
  });

  it("allows route authorization only after the enabled session check completes", () => {
    assert.deepEqual(resolveTenantSessionHydration({ hydrationMode: "enabled", loading: false }, true), {
      hydrated: true,
      loading: false
    });
  });
});
