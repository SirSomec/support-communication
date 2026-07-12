import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNavigationAccess } from "../src/app/useAppNavigation.js";

describe("app navigation access", () => {
  it("does not fall back to local administrator permissions for authenticated sessions with empty permissions", () => {
    const access = resolveNavigationAccess({
      roleMode: "Администратор",
      sessionPermissions: [],
      useSessionPermissions: true
    });

    assert.deepEqual(access.sections, []);
    assert.equal(access.canManageSettings, false);
    assert.equal(access.canExportReports, false);
    assert.equal(access.canServiceAdmin, false);
  });
});
