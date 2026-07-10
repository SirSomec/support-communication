import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearServiceAdminSession,
  clearSession,
  clearTenantSession,
  getAccessToken,
  getOperator,
  getServiceAdminAccessToken,
  getTenantAccessToken,
  getTenantId,
  hasServiceAdminSession,
  hasSession,
  setServiceAdminSession,
  setSession,
  setTenantSession
} from "../src/app/sessionStore.js";

describe("sessionStore", () => {
  afterEach(() => {
    clearSession();
    clearServiceAdminSession();
  });

  it("round-trips tenant access token", () => {
    setTenantSession({ accessToken: "tok_123", tenantId: "tenant-pilot-001" });
    assert.equal(getTenantAccessToken(), "tok_123");
    assert.equal(getAccessToken(), "tok_123");
    clearTenantSession();
    assert.equal(getTenantAccessToken(), null);
  });

  it("stores tenant id and operator profile", () => {
    const operator = { id: "op-1", email: "operator@pilot-client.test", name: "Pilot Operator" };
    setSession({
      accessToken: "tok_456",
      tenantId: "tenant-pilot-001",
      operator
    });

    assert.equal(getTenantId(), "tenant-pilot-001");
    assert.deepEqual(getOperator(), operator);
    assert.equal(hasSession(), true);
    clearSession();
    assert.equal(hasSession(), false);
    assert.equal(getTenantId(), null);
    assert.equal(getOperator(), null);
  });

  it("stores service-admin bearer token separately from tenant session", () => {
    setTenantSession({ accessToken: "tenant-token", tenantId: "tenant-a" });
    setServiceAdminSession({ accessToken: "service-admin-token" });

    assert.equal(getTenantAccessToken(), "tenant-token");
    assert.equal(getServiceAdminAccessToken(), "service-admin-token");
    assert.equal(hasServiceAdminSession(), true);

    clearTenantSession();
    assert.equal(getTenantAccessToken(), null);
    assert.equal(getServiceAdminAccessToken(), "service-admin-token");
  });

  it("clears stale tenant tokens without affecting service-admin session", () => {
    setTenantSession({ accessToken: "stale-token", tenantId: "tenant-stale" });
    setServiceAdminSession({ accessToken: "service-admin-token" });

    clearTenantSession();
    assert.equal(hasSession(), false);
    assert.equal(hasServiceAdminSession(), true);
  });
});
