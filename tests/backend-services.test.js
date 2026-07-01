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

  it("returns permission decisions with denial audit metadata", async () => {
    const denied = await permissionService.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "employee"
    });

    assert.equal(denied.status, "denied");
    assert.equal(denied.data.allowed, false);
    assert.equal(denied.data.serverValidated, true);
    assert.match(denied.data.auditEvent.id, /^evt_perm_/);
    assert.equal(denied.data.auditEvent.action, "settings.manage");
    assert.equal(denied.states.error, true);

    const allowed = await permissionService.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "admin"
    });

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.allowed, true);
    assert.equal(allowed.data.serverValidated, true);
  });

  it("queues report exports and exposes download descriptors", async () => {
    const queued = await reportService.requestReportExport({
      channel: "SDK",
      columns: ["metric", "today"],
      filters: { operator: "all", status: "all" },
      period: "Today",
      reportType: "Daily"
    });

    assert.equal(queued.status, "ok");
    assert.equal(queued.data.job.statusKey, "queued");
    assert.match(queued.data.job.backendQueueId, /^queue_report_/);
    assert.match(queued.data.job.auditId, /^evt_report_/);
    assert.equal(queued.data.job.metricDefinitionVersion, "metrics/v1");

    const retry = await reportService.retryReportExport({
      id: "export-failed",
      name: "Failed export",
      rows: 0
    });

    assert.equal(retry.data.job.statusKey, "running");
    assert.match(retry.data.job.backendQueueId, /^queue_report_/);

    const descriptor = await reportService.getExportFileDescriptor({
      id: "export-ready",
      name: "Daily report",
      format: "XLSX",
      statusKey: "ready"
    });

    assert.equal(descriptor.status, "ok");
    assert.match(descriptor.data.downloadUrl, /^mock:\/\/exports\//);
    assert.match(descriptor.data.fileName, /daily-report\.xlsx$/);
  });

  it("models client profile merge graph and audit metadata", async () => {
    const profiles = await clientService.fetchClientProfiles({ page: 1 });
    assert.equal(profiles.status, "ok");
    assert.ok(profiles.data.mergeGraph.length > 0);
    assert.equal(profiles.data.pagination.mode, "backend-ready");

    const primary = profiles.data.items[0];
    const candidate = profiles.data.items[1];
    const merge = await clientService.mergeClientProfiles({ candidate, primary });

    assert.equal(merge.status, "ok");
    assert.match(merge.data.primaryProfileId, /^src_/);
    assert.match(merge.data.mergedProfileId, /^src_/);
    assert.ok(Array.isArray(merge.data.sourceProfileIds));
    assert.match(merge.data.auditId, /^evt_client_merge_/);
    assert.match(merge.data.conflictResolution, /auto_merge|manual_review/);
  });

  it("models channel, webhook, key rotation and session operations", async () => {
    const channelTest = await integrationService.testChannelConnection({
      channel: { id: "vk", channel: "VK", connections: [{ rawId: "conn_vk_main" }] },
      message: "channel smoke",
      mode: "receive",
      recipient: "+7 900 123-45-67"
    });

    assert.equal(channelTest.status, "ok");
    assert.equal(channelTest.data.delivery.status, "accepted_to_queue");
    assert.match(channelTest.data.delivery.requestId, /^test_vk_/);
    assert.match(channelTest.data.auditId, /^evt_channel_/);

    const rotation = await integrationService.rotateApiKey("prod-key");
    assert.equal(rotation.data.status, "rotation_queued");
    assert.match(rotation.data.auditId, /^evt_key_/);

    const replay = await integrationService.replayWebhookDelivery({ id: "dlv-441", traceId: "hook_vk_441" });
    assert.equal(replay.data.status, "replay_queued");
    assert.equal(replay.data.originalTraceId, "hook_vk_441");

    const revoke = await integrationService.revokeSecuritySession("sess-risk");
    assert.equal(revoke.data.status, "revoked");
    assert.match(revoke.data.auditId, /^evt_session_/);
  });

  it("covers proactive, rescue, automation, quality and audit backend adapters", async () => {
    const proactive = await visitorService.saveProactiveRule({
      id: "rule-checkout",
      channels: ["SDK", "Telegram"],
      activeVariant: "B",
      cooldown: "24h"
    });
    assert.match(proactive.data.frequencyCap.id, /^cap_rule-checkout_/);
    assert.match(proactive.data.experiment.id, /^exp_rule-checkout_/);
    assert.deepEqual(proactive.data.targeting.channels, ["SDK", "Telegram"]);

    const rescue = await visitorService.triggerRescueReturn({
      id: "rescue-vk",
      channel: "VK",
      client: "Queue VK"
    });
    assert.equal(rescue.data.outcome.status, "return_queued");
    assert.match(rescue.data.countdown.serverDeadlineAt, /^\d{4}-\d{2}-\d{2}T/);

    const invalidFlow = await automationService.validateBotFlowImport('{"name":"Broken","flowNodes":[{"id":"bad","type":"bad_type"}]}');
    assert.equal(invalidFlow.status, "invalid");
    assert.ok(invalidFlow.data.errors.some((error) => error.includes("type")));

    const publish = await automationService.publishBotScenario({
      id: "bot-checkout",
      name: "Checkout bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: []
    });
    assert.match(publish.data.runtimeVersion, /^runtime-bot-checkout-/);
    assert.match(publish.data.auditId, /^evt_bot_/);

    const score = await qualityService.scoreDraftResponse({
      conversationId: "conv-1",
      text: "Need help"
    });
    assert.equal(score.data.telemetry.model, "quality-mock/v1");
    assert.ok(Array.isArray(score.data.repairActions));

    const auditExport = await auditService.exportAuditEvents({ format: "CSV", source: "channels" });
    assert.equal(auditExport.data.fileName, "audit-channels.csv");
    assert.ok(auditExport.data.immutableEventIds.length > 0);

    const redaction = await auditService.redactAuditEvent("evt_hook_9006", { reason: "privacy" });
    assert.equal(redaction.data.eventId, "evt_hook_9006");
    assert.equal(redaction.data.immutable, true);
    assert.match(redaction.data.redactionId, /^redact_evt_hook_9006_/);
  });
});
