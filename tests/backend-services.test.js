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

  it("tenant and billing services enforce scope and tariff preview", async () => {
    const tenants = await tenantService.fetchTenants({ status: "watch" });
    assert.equal(tenants.service, "tenantService");
    assert.ok(tenants.data.items.every((tenant) => tenant.status === "watch"));

    const detail = await tenantService.fetchTenantDetail("tenant-volga");
    assert.equal(detail.status, "ok");
    assert.equal(detail.data.tenant.id, "tenant-volga");
    assert.ok(detail.data.users.length > 0);
    assert.ok(detail.data.incidents.length > 0);

    const preview = await billingService.previewTariffChange({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "QA downgrade preview"
    });

    assert.equal(preview.service, "billingService");
    assert.equal(preview.data.approval.required, true);
    assert.equal(preview.data.confirmation.required, true);
    assert.match(preview.data.confirmation.expectedText, /^CHANGE tenant-volga TO starter$/);

    const blockedChange = await billingService.changeTenantTariff({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "QA downgrade preview",
      confirmed: true,
      confirmationText: "wrong"
    });

    assert.equal(blockedChange.status, "invalid");
    assert.equal(blockedChange.states.error, true);
    assert.equal(blockedChange.data.applied, false);
    assert.match(blockedChange.data.auditEvent.id, /^evt_billing_tariff_/);
  });

  it("support admin actions require reason and impersonation audit", async () => {
    const reset = await supportAdminService.resetTwoFactor({
      userId: "usr-ns-agent",
      reason: "Phone replaced by employee",
      confirmed: true
    });

    assert.equal(reset.service, "supportAdminService");
    assert.equal(reset.data.confirmationRequired, true);
    assert.equal(reset.data.user.mfa, "reset_pending");
    assert.equal(reset.data.auditEvent.reason, "Phone replaced by employee");

    const impersonation = await supportAdminService.startImpersonation({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      reason: "Customer approved webhook replay check",
      confirmed: true,
      durationMinutes: 15
    });

    assert.equal(impersonation.status, "ok");
    assert.equal(impersonation.data.impersonation.mode, "read_only_by_default");
    assert.match(impersonation.data.impersonation.id, /^imp_tenant-volga_/);
    assert.equal(impersonation.data.auditEvent.action, "impersonation.start");

    const stop = await supportAdminService.stopImpersonation({
      impersonationId: impersonation.data.impersonation.id,
      reason: "QA exit reason"
    });

    assert.equal(stop.data.reason, "QA exit reason");
    assert.equal(stop.data.auditEvent.action, "impersonation.stop");
  });

  it("service-admin adapters reject privileged actions without reason or confirmation", async () => {
    const missingReason = await supportAdminService.resetTwoFactor({
      userId: "usr-ns-agent",
      reason: "",
      confirmed: true
    });

    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error.code, "reason_required");
    assert.equal(missingReason.states.error, true);

    const missingConfirmation = await supportAdminService.startImpersonation({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      reason: "Customer approved webhook replay check"
    });

    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error.code, "confirmation_required");

    const restrictedTenant = await tenantService.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "restricted",
      reason: "Security restriction requested"
    });

    assert.equal(restrictedTenant.status, "invalid");
    assert.equal(restrictedTenant.error.code, "confirmation_required");

    const nonRestrictiveTenant = await tenantService.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "watch",
      reason: "Operational watch requested"
    });

    assert.equal(nonRestrictiveTenant.status, "invalid");
    assert.equal(nonRestrictiveTenant.error.code, "confirmation_required");

    const incident = await incidentService.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "short",
      reason: "Incident update reason",
      confirmed: true,
      status: "monitoring"
    });

    assert.equal(incident.status, "invalid");
    assert.equal(incident.error.code, "message_required");

    const platformAck = await platformMonitoringService.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      reason: ""
    });

    assert.equal(platformAck.status, "invalid");
    assert.equal(platformAck.error.code, "reason_required");

    const unconfirmedPlatformAck = await platformMonitoringService.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      reason: "Platform alert acknowledged"
    });

    assert.equal(unconfirmedPlatformAck.status, "invalid");
    assert.equal(unconfirmedPlatformAck.error.code, "confirmation_required");

    const billingPreview = await billingService.previewTariffChange({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: ""
    });

    assert.equal(billingPreview.status, "invalid");
    assert.equal(billingPreview.error.code, "reason_required");

    const flagPreview = await featureFlagService.previewFlagChange({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: ""
    });

    assert.equal(flagPreview.status, "invalid");
    assert.equal(flagPreview.error.code, "reason_required");

    const unconfirmedFlagUpdate = await featureFlagService.updateFeatureFlag({
      flagId: "flag-ai-replies",
      nextRollout: 25,
      nextStatus: "gradual",
      reason: "Standard rollout review"
    });

    assert.equal(unconfirmedFlagUpdate.status, "invalid");
    assert.equal(unconfirmedFlagUpdate.error.code, "confirmation_required");
  });

  it("monitoring incidents and feature flags expose drilldown audit metadata", async () => {
    const snapshot = await platformMonitoringService.fetchPlatformSnapshot({ status: "degraded" });
    assert.equal(snapshot.service, "platformMonitoringService");
    assert.ok(snapshot.data.components.every((component) => component.status === "degraded"));

    const drilldown = await platformMonitoringService.fetchComponentDrilldown("cmp-webhooks");
    assert.equal(drilldown.status, "ok");
    assert.ok(drilldown.data.affectedTenants.length > 0);

    const incidentUpdate = await incidentService.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "QA update note",
      reason: "QA incident action",
      confirmed: true,
      status: "monitoring"
    });

    assert.equal(incidentUpdate.data.incident.status, "monitoring");
    assert.match(incidentUpdate.data.auditEvent.id, /^evt_incident_/);

    const flagPreview = await featureFlagService.previewFlagChange({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: "QA rollout preview"
    });

    assert.equal(flagPreview.data.confirmation.required, true);
    assert.match(flagPreview.data.confirmation.expectedText, /^UPDATE ff-ai-replies$/);

    const flagUpdate = await featureFlagService.updateFeatureFlag({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: "QA rollout preview",
      confirmed: true,
      confirmationText: "UPDATE ff-ai-replies"
    });

    assert.equal(flagUpdate.status, "ok");
    assert.equal(flagUpdate.data.applied, true);
    assert.match(flagUpdate.data.auditEvent.id, /^evt_feature_flag_/);
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

  it("audit backend adapters expose export and redaction metadata", async () => {
    const auditExport = await auditService.exportAuditEvents({ format: "CSV", source: "channels" });
    assert.equal(auditExport.data.fileName, "audit-channels.csv");
    assert.ok(auditExport.data.immutableEventIds.length > 0);

    const redaction = await auditService.redactAuditEvent("evt_hook_9006", { reason: "privacy" });
    assert.equal(redaction.data.eventId, "evt_hook_9006");
    assert.equal(redaction.data.immutable, true);
    assert.match(redaction.data.redactionId, /^redact_evt_hook_9006_/);
  });
});
