import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waitForMailpitMfaOtp } from "../scripts/mailpit-mfa-otp.mjs";

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:4100/api/v1";
const enabled = process.env.RUN_BACKEND_API_SMOKE === "1";
const operatorEmail = process.env.BACKEND_API_SMOKE_OPERATOR_EMAIL ?? "sergey@volga.example";
const operatorPassword = process.env.BACKEND_API_SMOKE_OPERATOR_PASSWORD ?? "correct-password";

async function readJson(response) {
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

describe("live backend API smoke", { skip: !enabled }, () => {
  it("responds to health and tenant bearer-authenticated envelope routes", async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200);

    const firstLogin = await readJson(await fetch(`${baseUrl}/auth/tenant/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: operatorEmail,
        password: operatorPassword
      })
    }));
    assert.equal(firstLogin.service, "authService");
    assert.equal(firstLogin.operation, "loginTenantOperator");
    assert.equal(firstLogin.status, "ok");

    let login = firstLogin;
    if (!login.data.accessToken) {
      const operatorOtp = process.env.BACKEND_API_SMOKE_OPERATOR_OTP || await waitForMailpitMfaOtp({
        challengeId: firstLogin.data.mfaChallengeId,
        email: operatorEmail
      });
      login = await readJson(await fetch(`${baseUrl}/auth/tenant/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: operatorEmail,
          mfaChallengeId: firstLogin.data.mfaChallengeId,
          otp: operatorOtp,
          password: operatorPassword
        })
      }));
    }
    assert.equal(login.service, "authService");
    assert.equal(login.operation, "loginTenantOperator");
    assert.equal(login.status, "ok");
    assert.ok(login.data.accessToken);

    const tenantHeaders = {
      authorization: `Bearer ${login.data.accessToken}`
    };

    const authState = await fetch(`${baseUrl}/auth/tenant/state`, {
      headers: tenantHeaders
    });
    const authEnvelope = await readJson(authState);
    assert.equal(authEnvelope.service, "authService");
    assert.equal(authEnvelope.operation, "getTenantOperatorState");
    assert.equal(authEnvelope.data.authenticated, true);

    const dialogs = await fetch(`${baseUrl}/dialogs?page=1&pageSize=1`, {
      headers: tenantHeaders
    });
    const dialogEnvelope = await readJson(dialogs);
    assert.equal(dialogEnvelope.service, "dialogService");
    assert.equal(dialogEnvelope.operation, "fetchDialogs");
    assert.ok(Array.isArray(dialogEnvelope.data.items));
  });
});
