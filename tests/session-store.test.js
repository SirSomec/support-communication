import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearSession,
  getAccessToken,
  getOperator,
  getTenantId,
  hasSession,
  setSession
} from "../src/app/sessionStore.js";

describe("sessionStore", () => {
  afterEach(() => {
    clearSession();
  });

  it("round-trips access token", () => {
    setSession({ accessToken: "tok_123", tenantId: "tenant-pilot-001" });
    assert.equal(getAccessToken(), "tok_123");
    clearSession();
    assert.equal(getAccessToken(), null);
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
});
