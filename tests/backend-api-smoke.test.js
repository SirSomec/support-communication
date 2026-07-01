import assert from "node:assert/strict";
import { describe, it } from "node:test";

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:4100/api/v1";
const demoKey = process.env.VITE_DEMO_SERVICE_ADMIN_KEY ?? "dev-service-admin-key";
const enabled = process.env.RUN_BACKEND_API_SMOKE === "1";

describe("live backend API smoke", { skip: !enabled }, () => {
  it("responds to health and authenticated envelope routes", async () => {
    const demoHeaders = {
      "x-demo-service-admin-key": demoKey,
      "x-demo-service-admin-actor-id": "svc-admin-demo",
      "x-demo-service-admin-actor-name": "Demo Service Admin",
      "x-demo-service-admin-mfa-verified": "true",
      "x-demo-service-admin-permissions": "*",
      "x-demo-service-admin-roles": "service_admin",
      "x-demo-service-admin-session-expires-at": new Date(Date.now() + 60 * 60 * 1000).toISOString()
    };

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200);

    const authState = await fetch(`${baseUrl}/auth/state`, {
      headers: demoHeaders
    });
    assert.equal(authState.status, 200);
    const authEnvelope = await authState.json();
    assert.equal(authEnvelope.service, "authService");
    assert.equal(authEnvelope.operation, "getAuthState");

    const dialogs = await fetch(`${baseUrl}/dialogs?page=1&pageSize=1`, {
      headers: demoHeaders
    });
    assert.equal(dialogs.status, 200);
    const dialogEnvelope = await dialogs.json();
    assert.equal(dialogEnvelope.service, "dialogService");
    assert.equal(dialogEnvelope.operation, "fetchDialogs");
    assert.ok(Array.isArray(dialogEnvelope.data.items));
  });
});
