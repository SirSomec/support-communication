import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAccessProfile, constrainPermissionsForRoleMode } from "../src/app/access.js";

describe("marketing module access", () => {
  it("keeps the owner-granted module permission independent from the role preview", () => {
    const permissions = constrainPermissionsForRoleMode(["dialogs.read", "marketing.access"], "Сотрудник");
    assert.ok(permissions.includes("marketing.access"));
    assert.ok(buildAccessProfile(permissions).sections.includes("marketing"));
  });
});
