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
import {
  createOnboardingPlanOptions,
  getCompletion,
  LEGAL_DOCUMENT_VERSION,
  steps
} from "../src/features/onboarding/onboardingModel.js";

const originalFetch = globalThis.fetch;

const onboardingForm = {
  tenant: {
    name: "Acme Pilot",
    slug: "acme-pilot",
    region: "ru-1",
    industry: "retail",
    domain: "support.acme-pilot.test"
  },
  limits: {
    operatorLimit: 8,
    concurrentDialogs: 12,
    dailyMessages: 5000,
    aiAssist: true,
    afterHoursBot: false
  },
  plan: {
    id: "business",
    billingCycle: "monthly"
  },
  legal: {
    documentVersion: LEGAL_DOCUMENT_VERSION,
    personalDataConsent: true,
    privacyPolicyAcknowledged: true,
    termsAccepted: true
  },
  admin: {
    name: "Owner",
    email: "owner@acme-pilot.test",
    password: "Owner-2026!",
    role: "Владелец",
    mfa: true
  }
};

describe("tenant provision service", () => {
  afterEach(() => {
    mock.restoreAll();
    clearSession();
    clearServiceAdminSession();
    resetApiClientTestConfig();
    globalThis.fetch = originalFetch;
  });

  it("maps the selected onboarding plan and separate legal acceptance", () => {
    const payload = mapOnboardingFormToProvisionPayload(onboardingForm);

    assert.equal(payload.tenant.name, "Acme Pilot");
    assert.equal(payload.admin.email, "owner@acme-pilot.test");
    assert.deepEqual(payload.plan, { billingCycle: "monthly", id: "business" });
    assert.deepEqual(payload.limits, onboardingForm.limits);
    assert.deepEqual(payload.admin, {
      email: "owner@acme-pilot.test",
      mfa: true,
      name: "Owner",
      password: "Owner-2026!",
      role: "Владелец"
    });
    assert.equal(payload.tenant.industry, "retail");
    assert.deepEqual(payload.legal, onboardingForm.legal);
    assert.equal("employees" in payload, false);
    assert.equal("testMessage" in payload, false);
    assert.equal(payload.channel.domain, "support.acme-pilot.test");
  });

  it("normalizes billing cadence while preserving a supported selected plan", () => {
    const payload = mapOnboardingFormToProvisionPayload({
      ...onboardingForm,
      plan: { billingCycle: "annual", id: "Starter", trial: true }
    });

    assert.deepEqual(payload.plan, { billingCycle: "monthly", id: "starter" });
  });

  it("does not include the test message step in onboarding completion", () => {
    const completion = getCompletion({
      admin: onboardingForm.admin,
      legal: onboardingForm.legal,
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
      "Организация",
      "Тариф",
      "Администратор",
      "Лимиты",
      "Соглашения"
    ]);
    assert.equal(labels.join(" ").includes("Р"), false);
  });

  it("keeps enterprise out of self-service onboarding tariffs", () => {
    const plans = createOnboardingPlanOptions([
      { id: "free", name: "Free", billingAvailability: "free", includedUsers: 1, features: [] },
      { id: "starter", name: "Starter", billingAvailability: "paid", includedUsers: 3, features: [] },
      { id: "business", name: "Business", billingAvailability: "paid", includedUsers: 15, features: [] },
      { id: "scale", name: "Scale", billingAvailability: "paid", includedUsers: 35, features: [] },
      { id: "enterprise", name: "Enterprise", billingAvailability: "paid", includedUsers: 70, features: [] }
    ]);

    assert.deepEqual(plans.map((plan) => plan.id), ["free", "starter", "business", "scale"]);
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
