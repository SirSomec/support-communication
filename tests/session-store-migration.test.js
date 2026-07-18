import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

function createStorageStub(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    map
  };
}

describe("sessionStore migration to localStorage", () => {
  afterEach(() => {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  });

  it("promotes legacy sessionStorage tokens into localStorage and writes there afterwards", async () => {
    const local = createStorageStub();
    const legacy = createStorageStub({
      sc_access_token: "legacy-token",
      sc_tenant_id: "tenant-legacy",
      sc_operator: JSON.stringify({ id: "op-1" }),
      sc_service_admin_access_token: "legacy-admin-token"
    });
    globalThis.localStorage = local;
    globalThis.sessionStorage = legacy;

    const store = await import("../src/app/sessionStore.js?migration-case");

    assert.equal(store.getTenantAccessToken(), "legacy-token");
    assert.equal(store.getTenantId(), "tenant-legacy");
    assert.deepEqual(store.getOperator(), { id: "op-1" });
    assert.equal(store.getServiceAdminAccessToken(), "legacy-admin-token");

    assert.equal(local.map.get("sc_access_token"), "legacy-token", "токен переехал в localStorage");
    assert.equal(legacy.map.has("sc_access_token"), false, "sessionStorage очищен после миграции");
    assert.equal(legacy.map.has("sc_service_admin_access_token"), false);

    store.setTenantSession({ accessToken: "new-token" });
    assert.equal(local.map.get("sc_access_token"), "new-token", "новые записи идут в localStorage");
  });

  it("falls back to sessionStorage when localStorage is unavailable", async () => {
    const legacy = createStorageStub({ sc_access_token: "session-only-token" });
    globalThis.sessionStorage = legacy;

    const store = await import("../src/app/sessionStore.js?fallback-case");

    assert.equal(store.getTenantAccessToken(), "session-only-token");
    store.setTenantSession({ accessToken: "still-session" });
    assert.equal(legacy.map.get("sc_access_token"), "still-session");
  });
});
