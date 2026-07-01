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
  permissionService,
  platformMonitoringService,
  qualityService,
  reportService,
  supportAdminService,
  templateService,
  tenantService,
  visitorService
} from "../src/services/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
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
      "permissionService.js",
      "platformMonitoringService.js",
      "qualityService.js",
      "reportService.js",
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
    assert.deepEqual(snapshot.data.routeGaps, [
      {
        service: "auditService",
        operations: ["exportAuditEvents", "redactAuditEvent"],
        routes: [
          "POST /service-admin/audit-events/exports",
          "POST /service-admin/audit-events/:eventId/redactions"
        ]
      }
    ]);
  });

  it("auth service calls API Gateway routes", async () => {
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
      tenantService,
      billingService,
      platformMonitoringService,
      supportAdminService,
      incidentService,
      featureFlagService
    ];

    for (const service of readyServices) {
      const readiness = service.getReadiness();
      assert.equal(readiness.status, "ready");
      assert.equal(readiness.note, "Connected to API Gateway routes.");
    }

    const auditReadiness = auditService.getReadiness();
    assert.equal(auditReadiness.status, "partial");
    assert.match(auditReadiness.note, /fetchAuditEvents/);
    assert.ok(auditReadiness.backlog.includes("audit_export_route"));
    assert.ok(auditReadiness.backlog.includes("audit_redaction_route"));
  });

  it("admin, billing, monitoring, incidents and feature flag services call API Gateway routes", async () => {
    const cases = [
      [() => auditService.fetchAuditEvents({ source: "channels" }), "auditService", "fetchAuditEvents", "/api/v1/service-admin/audit-events?source=channels", "GET", undefined],
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
      [() => incidentService.fetchIncidentDetail(null), "incidentService", "fetchIncidentDetail"],
      [() => incidentService.addIncidentUpdate({ message: "QA update note" }), "incidentService", "addIncidentUpdate"],
      [() => featureFlagService.previewFlagChange({ nextRollout: 100 }), "featureFlagService", "previewFlagChange"],
      [() => featureFlagService.updateFeatureFlag({ nextStatus: "gradual" }), "featureFlagService", "updateFeatureFlag"]
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

  it("audit export and redaction return explicit missing-route envelopes without mock data", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("fetch should not be called for missing audit routes");
    });

    const auditExport = await auditService.exportAuditEvents({ format: "CSV", source: "channels" });
    const redaction = await auditService.redactAuditEvent("evt_hook_9006", { reason: "privacy" });

    assert.equal(globalThis.fetch.mock.callCount(), 0);
    assert.equal(auditExport.service, "auditService");
    assert.equal(auditExport.operation, "exportAuditEvents");
    assert.equal(auditExport.status, "error");
    assert.equal(auditExport.error.code, "api_route_missing");
    assert.equal(auditExport.data, null);
    assert.equal(redaction.service, "auditService");
    assert.equal(redaction.operation, "redactAuditEvent");
    assert.equal(redaction.status, "error");
    assert.equal(redaction.error.code, "api_route_missing");
    assert.equal(redaction.data, null);
  });

  it("keeps service-admin demo access out of browser-writable storage", () => {
    const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    const smokeSource = readFileSync(new URL("./smoke.spec.js", import.meta.url), "utf8");

    assert.match(appSource, /VITE_ENABLE_SERVICE_ADMIN/);
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
      qualityService
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

  it("report, integration and automation services reject missing route ids without fetch", async () => {
    const cases = [
      [() => reportService.retryReportExport({ reason: "retry after timeout" }), "reportService", "retryReportExport"],
      [() => reportService.getExportFileDescriptor({}), "reportService", "getExportFileDescriptor"],
      [() => integrationService.rotateApiKey("  "), "integrationService", "rotateApiKey"],
      [() => integrationService.replayWebhookDelivery({ traceId: "hook_vk_441" }), "integrationService", "replayWebhookDelivery"],
      [() => integrationService.revokeSecuritySession(""), "integrationService", "revokeSecuritySession"],
      [() => automationService.publishBotScenario({ name: "Checkout bot" }), "automationService", "publishBotScenario"],
      [() => automationService.testBotScenario({ name: "Checkout bot" }), "automationService", "testBotScenario"]
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
      [() => visitorService.fetchVisitorWorkspace(), "visitorService", "fetchVisitorWorkspace", "/api/v1/automation/workspace", "GET", undefined],
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
      [() => qualityService.scoreDraftResponse(qualityDraft), "qualityService", "scoreDraftResponse", "/api/v1/quality/draft-score", "POST", qualityDraft]
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

});
