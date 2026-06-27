import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditService,
  automationService,
  backendIntegrationService,
  clientService,
  integrationService,
  permissionService,
  qualityService,
  reportService,
  visitorService
} from "../src/services/index.js";

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
      "auditService"
    ]);

    for (const service of response.data.services) {
      assert.ok(Array.isArray(service.operations));
      assert.ok(service.operations.length > 0);
      assert.match(service.traceId, /^trc_/);
      assert.ok(["ready", "partial"].includes(service.status));
    }
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
