import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("authenticated logout flows", () => {
  it("revokes the tenant session before clearing local auth state", () => {
    const hook = readFileSync("src/app/useTenantSessionState.js", "utf8");
    const shell = readFileSync("src/features/app-shell/AppShell.jsx", "utf8");

    const revoke = hook.indexOf("await authService.logoutTenant()");
    const clear = hook.indexOf("clearTenantSession()", revoke);
    assert.ok(revoke >= 0);
    assert.ok(clear > revoke);
    assert.match(shell, /onClick=\{onLogout\}[\s\S]*Выйти/);
  });

  it("revokes the service-admin session before returning to login", () => {
    const app = readFileSync("src/service-admin/ServiceAdminApp.jsx", "utf8");
    const revoke = app.indexOf("await authService.logout");
    const clear = app.indexOf("clearServiceAdminSession()", revoke);
    const navigate = app.indexOf('navigate("login")', clear);

    assert.ok(revoke >= 0);
    assert.ok(clear > revoke);
    assert.ok(navigate > clear);
  });
});
