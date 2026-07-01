import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { clearSession, setSession } from "../src/app/sessionStore.js";
import { configureApiClientForTests, resetApiClientTestConfig } from "../src/services/apiClient.js";
import {
  mapOnboardingFormToProvisionPayload,
  tenantProvisionService
} from "../src/services/tenantProvisionService.js";

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
  }
};

describe("tenant provision service", () => {
  afterEach(() => {
    mock.restoreAll();
    clearSession();
    resetApiClientTestConfig();
    globalThis.fetch = originalFetch;
  });

  it("maps onboarding form state to the tenant provision API body", () => {
    const payload = mapOnboardingFormToProvisionPayload(onboardingForm);

    assert.deepEqual(payload, {
      tenant: {
        name: "Acme Pilot",
        slug: "acme-pilot",
        region: "ru-1"
      },
      admin: {
        name: "Owner",
        email: "owner@acme-pilot.test",
        password: "Owner-2026!"
      },
      plan: {
        id: "trial",
        trial: true
      }
    });
  });

  it("posts mapped onboarding payload to /api/v1/tenants/provision", async () => {
    configureApiClientForTests({ mode: "test" });

    globalThis.fetch = mock.fn(async (url, options) => {
      assert.equal(url, "/api/v1/tenants/provision");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["content-type"], "application/json");
      assert.equal(options.headers["x-demo-service-admin-key"], "dev-service-admin-key");
      assert.deepEqual(JSON.parse(options.body), mapOnboardingFormToProvisionPayload(onboardingForm));

      return new Response(JSON.stringify({
        service: "tenantProvisionService",
        operation: "provisionOrganization",
        status: "ok",
        partial: false,
        traceId: "trc_tenant_provision",
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: {
          tenant: {
            id: "tenant-acme-pilot",
            name: "Acme Pilot",
            slug: "acme-pilot",
            region: "ru-1",
            planId: "trial",
            status: "trial"
          },
          admin: {
            id: "usr-owner",
            email: "owner@acme-pilot.test",
            name: "Owner",
            tenantId: "tenant-acme-pilot"
          },
          publicApiKey: "sk_stage_abc123",
          embedSnippet: '<script src="https://example.test/sdk.js" data-api-key="sk_stage_abc123"></script>'
        },
        error: null,
        states: { loading: false, empty: false, error: false, partial: false },
        meta: { source: "api-gateway" }
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
    assert.equal(response.data.tenant.id, "tenant-acme-pilot");
    assert.equal(response.data.publicApiKey, "sk_stage_abc123");
  });

  it("uses service-admin demo auth instead of an existing tenant operator bearer", async () => {
    configureApiClientForTests({
      demoServiceAdminKey: "pilot-local-service-admin-key",
      enableServiceAdminDemo: true,
      mode: "production"
    });
    setSession({
      accessToken: "tenant-operator-token",
      tenantId: "tenant-existing",
      operator: { email: "operator@example.test" }
    });

    globalThis.fetch = mock.fn(async (_url, options) => {
      assert.equal("authorization" in options.headers, false);
      assert.equal(options.headers["x-demo-service-admin-key"], "pilot-local-service-admin-key");
      assert.equal(options.headers["x-demo-service-admin-permissions"], "*");

      return new Response(JSON.stringify({
        status: "ok",
        data: {
          tenant: { id: "tenant-acme-pilot" },
          publicApiKey: "sk_stage_abc123"
        }
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });

    const response = await tenantProvisionService.provisionOrganization(
      mapOnboardingFormToProvisionPayload(onboardingForm)
    );

    assert.equal(response.status, "ok");
  });
});
