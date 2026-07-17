import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNavigationAccess, selectFallbackSection } from "../src/app/useAppNavigation.js";

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

  it("falls back to the first actually accessible section", () => {
    assert.equal(selectFallbackSection(["reports", "settings"]), "reports");
    assert.equal(selectFallbackSection(["reports", "dialogs"]), "dialogs");
    assert.equal(selectFallbackSection([]), "");
  });
});
