import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it, mock } from "node:test";
import {
  auditService,
  authService,
  automationService,
  backendIntegrationService,
  billingService,
  clientService,
  dialogService,
  featureFlagService,
  incidentService,
  integrationService,
  knowledgeService,
  notificationService,
  operationsService,
  permissionService,
  platformMonitoringService,
  publicLeadService,
  qualityService,
  reportService,
  routingService,
  settingsService,
  supportAdminService,
  templateService,
  tenantService,
  visitorService
} from "../src/services/index.js";

import {
  clearServiceAdminSession,
  clearTenantSession,
  setServiceAdminSession,
  setTenantSession
} from "../src/app/sessionStore.js";

const originalFetch = globalThis.fetch;
const TEST_SERVICE_ADMIN_TOKEN = "tok_service_admin_test";

function seedServiceAdminSession() {
  setServiceAdminSession({ accessToken: TEST_SERVICE_ADMIN_TOKEN });
}

function integrationCapabilitiesEnvelope(data = integrationCapabilitiesData()) {
  return {
    ...envelope("backendIntegrationService", "fetchBackendIntegrationSnapshot", data),
    partial: true
  };
}

function integrationCapabilitiesData() {
  const serviceIds = [
    "dialogService",
    "clientService",
    "templateService",
    "reportService",
    "settingsService",
    "integrationService",
    "permissionService",
    "visitorService",
    "automationService",
    "qualityService",
    "auditService",
    "authService",
    "tenantService",
    "billingService",
    "platformMonitoringService",
    "operationsService",
    "supportAdminService",
    "incidentService",
    "featureFlagService"
  ];

  return {
    backlogCoverage: [
      "support_admin_impersonation",
      "feature_flag_rollout_audit",
      "audit_export_redaction"
    ],
    contract: {
      envelope: ["service", "operation", "status", "traceId", "states", "meta", "data", "error"],
      realBackendBoundary: "replace src/services adapters with API clients",
      states: ["loading", "empty", "error", "partial"]
    },
    routeGaps: [],
    services: serviceIds.map((id) => ({
      id,
      note: "Connected to API Gateway routes.",
      operations: [`${id}Operation`],
      status: "ready",
      states: ["loading", "empty", "error", "partial"],
      traceId: `trc_${id}_ready`
    }))
  };
}

afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
  clearServiceAdminSession();
  clearTenantSession();
});

function installFetchMock(responseEnvelope) {
  globalThis.fetch = mock.fn(async () => (
    new Response(JSON.stringify(responseEnvelope), {
      headers: { "content-type": "application/json" },
      status: 200
    })
  ));
}

function assertLastRequest({ body, method, url }) {
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  const [actualUrl, options = {}] = globalThis.fetch.mock.calls[0].arguments;

  assert.equal(actualUrl, url);
  assert.equal(options.method, method);

  if (body === undefined) {
    assert.equal(options.body, undefined);
  } else {
    assert.deepEqual(JSON.parse(options.body), body);
  }
}

function envelope(service, operation, data = {}) {
  return {
    service,
    operation,
    status: "ok",
    partial: false,
    traceId: `trc_${service}_${operation}`,
    updatedAt: "2026-07-01T00:00:00.000Z",
    data,
    error: null,
    states: { loading: false, empty: false, error: false, partial: false },
    meta: { source: "api-gateway" }
  };
}

describe("frontend backend service contracts", () => {
  it("service adapters do not import mockBackend or static data fixtures", () => {
    const serviceFiles = [
      "auditService.js",
      "authService.js",
      "automationService.js",
      "backendIntegrationService.js",
      "billingService.js",
      "clientService.js",
      "dialogService.js",
      "featureFlagService.js",
      "incidentService.js",
      "integrationService.js",
      "knowledgeService.js",
      "notificationService.js",
      "operationsService.js",
      "permissionService.js",
      "platformMonitoringService.js",
      "publicLeadService.js",
      "qualityService.js",
      "reportService.js",
      "routingService.js",
      "settingsService.js",
      "supportAdminService.js",
      "templateService.js",
      "tenantService.js",
      "visitorService.js"
    ];

    for (const fileName of serviceFiles) {
      const source = readFileSync(new URL(`../src/services/${fileName}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /mockBackend\.js/);
      assert.doesNotMatch(source, /\.\.\/data/);
    }
  });

  it("exposes one backend envelope per planned service adapter", async () => {
    installFetchMock(integrationCapabilitiesEnvelope());

    const response = await backendIntegrationService.fetchBackendIntegrationSnapshot();

    assert.equal(response.service, "backendIntegrationService");
    assert.equal(response.status, "ok");
    assert.equal(response.partial, true);
    assert.match(response.traceId, /^trc_backendIntegrationService_/);
    assert.equal(response.states.loading, false);
    assert.equal(response.states.empty, false);

    const serviceIds = response.data.services.map((service) => service.id);
    assert.deepEqual(serviceIds, [
      "dialogService",
      "clientService",
      "templateService",
      "reportService",
      "settingsService",
      "integrationService",
      "permissionService",
      "visitorService",
      "automationService",
      "qualityService",
      "auditService",
      "authService",
      "tenantService",
      "billingService",
      "platformMonitoringService",
      "operationsService",
      "supportAdminService",
      "incidentService",
      "featureFlagService"
    ]);

    for (const service of response.data.services) {
      assert.ok(Array.isArray(service.operations));
      assert.ok(service.operations.length > 0);
      assert.match(service.traceId, /^trc_/);
      assert.ok(["ready", "partial"].includes(service.status));
    }
  });

  it("exposes phase 11 backend envelopes", async () => {
    installFetchMock(integrationCapabilitiesEnvelope());

    const snapshot = await backendIntegrationService.fetchBackendIntegrationSnapshot();
    const serviceIds = snapshot.data.services.map((service) => service.id);

    for (const serviceId of [
      "authService",
      "tenantService",
      "billingService",
      "platformMonitoringService",
      "supportAdminService",
      "incidentService",
      "featureFlagService"
    ]) {
      assert.ok(serviceIds.includes(serviceId), `${serviceId} is present in backend integration registry`);
    }

    assert.ok(snapshot.data.backlogCoverage.includes("support_admin_impersonation"));
    assert.ok(snapshot.data.backlogCoverage.includes("feature_flag_rollout_audit"));
    assert.deepEqual(snapshot.data.routeGaps, []);
  });

  it("auth service calls API Gateway routes", async () => {
    seedServiceAdminSession();
    const cases = [
      [
        () => authService.getAuthState(),
        "/api/v1/auth/state",
        "GET",
        undefined,
        "getAuthState",
        { authenticated: false, authState: "anonymous" }
      ],
      [
        () => authService.login({
          email: "service-admin@example.com",
          password: "correct-password"
        }),
        "/api/v1/auth/login",
        "POST",
        {
          email: "service-admin@example.com",
          password: "correct-password"
        },
        "login",
        { authState: "mfa_required" }
      ],
      [
        () => authService.logout({ reason: "QA logout" }),
        "/api/v1/auth/logout",
        "POST",
        { reason: "QA logout" },
        "logout",
        { authenticated: false }
      ]
    ];

    for (const [callService, expectedUrl, expectedMethod, expectedBody, expectedOperation, data] of cases) {
      installFetchMock(envelope("authService", expectedOperation, data));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, "authService");
      assert.equal(response.operation, expectedOperation);
      assert.deepEqual(response.data, data);
    }
  });

  it("tenant auth service calls API Gateway routes", async () => {
    const operator = {
      id: "op-pilot-001",
      email: "operator@pilot-client.test",
      name: "Pilot Operator"
    };
    const cases = [
      [
        () => authService.loginTenantOperator({
          email: "operator@pilot-client.test",
          password: "Pilot-Operator-2026!"
        }),
        "/api/v1/auth/tenant/login",
        "POST",
        {
          email: "operator@pilot-client.test",
          password: "Pilot-Operator-2026!"
        },
        "loginTenantOperator",
        {
          accessToken: "tok_pilot",
          refreshToken: "ref_pilot",
          tenantId: "tenant-pilot-001",
          operator
        }
      ],
      [
        () => authService.getTenantOperatorState(),
        "/api/v1/auth/tenant/state",
        "GET",
        undefined,
        "getTenantOperatorState",
        { authenticated: true, tenantId: "tenant-pilot-001", operator }
      ],
      [
        () => authService.logoutTenant({ reason: "shift end" }),
        "/api/v1/auth/tenant/logout",
        "POST",
        { reason: "shift end" },
        "logoutTenant",
        { authenticated: false }
      ]
    ];

    for (const [callService, expectedUrl, expectedMethod, expectedBody, expectedOperation, data] of cases) {
      if (expectedOperation === "getTenantOperatorState" || expectedOperation === "logoutTenant") {
        setTenantSession({
          accessToken: "tok_pilot",
          operator,
          tenantId: "tenant-pilot-001"
        });
      }

      installFetchMock(envelope("authService", expectedOperation, data));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, "authService");
      assert.equal(response.operation, expectedOperation);
      assert.deepEqual(response.data, data);
    }
  });

  it("dialog service calls API Gateway routes", async () => {
    const cases = [
      [
        () => dialogService.fetchDialogs({ page: 1, pageSize: 25 }),
        "/api/v1/dialogs?page=1&pageSize=25",
        "GET",
        undefined,
        "fetchDialogs",
        { items: [], pagination: { page: 1, pageSize: 25, total: 0 } }
      ],
      [
        () => dialogService.transitionConversationStatus({
          conversationId: "conv/with space",
          nextStatus: "closed",
          reason: "Resolved"
        }),
        "/api/v1/dialogs/conv%2Fwith%20space/status",
        "PATCH",
        { nextStatus: "closed", reason: "Resolved" },
        "transitionConversationStatus",
        { conversationId: "conv/with space", nextStatus: "closed" }
      ],
      [
        () => dialogService.fetchAssignees(),
        "/api/v1/dialogs/assignees",
        "GET",
        undefined,
        "fetchAssignees",
        { items: [{ id: "operator-1", name: "Operator One", role: "Operator" }] }
      ],
      [
        () => dialogService.assignConversation({
          conversationId: "conv/with space",
          operatorId: "operator-1",
          reason: "Primary queue assignment"
        }),
        "/api/v1/dialogs/conv%2Fwith%20space/assignment",
        "PATCH",
        { operatorId: "operator-1", reason: "Primary queue assignment" },
        "assignConversation",
        { action: "assignment", conversation: { id: "conv/with space", operatorId: "operator-1" } }
      ],
      [
        () => dialogService.uploadAttachment({
          channel: "SDK",
          fileName: "invoice.pdf",
          sizeBytes: 2048
        }),
        "/api/v1/dialogs/attachments",
        "POST",
        { channel: "SDK", fileName: "invoice.pdf", sizeBytes: 2048 },
        "uploadAttachment",
        { id: "attachment_1", storageState: "upload_queued" }
      ],
      [
        () => dialogService.createOutboundConversationRequest({
          channel: "Telegram",
          phone: "+7 900 123-45-67",
          topic: "Delivery follow-up",
          clientName: "Queue Client",
          message: "Follow up"
        }),
        "/api/v1/dialogs/outbound",
        "POST",
        {
          channel: "Telegram",
          phone: "+7 900 123-45-67",
          topic: "Delivery follow-up",
          clientName: "Queue Client",
          message: "Follow up"
        },
        "createOutboundConversationRequest",
        { backendQueueId: "outbound_1", status: "queued" }
      ]
    ];

    for (const [callService, expectedUrl, expectedMethod, expectedBody, expectedOperation, data] of cases) {
      installFetchMock(envelope("dialogService", expectedOperation, data));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, "dialogService");
      assert.equal(response.operation, expectedOperation);
      assert.deepEqual(response.data, data);
    }
  });

  it("admin, billing, monitoring, incidents and feature flag services report API Gateway readiness", () => {
    const readyServices = [
      auditService,
      tenantService,
      billingService,
      platformMonitoringService,
      operationsService,
      supportAdminService,
      incidentService,
      featureFlagService
    ];

    for (const service of readyServices) {
      const readiness = service.getReadiness();
      assert.equal(readiness.status, "ready");
      assert.equal(readiness.note, "Connected to API Gateway routes.");
    }
  });

  it("admin, billing, monitoring, incidents and feature flag services call API Gateway routes", async () => {
    seedServiceAdminSession();
    const cases = [
      [() => auditService.fetchAuditEvents({ source: "channels" }), "auditService", "fetchAuditEvents", "/api/v1/service-admin/audit-events?source=channels", "GET", undefined],
      [() => auditService.exportAuditEvents({ format: "CSV", source: "channels" }), "auditService", "exportAuditEvents", "/api/v1/service-admin/audit-events/exports", "POST", { format: "CSV", source: "channels" }],
      [() => auditService.redactAuditEvent("evt_hook_9006", { reason: "privacy" }), "auditService", "redactAuditEvent", "/api/v1/service-admin/audit-events/evt_hook_9006/redactions", "POST", { reason: "privacy" }],
      [() => tenantService.fetchTenants({ status: "watch" }), "tenantService", "fetchTenants", "/api/v1/tenants?status=watch", "GET", undefined],
      [() => tenantService.fetchTenantDetail("tenant/volga"), "tenantService", "fetchTenantDetail", "/api/v1/tenants/tenant%2Fvolga", "GET", undefined],
      [
        () => tenantService.updateTenantStatus({
          tenantId: "tenant-volga",
          status: "restricted",
          reason: "Security restriction requested"
        }),
        "tenantService",
        "updateTenantStatus",
        "/api/v1/tenants/tenant-volga/status",
        "PATCH",
        { status: "restricted", reason: "Security restriction requested" }
      ],
      [() => billingService.fetchTariffs(), "billingService", "fetchTariffs", "/api/v1/billing/tariffs", "GET", undefined],
      [
        () => billingService.previewTariffChange({
          tenantId: "tenant-volga",
          nextPlanId: "starter",
          reason: "QA downgrade preview"
        }),
        "billingService",
        "previewTariffChange",
        "/api/v1/billing/tenants/tenant-volga/tariff-change/preview",
        "POST",
        { nextPlanId: "starter", reason: "QA downgrade preview" }
      ],
      [
        () => billingService.changeTenantTariff({
          tenantId: "tenant-volga",
          nextPlanId: "starter",
          reason: "QA downgrade preview",
          confirmed: true,
          confirmationText: "CHANGE tenant-volga TO starter"
        }),
        "billingService",
        "changeTenantTariff",
        "/api/v1/billing/tenants/tenant-volga/tariff-change",
        "POST",
        {
          nextPlanId: "starter",
          reason: "QA downgrade preview",
          confirmed: true,
          confirmationText: "CHANGE tenant-volga TO starter"
        }
      ],
      [() => platformMonitoringService.fetchPlatformSnapshot({ status: "degraded" }), "platformMonitoringService", "fetchPlatformSnapshot", "/api/v1/platform-monitoring/snapshot?status=degraded", "GET", undefined],
      [() => platformMonitoringService.fetchComponentDrilldown("cmp/webhooks"), "platformMonitoringService", "fetchComponentDrilldown", "/api/v1/platform-monitoring/components/cmp%2Fwebhooks", "GET", undefined],
      [
        () => platformMonitoringService.acknowledgeComponentAlert({
          componentId: "cmp-webhooks",
          reason: "Platform alert acknowledged"
        }),
        "platformMonitoringService",
        "acknowledgeComponentAlert",
        "/api/v1/platform-monitoring/components/cmp-webhooks/acknowledgements",
        "POST",
        { reason: "Platform alert acknowledged" }
      ],
      [() => operationsService.fetchReadinessDashboard({ domain: "delivery" }), "operationsService", "fetchReadinessDashboard", "/api/v1/operations/readiness?domain=delivery", "GET", undefined],
      [() => supportAdminService.fetchSupportUsers({ query: "agent" }), "supportAdminService", "fetchSupportUsers", "/api/v1/service-admin/users?query=agent", "GET", undefined],
      [
        () => supportAdminService.resetTwoFactor({
          userId: "usr-ns-agent",
          reason: "Phone replaced by employee",
          confirmed: true
        }),
        "supportAdminService",
        "resetTwoFactor",
        "/api/v1/service-admin/users/usr-ns-agent/mfa/reset",
        "POST",
        { reason: "Phone replaced by employee", confirmed: true }
      ],
      [
        () => supportAdminService.forceLogout({
          userId: "usr-ns-agent",
          reason: "Session risk"
        }),
        "supportAdminService",
        "forceLogout",
        "/api/v1/service-admin/users/usr-ns-agent/sessions/logout",
        "POST",
        { reason: "Session risk" }
      ],
      [
        () => supportAdminService.blockUser({
          userId: "usr-ns-agent",
          reason: "Account takeover",
          confirmed: true
        }),
        "supportAdminService",
        "blockUser",
        "/api/v1/service-admin/users/usr-ns-agent/block",
        "POST",
        { reason: "Account takeover", confirmed: true }
      ],
      [
        () => supportAdminService.resendInvite({
          userId: "usr-invite",
          reason: "Invite expired"
        }),
        "supportAdminService",
        "resendInvite",
        "/api/v1/service-admin/users/usr-invite/invite/resend",
        "POST",
        { reason: "Invite expired" }
      ],
      [
        () => supportAdminService.startImpersonation({
          tenantId: "tenant-volga",
          userId: "usr-volga-admin",
          reason: "Customer approved webhook replay check",
          confirmed: true,
          durationMinutes: 15
        }),
        "supportAdminService",
        "startImpersonation",
        "/api/v1/service-admin/impersonations",
        "POST",
        {
          tenantId: "tenant-volga",
          userId: "usr-volga-admin",
          reason: "Customer approved webhook replay check",
          confirmed: true,
          durationMinutes: 15
        }
      ],
      [
        () => supportAdminService.stopImpersonation({
          impersonationId: "imp-123",
          reason: "QA exit reason"
        }),
        "supportAdminService",
        "stopImpersonation",
        "/api/v1/service-admin/impersonations/imp-123/stop",
        "POST",
        { reason: "QA exit reason" }
      ],
      [() => supportAdminService.fetchAiConnections("tenant-volga"), "supportAdminService", "fetchAiConnections", "/api/v1/service-admin/tenants/tenant-volga/ai-connections", "GET", undefined],
      [() => supportAdminService.createAiConnection("tenant-volga", { baseUrl: "https://ai.example.test/v1", chatModel: "small", secret: "secret" }), "supportAdminService", "createAiConnection", "/api/v1/service-admin/tenants/tenant-volga/ai-connections", "POST", { baseUrl: "https://ai.example.test/v1", chatModel: "small", secret: "secret" }],
      [() => supportAdminService.updateAiConnection("tenant-volga", "aic-1", { chatModel: "medium" }), "supportAdminService", "updateAiConnection", "/api/v1/service-admin/tenants/tenant-volga/ai-connections/aic-1", "PATCH", { chatModel: "medium" }],
      [() => supportAdminService.testAiConnection("tenant-volga", "aic-1"), "supportAdminService", "testAiConnection", "/api/v1/service-admin/tenants/tenant-volga/ai-connections/aic-1/test", "POST", undefined],
      [() => supportAdminService.disableAiConnection("tenant-volga", "aic-1"), "supportAdminService", "disableAiConnection", "/api/v1/service-admin/tenants/tenant-volga/ai-connections/aic-1/disable", "POST", undefined],
      [() => supportAdminService.deleteAiConnection("tenant-volga", "aic-1"), "supportAdminService", "deleteAiConnection", "/api/v1/service-admin/tenants/tenant-volga/ai-connections/aic-1", "DELETE", undefined],
      [() => incidentService.fetchIncidents({ status: "open" }), "incidentService", "fetchIncidents", "/api/v1/incidents?status=open", "GET", undefined],
      [() => incidentService.fetchIncidentDetail("inc/webhook"), "incidentService", "fetchIncidentDetail", "/api/v1/incidents/inc%2Fwebhook", "GET", undefined],
      [
        () => incidentService.addIncidentUpdate({
          incidentId: "inc-webhook-retry",
          message: "QA update note",
          reason: "QA incident action",
          confirmed: true,
          status: "monitoring"
        }),
        "incidentService",
        "addIncidentUpdate",
        "/api/v1/incidents/inc-webhook-retry/updates",
        "POST",
        {
          message: "QA update note",
          reason: "QA incident action",
          confirmed: true,
          status: "monitoring"
        }
      ],
      [() => featureFlagService.fetchFeatureFlags({ status: "on" }), "featureFlagService", "fetchFeatureFlags", "/api/v1/feature-flags?status=on", "GET", undefined],
      [
        () => featureFlagService.previewFlagChange({
          flagId: "flag-ai-replies",
          nextRollout: 100,
          nextStatus: "on",
          reason: "QA rollout preview",
          tenantIds: ["tenant-volga"]
        }),
        "featureFlagService",
        "previewFlagChange",
        "/api/v1/feature-flags/flag-ai-replies/preview",
        "POST",
        {
          nextRollout: 100,
          nextStatus: "on",
          reason: "QA rollout preview",
          tenantIds: ["tenant-volga"]
        }
      ],
      [
        () => featureFlagService.updateFeatureFlag({
          flagId: "flag-ai-replies",
          nextRollout: 25,
          nextStatus: "gradual",
          reason: "Standard rollout review"
        }),
        "featureFlagService",
        "updateFeatureFlag",
        "/api/v1/feature-flags/flag-ai-replies",
        "PATCH",
        {
          nextRollout: 25,
          nextStatus: "gradual",
          reason: "Standard rollout review"
        }
      ]
    ];

    for (const [callService, expectedService, expectedOperation, expectedUrl, expectedMethod, expectedBody] of cases) {
      installFetchMock(envelope(expectedService, expectedOperation, { ok: true }));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
    }
  });

  it("admin, billing, monitoring, incidents and feature flag services reject missing route ids without fetch", async () => {
    const cases = [
      [() => tenantService.fetchTenantDetail("  "), "tenantService", "fetchTenantDetail"],
      [() => tenantService.updateTenantStatus({ status: "watch" }), "tenantService", "updateTenantStatus"],
      [() => billingService.previewTariffChange({ nextPlanId: "starter" }), "billingService", "previewTariffChange"],
      [() => billingService.changeTenantTariff({ nextPlanId: "starter" }), "billingService", "changeTenantTariff"],
      [() => platformMonitoringService.fetchComponentDrilldown(""), "platformMonitoringService", "fetchComponentDrilldown"],
      [() => platformMonitoringService.acknowledgeComponentAlert({ reason: "Platform alert acknowledged" }), "platformMonitoringService", "acknowledgeComponentAlert"],
      [() => supportAdminService.resetTwoFactor({ reason: "Phone replaced by employee" }), "supportAdminService", "resetTwoFactor"],
      [() => supportAdminService.forceLogout({ reason: "Session risk" }), "supportAdminService", "forceLogout"],
      [() => supportAdminService.blockUser({ reason: "Account takeover" }), "supportAdminService", "blockUser"],
      [() => supportAdminService.resendInvite({ reason: "Invite expired" }), "supportAdminService", "resendInvite"],
      [() => supportAdminService.stopImpersonation({ reason: "QA exit reason" }), "supportAdminService", "stopImpersonation"],
      [() => supportAdminService.updateAiConnection("tenant-volga", undefined, {}), "supportAdminService", "updateAiConnection"],
      [() => supportAdminService.deleteAiConnection("tenant-volga", ""), "supportAdminService", "deleteAiConnection"],
      [() => supportAdminService.testAiConnection("tenant-volga", null), "supportAdminService", "testAiConnection"],
      [() => supportAdminService.disableAiConnection("tenant-volga", undefined), "supportAdminService", "disableAiConnection"],
      [() => incidentService.fetchIncidentDetail(null), "incidentService", "fetchIncidentDetail"],
      [() => incidentService.addIncidentUpdate({ message: "QA update note" }), "incidentService", "addIncidentUpdate"],
      [() => featureFlagService.previewFlagChange({ nextRollout: 100 }), "featureFlagService", "previewFlagChange"],
      [() => featureFlagService.updateFeatureFlag({ nextStatus: "gradual" }), "featureFlagService", "updateFeatureFlag"],
      [() => dialogService.fetchDialogDetail(undefined), "dialogService", "fetchDialogDetail"],
      [() => dialogService.appendMessage({ text: "hello" }), "dialogService", "appendMessage"],
      [() => dialogService.fetchConversationTimeline("  "), "dialogService", "fetchConversationTimeline"],
      [() => dialogService.finalizeAttachmentUpload({}), "dialogService", "finalizeAttachmentUpload"],
      [() => knowledgeService.refreshSource(undefined), "knowledgeService", "refreshKnowledgeSource"],
      [() => knowledgeService.updateSource("", {}), "knowledgeService", "updateKnowledgeSource"],
      [() => knowledgeService.dismissUnansweredQuestion(null), "knowledgeService", "dismissUnansweredQuestion"],
      [() => knowledgeService.resolveUnansweredQuestion("  ", {}), "knowledgeService", "resolveUnansweredQuestion"]
    ];

    for (const [callService, expectedService, expectedOperation] of cases) {
      globalThis.fetch = mock.fn(async () => {
        throw new Error("fetch should not be called for missing route ids");
      });

      const response = await callService();

      assert.equal(globalThis.fetch.mock.callCount(), 0);
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
      assert.equal(response.status, "error");
      assert.equal(response.error.code, "missing_id");
    }
  });

  it("audit export and redaction call API Gateway routes", async () => {
    seedServiceAdminSession();

    installFetchMock(envelope("auditService", "exportAuditEvents", {
      export: { descriptor: { id: "exp_1" }, sourceEventIds: [], totalRows: 0 }
    }));
    const auditExport = await auditService.exportAuditEvents({ format: "CSV", source: "channels" });
    assertLastRequest({
      body: { format: "CSV", source: "channels" },
      method: "POST",
      url: "/api/v1/service-admin/audit-events/exports"
    });
    assert.equal(auditExport.status, "ok");

    installFetchMock(envelope("auditService", "redactAuditEvent", { eventId: "evt_hook_9006" }));
    const redaction = await auditService.redactAuditEvent("evt_hook_9006", { reason: "privacy" });
    assertLastRequest({
      body: { reason: "privacy" },
      method: "POST",
      url: "/api/v1/service-admin/audit-events/evt_hook_9006/redactions"
    });
    assert.equal(redaction.status, "ok");
  });

  it("keeps service-admin demo access out of browser-writable storage", () => {
    const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const smokeSource = readFileSync(new URL("./smoke.spec.js", import.meta.url), "utf8");

    assert.doesNotMatch(appSource, /VITE_ENABLE_SERVICE_ADMIN|openServiceAdmin|service-admin-entry/);
    assert.doesNotMatch(appSource, /supportServiceAdminSession|sessionStorage|localStorage/);
    assert.doesNotMatch(smokeSource, /supportServiceAdminSession|grantServiceAdminSession/);
  });

  it("converted workspace services report API Gateway readiness", () => {
    const services = [
      clientService,
      templateService,
      reportService,
      integrationService,
      permissionService,
      visitorService,
      automationService,
      qualityService,
      knowledgeService
    ];

    for (const service of services) {
      const readiness = service.getReadiness();
      assert.equal(readiness.status, "ready");
      assert.equal(readiness.note, "Connected to API Gateway routes.");
    }
  });

  it("client, template and report services call API Gateway routes", async () => {
    const exportPayload = {
      channel: "SDK",
      columns: ["metric", "today"],
      filters: { operator: "all", status: "all" },
      period: "Today",
      reportType: "Daily"
    };
    const templatePayload = { id: "tpl-1", title: "Greeting", text: "Hello", topic: "Welcome", channel: "SDK", version: 3 };
    const legacyTemplatePayload = { id: "tpl-legacy", title: "Legacy Greeting", body: "Hello legacy", topic: "Welcome", channel: "Telegram", version: 2 };

    const cases = [
      [() => clientService.fetchClientProfiles({ page: 1 }), "clientService", "fetchClientProfiles", "/api/v1/clients?page=1", "GET", undefined],
      [
        () => clientService.mergeClientProfiles({
          candidate: { id: "maria", channel: "SDK" },
          primary: { id: "maria-main", channel: "Telegram" }
        }),
        "clientService",
        "mergeClientProfiles",
        "/api/v1/clients/merge",
        "POST",
        {
          candidateProfileId: "src_sdk_maria",
          primaryProfileId: "src_telegram_maria-main",
          reason: "Duplicate profile merge requested from client workspace"
        }
      ],
      [
        () => clientService.mergeClientProfiles({
          candidateProfileId: "explicit-candidate",
          primaryProfileId: "explicit-primary",
          candidate: { id: "maria", channel: "SDK", sourceProfileId: "src_profile_candidate" },
          primary: { id: "maria-main", channel: "Telegram", sourceProfileId: "src_profile_primary" },
          reason: "Manual duplicate merge"
        }),
        "clientService",
        "mergeClientProfiles",
        "/api/v1/clients/merge",
        "POST",
        {
          candidateProfileId: "explicit-candidate",
          primaryProfileId: "explicit-primary",
          reason: "Manual duplicate merge"
        }
      ],
      [
        () => clientService.unmergeClientProfile({
          candidate: { id: "maria", channel: "SDK" },
          primary: { id: "maria-main", channel: "Telegram" }
        }),
        "clientService",
        "unmergeClientProfile",
        "/api/v1/clients/unmerge",
        "POST",
        {
          detachedProfileId: "src_sdk_maria",
          primaryProfileId: "src_telegram_maria-main",
          reason: "Profile unmerge requested from client workspace"
        }
      ],
      [
        () => clientService.unmergeClientProfile({
          candidate: { id: "maria", channel: "SDK", sourceProfileId: "src_profile_candidate" },
          primary: { id: "maria-main", channel: "Telegram", sourceProfileId: "src_profile_primary" },
          reason: "Manual profile split"
        }),
        "clientService",
        "unmergeClientProfile",
        "/api/v1/clients/unmerge",
        "POST",
        {
          detachedProfileId: "src_profile_candidate",
          primaryProfileId: "src_profile_primary",
          reason: "Manual profile split"
        }
      ],
      [() => clientService.fetchClientSegments(), "clientService", "fetchClientSegments", "/api/v1/clients/segments", "GET", undefined],
      [
        () => clientService.createClientExport({
          format: "json",
          reason: "Export selected client segment",
          segmentId: "channel:SDK"
        }),
        "clientService",
        "createClientExport",
        "/api/v1/clients/exports",
        "POST",
        {
          format: "json",
          reason: "Export selected client segment",
          segmentId: "channel:SDK"
        }
      ],
      [() => templateService.fetchTemplates({ operatorId: "current" }), "templateService", "fetchTemplates", "/api/v1/templates?operatorId=current", "GET", undefined],
      [() => templateService.saveTemplate(templatePayload), "templateService", "saveTemplate", "/api/v1/templates", "POST", templatePayload],
      [
        () => templateService.saveTemplate(legacyTemplatePayload),
        "templateService",
        "saveTemplate",
        "/api/v1/templates",
        "POST",
        { id: "tpl-legacy", title: "Legacy Greeting", text: "Hello legacy", topic: "Welcome", channel: "Telegram", version: 2 }
      ],
      [() => reportService.fetchReportWorkspace({ period: "Today" }), "reportService", "fetchReportWorkspace", "/api/v1/reports/workspace?period=Today", "GET", undefined],
      [() => reportService.fetchRoutingActivityReport({ eventType: "transfer", period: "7days" }), "reportService", "fetchRoutingActivityReport", "/api/v1/reports/routing-activity?eventType=transfer&period=7days", "GET", undefined],
      [() => reportService.requestReportExport(exportPayload), "reportService", "requestReportExport", "/api/v1/reports/exports", "POST", exportPayload],
      [
        () => reportService.retryReportExport({ jobId: "export-failed", reason: "retry after timeout", rows: 0 }),
        "reportService",
        "retryReportExport",
        "/api/v1/reports/exports/export-failed/retry",
        "POST",
        { reason: "retry after timeout" }
      ],
      [
        () => reportService.getExportFileDescriptor({ id: "export-ready" }),
        "reportService",
        "getExportFileDescriptor",
        "/api/v1/reports/exports/export-ready/file",
        "GET",
        undefined
      ],
      [() => knowledgeService.fetchArticles({ visibility: "all" }), "knowledgeService", "fetchArticles", "/api/v1/knowledge?visibility=all", "GET", undefined],
      [() => knowledgeService.fetchArticle("kb/refund"), "knowledgeService", "fetchArticle", "/api/v1/knowledge/kb%2Frefund", "GET", undefined],
      [
        () => knowledgeService.saveArticleDraft("kb/refund", { body: "Draft", reason: "Draft update" }),
        "knowledgeService",
        "saveArticleDraft",
        "/api/v1/knowledge/kb%2Frefund/drafts",
        "POST",
        { body: "Draft", reason: "Draft update" }
      ],
      [
        () => knowledgeService.submitArticleForReview("kb/refund", { actor: "author", reason: "Ready for review" }),
        "knowledgeService",
        "submitArticleForReview",
        "/api/v1/knowledge/kb%2Frefund/submit-review",
        "POST",
        { actor: "author", reason: "Ready for review" }
      ],
      [
        () => knowledgeService.approveArticle("kb/refund", { actor: "senior", reason: "Approved by owner" }),
        "knowledgeService",
        "approveArticle",
        "/api/v1/knowledge/kb%2Frefund/approve",
        "POST",
        { actor: "senior", reason: "Approved by owner" }
      ],
      [
        () => knowledgeService.publishArticle("kb/refund", { actor: "senior", reason: "Publish to users" }),
        "knowledgeService",
        "publishArticle",
        "/api/v1/knowledge/kb%2Frefund/publish",
        "POST",
        { actor: "senior", reason: "Publish to users" }
      ],
      [
        () => knowledgeService.rejectArticle("kb/refund", { actor: "senior", reason: "Needs legal edits" }),
        "knowledgeService",
        "rejectArticle",
        "/api/v1/knowledge/kb%2Frefund/reject",
        "POST",
        { actor: "senior", reason: "Needs legal edits" }
      ],
      [
        () => knowledgeService.archiveArticle("kb/refund", { actor: "senior", reason: "Replaced by new article" }),
        "knowledgeService",
        "archiveArticle",
        "/api/v1/knowledge/kb%2Frefund/archive",
        "POST",
        { actor: "senior", reason: "Replaced by new article" }
      ],
      [
        () => knowledgeService.addArticleAttachment("kb/refund", { attachment: { name: "policy.pdf" }, reason: "Policy attachment" }),
        "knowledgeService",
        "addArticleAttachment",
        "/api/v1/knowledge/kb%2Frefund/attachments",
        "POST",
        { attachment: { name: "policy.pdf" }, reason: "Policy attachment" }
      ],
      [
        () => knowledgeService.deleteArticleAttachment({ articleId: "kb/refund", attachmentId: "att/policy", reason: "Outdated policy" }),
        "knowledgeService",
        "deleteArticleAttachment",
        "/api/v1/knowledge/kb%2Frefund/attachments/att%2Fpolicy",
        "DELETE",
        { reason: "Outdated policy" }
      ]
    ];

    for (const [callService, expectedService, expectedOperation, expectedUrl, expectedMethod, expectedBody] of cases) {
      installFetchMock(envelope(expectedService, expectedOperation, { ok: true }));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
    }
  });

  it("downloads report export files through the binary API route", async () => {
    setTenantSession({ accessToken: "tok_tenant_report_download" });
    globalThis.fetch = mock.fn(async () => (
      new Response("metric,today\r\nNew,486", {
        headers: {
          "content-disposition": "attachment; filename=\"download-runtime.csv\"",
          "content-length": "20",
          "content-type": "text/csv"
        },
        status: 200
      })
    ));

    const response = await reportService.downloadExportFile({ id: "export-ready" });

    assertLastRequest({
      method: "GET",
      url: "/api/v1/reports/exports/export-ready/download"
    });
    assert.equal(globalThis.fetch.mock.calls[0].arguments[1].headers.authorization, "Bearer tok_tenant_report_download");
    assert.equal(response.status, "ok");
    assert.equal(response.operation, "downloadExportFile");
    assert.equal(response.data.fileName, "download-runtime.csv");
    assert.equal(response.data.contentType, "text/csv");
    assert.equal(response.data.sizeBytes, 20);
    assert.equal(await response.data.blob.text(), "metric,today\r\nNew,486");
  });

  it("report, integration and automation services reject missing route ids without fetch", async () => {
    const cases = [
      [() => reportService.retryReportExport({ reason: "retry after timeout" }), "reportService", "retryReportExport"],
      [() => reportService.getExportFileDescriptor({}), "reportService", "getExportFileDescriptor"],
      [() => reportService.downloadExportFile({}), "reportService", "downloadExportFile"],
      [() => integrationService.rotateApiKey("  "), "integrationService", "rotateApiKey"],
      [() => integrationService.replayWebhookDelivery({ traceId: "hook_vk_441" }), "integrationService", "replayWebhookDelivery"],
      [() => integrationService.revokeSecuritySession(""), "integrationService", "revokeSecuritySession"],
      [() => integrationService.updateChannelConnection({ name: "Telegram VIP" }), "integrationService", "updateChannelConnection"],
      [() => integrationService.updateChannelTypeStatus({ enabled: false, reason: "disable aggregate" }), "integrationService", "updateChannelTypeStatus"],
      [() => integrationService.deleteChannelConnection({ reason: "retired" }), "integrationService", "deleteChannelConnection"],
      [() => integrationService.testChannelConnectionInstance({ recipient: "+7 900 123-45-67" }), "integrationService", "testChannelConnectionInstance"],
      [() => integrationService.fetchChannelConnectionEvents(""), "integrationService", "fetchChannelConnectionEvents"],
      [() => settingsService.updateEmployee({ roleKey: "senior" }), "settingsService", "updateEmployee"],
      [() => settingsService.resetEmployeePassword({ reason: "reset" }), "settingsService", "resetEmployeePassword"],
      [() => settingsService.resetEmployeeMfa({ reason: "reset" }), "settingsService", "resetEmployeeMfa"],
      [() => settingsService.deactivateEmployee({ reason: "offboard" }), "settingsService", "deactivateEmployee"],
      [() => settingsService.updateTopic({ name: "Delay" }), "settingsService", "updateTopic"],
      [() => settingsService.archiveTopic({ reason: "Duplicate" }), "settingsService", "archiveTopic"],
      [() => settingsService.restoreTopic({ reason: "Needed" }), "settingsService", "restoreTopic"],
      [() => settingsService.fetchTopicUsage(""), "settingsService", "fetchTopicUsage"],
      [() => settingsService.updateRule({ enabled: false }), "settingsService", "updateRule"],
      [() => settingsService.testRule({ sampleSize: 50 }), "settingsService", "testRule"],
      [() => automationService.publishBotScenario({ name: "Checkout bot" }), "automationService", "publishBotScenario"],
      [() => automationService.testBotScenario({ name: "Checkout bot" }), "automationService", "testBotScenario"],
      [() => knowledgeService.fetchArticle(""), "knowledgeService", "fetchArticle"],
      [() => knowledgeService.saveArticleDraft("", { body: "Draft" }), "knowledgeService", "saveArticleDraft"],
      [() => knowledgeService.submitArticleForReview("", { reason: "Ready for review" }), "knowledgeService", "submitArticleForReview"],
      [() => knowledgeService.approveArticle("", { reason: "Approved" }), "knowledgeService", "approveArticle"],
      [() => knowledgeService.publishArticle("", { reason: "Publish" }), "knowledgeService", "publishArticle"],
      [() => knowledgeService.rejectArticle("", { reason: "Reject" }), "knowledgeService", "rejectArticle"],
      [() => knowledgeService.archiveArticle("", { reason: "Archive" }), "knowledgeService", "archiveArticle"],
      [() => knowledgeService.addArticleAttachment("", { attachment: { name: "file.pdf" }, reason: "Attach" }), "knowledgeService", "addArticleAttachment"],
      [() => knowledgeService.deleteArticleAttachment({ articleId: "", attachmentId: "att-1", reason: "Delete" }), "knowledgeService", "deleteArticleAttachment"],
      [() => knowledgeService.deleteArticleAttachment({ articleId: "kb-refund", reason: "Delete" }), "knowledgeService", "deleteArticleAttachment"]
    ];

    for (const [callService, expectedService, expectedOperation] of cases) {
      globalThis.fetch = mock.fn(async () => {
        throw new Error("fetch should not be called for missing route ids");
      });

      const response = await callService();

      assert.equal(globalThis.fetch.mock.callCount(), 0);
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
      assert.equal(response.status, "error");
      assert.equal(response.error.code, "missing_id");
    }
  });

  it("integration and permission services call API Gateway routes", async () => {
    const permissionPayload = {
      action: "settings.manage",
      resource: "settings",
      roleMode: "employee"
    };

    const cases = [
      [() => integrationService.fetchIntegrationWorkspace(), "integrationService", "fetchIntegrationWorkspace", "/api/v1/integrations/workspace", "GET", undefined],
      [() => integrationService.fetchChannelConnections({ type: "telegram" }), "integrationService", "fetchChannelConnections", "/api/v1/integrations/channels?type=telegram", "GET", undefined],
      [
        () => integrationService.createChannelConnection({
          type: "telegram",
          name: "Telegram VIP",
          environment: "production",
          credentials: { botToken: "123:secret" },
          routingQueueId: "queue-vip",
          chatLimit: 8
        }),
        "integrationService",
        "createChannelConnection",
        "/api/v1/integrations/channels",
        "POST",
        {
          type: "telegram",
          name: "Telegram VIP",
          environment: "production",
          credentials: { botToken: "123:secret" },
          routingQueueId: "queue-vip",
          chatLimit: 8
        }
      ],
      [
        () => integrationService.updateChannelConnection({
          connectionId: "conn_tg_vip",
          status: "paused",
          reason: "maintenance window"
        }),
        "integrationService",
        "updateChannelConnection",
        "/api/v1/integrations/channels/conn_tg_vip",
        "PATCH",
        { status: "paused", reason: "maintenance window" }
      ],
      [
        () => integrationService.updateChannelTypeStatus({
          type: "telegram",
          enabled: false,
          reason: "Settings aggregate channel disabled"
        }),
        "integrationService",
        "updateChannelTypeStatus",
        "/api/v1/integrations/channels/types/telegram/status",
        "PATCH",
        { enabled: false, reason: "Settings aggregate channel disabled" }
      ],
      [
        () => integrationService.deleteChannelConnection({
          connectionId: "conn_tg_vip",
          reason: "retired bot"
        }),
        "integrationService",
        "deleteChannelConnection",
        "/api/v1/integrations/channels/conn_tg_vip",
        "DELETE",
        { reason: "retired bot" }
      ],
      [
        () => integrationService.testChannelConnectionInstance({
          connectionId: "conn_tg_vip",
          mode: "send",
          recipient: "+7 900 123-45-67",
          message: "channel smoke"
        }),
        "integrationService",
        "testChannelConnectionInstance",
        "/api/v1/integrations/channels/conn_tg_vip/test",
        "POST",
        {
          mode: "send",
          recipient: "+7 900 123-45-67",
          message: "channel smoke"
        }
      ],
      [() => integrationService.fetchChannelConnectionEvents("conn_tg_vip"), "integrationService", "fetchChannelConnectionEvents", "/api/v1/integrations/channels/conn_tg_vip/events", "GET", undefined],
      [
        () => integrationService.testChannelConnection({
          channel: { id: "vk", connections: [{ rawId: "conn_vk_main" }] },
          environment: "sandbox",
          message: "channel smoke",
          recipient: "+7 900 123-45-67"
        }),
        "integrationService",
        "testChannelConnection",
        "/api/v1/integrations/channel-tests",
        "POST",
        {
          channelId: "vk",
          connectionId: "conn_vk_main",
          environment: "sandbox",
          message: "channel smoke",
          mode: "receive",
          recipient: "+7 900 123-45-67"
        }
      ],
      [() => integrationService.rotateApiKey("prod-key"), "integrationService", "rotateApiKey", "/api/v1/integrations/api-keys/prod-key/rotate", "POST", undefined],
      [
        () => integrationService.replayWebhookDelivery({ deliveryId: "dlv-441", idempotencyKey: "idem-1", traceId: "hook_vk_441" }),
        "integrationService",
        "replayWebhookDelivery",
        "/api/v1/integrations/webhooks/deliveries/dlv-441/replay",
        "POST",
        { idempotencyKey: "idem-1" }
      ],
      [() => integrationService.revokeSecuritySession("sess-risk"), "integrationService", "revokeSecuritySession", "/api/v1/integrations/security/sessions/sess-risk/revoke", "POST", undefined],
      [() => permissionService.validatePermission(permissionPayload), "permissionService", "validatePermission", "/api/v1/permissions/validate", "POST", permissionPayload],
      [() => permissionService.fetchPermissionModel(), "permissionService", "fetchPermissionModel", "/api/v1/permissions/model", "GET", undefined]
    ];

    for (const [callService, expectedService, expectedOperation, expectedUrl, expectedMethod, expectedBody] of cases) {
      installFetchMock(envelope(expectedService, expectedOperation, { ok: true }));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
    }
  });

  it("settings service calls employee, role and group API Gateway routes", async () => {
    seedServiceAdminSession();
    const employeeUpdate = {
      employeeId: "usr-ns-agent",
      roleKey: "senior",
      groupId: "group-vip",
      channels: ["Telegram", "MAX"],
      chatLimit: 9,
      canOverride: true,
      sensitiveData: true
    };
    const invitePayload = {
      email: "new.agent@northstar.example",
      groupId: "group-line-1",
      name: "New Agent",
      roleKey: "employee"
    };
    const groupPayload = {
      groupId: "group-vip",
      name: "VIP",
      channels: ["Telegram"],
      memberIds: ["usr-ns-agent"]
    };
    const cases = [
      [() => settingsService.fetchEmployees({ status: "active" }), "fetchEmployees", "/api/v1/settings/employees?status=active", "GET", undefined],
      [() => settingsService.inviteEmployee(invitePayload), "inviteEmployee", "/api/v1/settings/employees/invites", "POST", invitePayload],
      [() => settingsService.updateEmployee(employeeUpdate), "updateEmployee", "/api/v1/settings/employees/usr-ns-agent", "PATCH", {
        roleKey: "senior",
        groupId: "group-vip",
        channels: ["Telegram", "MAX"],
        chatLimit: 9,
        canOverride: true,
        sensitiveData: true
      }],
      [() => settingsService.resetEmployeePassword({ employeeId: "usr-ns-agent", reason: "Operator requested reset" }), "resetEmployeePassword", "/api/v1/settings/employees/usr-ns-agent/password-reset", "POST", { reason: "Operator requested reset" }],
      [() => settingsService.resetEmployeeMfa({ employeeId: "usr-ns-agent", reason: "Phone replacement" }), "resetEmployeeMfa", "/api/v1/settings/employees/usr-ns-agent/mfa-reset", "POST", { reason: "Phone replacement" }],
      [() => settingsService.deactivateEmployee({ employeeId: "usr-ns-agent", reason: "Offboarding" }), "deactivateEmployee", "/api/v1/settings/employees/usr-ns-agent/deactivate", "POST", { reason: "Offboarding" }],
      [() => settingsService.fetchRoles(), "fetchRoles", "/api/v1/settings/roles", "GET", undefined],
      [() => settingsService.fetchGroups(), "fetchGroups", "/api/v1/settings/groups", "GET", undefined],
      [() => settingsService.createGroup({ name: "VIP", channels: ["Telegram"] }), "createGroup", "/api/v1/settings/groups", "POST", { name: "VIP", channels: ["Telegram"] }],
      [() => settingsService.updateGroup(groupPayload), "updateGroup", "/api/v1/settings/groups/group-vip", "PATCH", {
        name: "VIP",
        channels: ["Telegram"],
        memberIds: ["usr-ns-agent"]
      }],
      [() => settingsService.fetchTopics({ status: "active" }), "fetchTopics", "/api/v1/workspace/topics?status=active", "GET", undefined],
      [() => settingsService.createTopic({ groupName: "Заказ", branchName: "Статус", name: "Перенос доставки" }), "createTopic", "/api/v1/workspace/topics", "POST", { groupName: "Заказ", branchName: "Статус", name: "Перенос доставки" }],
      [() => settingsService.updateTopic({ topicId: "topic-delivery-delay", required: false }), "updateTopic", "/api/v1/workspace/topics/topic-delivery-delay", "PATCH", { required: false }],
      [() => settingsService.archiveTopic({ topicId: "topic-delivery-delay", reason: "Duplicate" }), "archiveTopic", "/api/v1/workspace/topics/topic-delivery-delay/archive", "POST", { reason: "Duplicate" }],
      [() => settingsService.restoreTopic({ topicId: "topic-delivery-delay", reason: "Needed" }), "restoreTopic", "/api/v1/workspace/topics/topic-delivery-delay/restore", "POST", { reason: "Needed" }],
      [() => settingsService.fetchTopicUsage("topic-delivery-delay"), "fetchTopicUsage", "/api/v1/workspace/topics/topic-delivery-delay/usage", "GET", undefined],
      [() => settingsService.fetchRules(), "fetchRules", "/api/v1/settings/rules", "GET", undefined],
      [() => settingsService.updateRule({ ruleId: "operator-chat-limit", enabled: false, reason: "Maintenance" }), "updateRule", "/api/v1/settings/rules/operator-chat-limit", "PATCH", { enabled: false, reason: "Maintenance" }],
      [() => settingsService.testRule({ ruleId: "operator-chat-limit", sampleSize: 50 }), "testRule", "/api/v1/settings/rules/operator-chat-limit/test", "POST", { sampleSize: 50 }]
    ];

    for (const [callService, expectedOperation, expectedUrl, expectedMethod, expectedBody] of cases) {
      installFetchMock(envelope("settingsService", expectedOperation, { ok: true }));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, "settingsService");
      assert.equal(response.operation, expectedOperation);
    }
  });

  it("visitor, automation and quality services call API Gateway routes", async () => {
    const proactiveRule = {
      id: "rule-checkout",
      channels: ["SDK", "Telegram"],
      activeVariant: "B",
      cooldown: "24h"
    };
    const rescueChat = {
      id: "rescue-vk",
      channel: "VK",
      client: "Queue VK",
      nextAction: "Return to operator",
      operator: "Nina",
      priority: "critical",
      timer: "02:00"
    };
    const flowImport = '{"name":"Broken","flowNodes":[{"id":"bad","type":"bad_type"}]}';
    const botScenario = {
      id: "bot-checkout",
      name: "Checkout bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: []
    };
    const qualityDraft = { conversationId: "conv-1", text: "Need help" };

    const cases = [
      [() => visitorService.fetchVisitorWorkspace(), "visitorService", "fetchVisitorWorkspace", "/api/v1/automation/visitor-workspace", "GET", undefined],
      [() => visitorService.saveProactiveRule(proactiveRule), "visitorService", "saveProactiveRule", "/api/v1/automation/proactive-rules", "POST", proactiveRule],
      [
        () => visitorService.triggerRescueReturn(rescueChat),
        "visitorService",
        "triggerRescueReturn",
        "/api/v1/automation/handoff-events",
        "POST",
        {
          botId: "bot-rescue-vk",
          conversationId: "rescue-vk",
          queue: "VK",
          reason: "Return to operator",
          collectedFields: {
            client: "Queue VK",
            channel: "VK",
            operator: "Nina",
            priority: "critical",
            timer: "02:00",
            nextAction: "Return to operator"
          }
        },
        { summary: { queue: "VK", reason: "Return to operator" }, eventId: "handoff_1" }
      ],
      [() => automationService.fetchAutomationWorkspace(), "automationService", "fetchAutomationWorkspace", "/api/v1/automation/workspace", "GET", undefined],
      [() => automationService.validateBotFlowImport(flowImport), "automationService", "validateBotFlowImport", "/api/v1/automation/bot-flow/validate", "POST", flowImport],
      [() => automationService.publishBotScenario(botScenario), "automationService", "publishBotScenario", "/api/v1/automation/bot-scenarios/bot-checkout/publish", "POST", botScenario],
      [() => automationService.testBotScenario(botScenario), "automationService", "testBotScenario", "/api/v1/automation/bot-scenarios/bot-checkout/test-runs", "POST", botScenario],
      [() => qualityService.fetchQualityWorkspace(), "qualityService", "fetchQualityWorkspace", "/api/v1/quality/workspace", "GET", undefined],
      [() => qualityService.scoreDraftResponse(qualityDraft), "qualityService", "scoreDraftResponse", "/api/v1/quality/draft-score", "POST", qualityDraft],
      [() => qualityService.scoreDraftResponses(qualityDraft), "qualityService", "scoreDraftResponses", "/api/v1/quality/draft-scores", "POST", qualityDraft],
      [
        () => qualityService.recordManualQaReview({ conversationId: "conv-1", reviewer: "senior-qa", score: 82 }),
        "qualityService",
        "recordManualQaReview",
        "/api/v1/quality/manual-reviews",
        "POST",
        { conversationId: "conv-1", reviewer: "senior-qa", score: 82 }
      ]
    ];

    for (const [callService, expectedService, expectedOperation, expectedUrl, expectedMethod, expectedBody, data = { ok: true }] of cases) {
      installFetchMock(envelope(expectedService, expectedOperation, data));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
    }
  });

  it("routing service calls redistribution API Gateway routes", async () => {
    setTenantSession({ accessToken: "tenant-token", tenantId: "tenant-volga" });
    const previewPayload = {
      idempotencyKey: "routing-redist-preview",
      reason: "Preview SLA risk rebalance",
      selectedQueues: ["VK"],
      targetRule: "least_loaded"
    };
    const commitPayload = {
      idempotencyKey: "routing-redist-commit",
      previewId: "routing_redist_preview",
      reason: "Commit SLA risk rebalance",
      selectedQueues: ["VK"],
      targetRule: "least_loaded"
    };
    const cases = [
      [
        () => routingService.previewRedistribution(previewPayload),
        "previewRedistribution",
        "/api/v1/routing/redistribution/preview",
        previewPayload
      ],
      [
        () => routingService.commitRedistribution(commitPayload),
        "commitRedistribution",
        "/api/v1/routing/redistribution/commit",
        commitPayload
      ]
    ];

    for (const [callService, expectedOperation, expectedUrl, expectedBody] of cases) {
      installFetchMock(envelope("routingService", expectedOperation, {
        appliedAssignments: [{ conversationId: "alexey", targetOperatorId: "operator-anna" }],
        auditEvent: { id: "evt_routing_redist", immutable: true },
        redistributionId: "routing_redist_backend"
      }));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: "POST",
        url: expectedUrl
      });
      assert.equal(response.service, "routingService");
      assert.equal(response.operation, expectedOperation);
    }
  });

  it("public lead service submits demo requests without tenant or service-admin auth", async () => {
    setTenantSession({ accessToken: "tenant-token", tenantId: "tenant-volga" });
    seedServiceAdminSession();
    const payload = {
      company: "Acme Retail",
      consent: true,
      email: "owner@acme.example",
      message: "Need a demo for 20 operators.",
      name: "Jane Owner",
      planInterest: "Growth",
      source: "landing-hero",
      website: ""
    };
    installFetchMock(envelope("publicLeadService", "createDemoRequest", {
      accepted: true,
      leadId: "demo_req_test",
      notificationDescriptor: { status: "queued" }
    }));

    const response = await publicLeadService.createDemoRequest(payload);

    assert.equal(globalThis.fetch.mock.callCount(), 1);
    const [actualUrl, options = {}] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(actualUrl, "/api/v1/public/demo-requests");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers["x-demo-service-admin-key"], undefined);
    assert.equal(response.service, "publicLeadService");
    assert.equal(response.operation, "createDemoRequest");
  });

  it("notification service calls API Gateway routes", async () => {
    setTenantSession({ accessToken: "tenant-token" });

    const cases = [
      [() => notificationService.fetchNotifications(), "notificationService", "fetchNotifications", "/api/v1/notifications", "GET", undefined],
      [
        () => notificationService.markNotificationsRead({ notificationIds: ["notif-sla-vladimir"] }),
        "notificationService",
        "markNotificationsRead",
        "/api/v1/notifications/mark-read",
        "POST",
        { notificationIds: ["notif-sla-vladimir"] }
      ],
      [
        () => notificationService.fetchNotificationPreferences(),
        "notificationService",
        "fetchNotificationPreferences",
        "/api/v1/notifications/preferences",
        "GET",
        undefined
      ],
      [
        () => notificationService.updateNotificationPreferences({
          mutedTypeKeys: ["channel"],
          browserPushEnabled: true,
          mutedSoundRuleIds: ["sound-mention"],
          enabledExternalChannelIds: ["email-digest"]
        }),
        "notificationService",
        "updateNotificationPreferences",
        "/api/v1/notifications/preferences",
        "PATCH",
        {
          mutedTypeKeys: ["channel"],
          browserPushEnabled: true,
          mutedSoundRuleIds: ["sound-mention"],
          enabledExternalChannelIds: ["email-digest"]
        }
      ],
      [
        () => notificationService.fetchBrowserPushPublicKey(),
        "notificationService",
        "fetchBrowserPushPublicKey",
        "/api/v1/notifications/push-subscriptions/public-key",
        "GET",
        undefined,
        { publicKey: "BJ0dA02pytrMj9D5Olp1WM4xuJ-PQIZeq01YMWSX0J6gOLWoLHhbnzLZfivD_SlSjEKBDr1a-B80aXSdYHUTyEE" }
      ],
      [
        () => notificationService.createBrowserPushSubscription({
          endpoint: "https://push.example.test/subscription/volga-admin",
          expirationTime: null,
          keys: {
            auth: "auth-secret",
            p256dh: "p256dh-key"
          }
        }),
        "notificationService",
        "createBrowserPushSubscription",
        "/api/v1/notifications/push-subscriptions",
        "POST",
        {
          endpoint: "https://push.example.test/subscription/volga-admin",
          expirationTime: null,
          keys: {
            auth: "auth-secret",
            p256dh: "p256dh-key"
          }
        },
        { subscription: { id: "push_sub_backend" } }
      ],
      [
        () => notificationService.deleteBrowserPushSubscription("push/sub 1"),
        "notificationService",
        "deleteBrowserPushSubscription",
        "/api/v1/notifications/push-subscriptions/push%2Fsub%201",
        "DELETE",
        undefined,
        { subscription: { id: "push/sub 1", status: "revoked" } }
      ],
      [
        () => notificationService.sendCriticalAlertTest({ message: "Notification route smoke" }),
        "notificationService",
        "sendCriticalAlertTest",
        "/api/v1/notifications/test-critical-alert",
        "POST",
        { message: "Notification route smoke" }
      ]
    ];

    for (const [callService, expectedService, expectedOperation, expectedUrl, expectedMethod, expectedBody, data = { items: [] }] of cases) {
      installFetchMock(envelope(expectedService, expectedOperation, data));

      const response = await callService();
      assertLastRequest({
        body: expectedBody,
        method: expectedMethod,
        url: expectedUrl
      });
      assert.equal(response.service, expectedService);
      assert.equal(response.operation, expectedOperation);
    }
  });

});
