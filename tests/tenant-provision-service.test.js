import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  clearServiceAdminSession,
  clearSession
} from "../src/app/sessionStore.js";
import { resetApiClientTestConfig } from "../src/services/apiClient.js";
import {
  mapOnboardingFormToProvisionPayload,
  tenantProvisionService
} from "../src/services/tenantProvisionService.js";
import { getCompletion, steps } from "../src/features/onboarding/onboardingModel.js";

const originalFetch = globalThis.fetch;

const onboardingForm = {
  tenant: {
    name: "Acme Pilot",
    slug: "acme-pilot",
    region: "ru-1",
    industry: "retail"
  },
  plan: {
    id: "Growth",
    trial: true,
    billingCycle: "monthly"
  },
  admin: {
    name: "Owner",
    email: "owner@acme-pilot.test",
    password: "Owner-2026!",
    role: "Владелец",
    mfa: true
  },
  employees: [{ email: "agent@acme-pilot.test", role: "Оператор", team: "Support" }]
};

describe("tenant provision service", () => {
  afterEach(() => {
    mock.restoreAll();
    clearSession();
    clearServiceAdminSession();
    resetApiClientTestConfig();
    globalThis.fetch = originalFetch;
  });

  it("maps onboarding form state to the tenant provision API body", () => {
    const payload = mapOnboardingFormToProvisionPayload(onboardingForm);

    assert.equal(payload.tenant.name, "Acme Pilot");
    assert.equal(payload.admin.email, "owner@acme-pilot.test");
    assert.equal(payload.plan.id, "trial");
    assert.equal(payload.employees.length, 1);
    assert.equal("testMessage" in payload, false);
    assert.equal(payload.channel.domain, "acme-pilot.example.test");
  });

  it("does not include the test message step in onboarding completion", () => {
    const completion = getCompletion({
      admin: onboardingForm.admin,
      employees: onboardingForm.employees,
      limits: {
        operatorLimit: 8,
        concurrentDialogs: 12,
        dailyMessages: 5000
      },
      plan: onboardingForm.plan,
      tenant: onboardingForm.tenant
    });

    assert.equal(steps.some((step) => step.id === "test"), false);
    assert.equal("test" in completion, false);
    assert.equal(Object.values(completion).every(Boolean), true);
  });

  it("keeps onboarding labels readable UTF-8 Russian", () => {
    const labels = steps.map((step) => step.label);

    assert.deepEqual(labels, [
      "Tenant",
      "Тариф / trial",
      "Первый администратор",
      "Лимиты",
      "Сотрудники"
    ]);
    assert.equal(labels.join(" ").includes("Р"), false);
  });

  it("posts mapped onboarding payload without a privileged bearer token", async () => {
    globalThis.fetch = mock.fn(async (url, options) => {
      assert.equal(url, "/api/v1/tenants/provision");
      assert.equal(options.method, "POST");
      assert.equal("authorization" in options.headers, false);
      assert.equal("x-demo-service-admin-key" in options.headers, false);
      assert.deepEqual(JSON.parse(options.body), mapOnboardingFormToProvisionPayload(onboardingForm));

      return new Response(JSON.stringify({
        service: "tenantProvisionService",
        operation: "provisionOrganization",
        status: "ok",
        data: {
          tenant: {
            id: "tenant-acme-pilot",
            name: "Acme Pilot",
            slug: "acme-pilot",
            region: "ru-1",
            planId: "trial",
            status: "trial"
          },
          tenantId: "tenant-acme-pilot",
          session: {
            accessToken: "tenant-session-token",
            refreshToken: "tenant-refresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z"
          },
          operator: {
            id: "usr-owner",
            email: "owner@acme-pilot.test",
            name: "Owner",
            role: "Owner"
          },
          publicApiKey: "sk_stage_abc123",
          embedSnippet: '<script src="https://example.test/sdk.js"></script>'
        },
        error: null
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });

    const response = await tenantProvisionService.provisionOrganization(
      mapOnboardingFormToProvisionPayload(onboardingForm)
    );

    assert.equal(globalThis.fetch.mock.callCount(), 1);
    assert.equal(response.status, "ok");
    assert.equal(response.data.session.accessToken, "tenant-session-token");
  });
});
