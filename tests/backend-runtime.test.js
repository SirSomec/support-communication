import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const backendEnv = {
  ...process.env,
  ALLOW_DEMO_SERVICE_ADMIN_HEADERS: "true",
  API_VERSION: "v1",
  DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
  DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key",
  LOG_LEVEL: "info",
  MAIL_HOST: "127.0.0.1",
  MAIL_PORT: "1025",
  NODE_ENV: "test",
  PORT: "4191",
  REDIS_URL: "redis://127.0.0.1:6379",
  S3_ACCESS_KEY: "minio",
  S3_BUCKET: "support-communication-local",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_SECRET_KEY: "minio-password",
  SERVICE_NAME: "api-gateway"
};

let activeRuntimePort = Number(backendEnv.PORT);
let activeGatewayOutput = { stderr: "", stdout: "" };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const target = rewriteRuntimeUrl(input);
  try {
    return await originalFetch(target, init);
  } catch (error) {
    const method = init.method ?? "GET";
    const url = typeof target === "string" ? target : target.url;
    const wrapped = new Error(`${method} ${url} failed: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
};

describe("backend API Gateway runtime contracts", () => {
  it("serves Phase 0 and Phase 1 routes through compiled Nest runtime", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "support-runtime-"));
    activeRuntimePort = await findAvailablePort();
    const build = spawnSync("npm", ["run", "backend:build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: true
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);

    const gateway = spawn("node", ["backend/apps/api-gateway/dist/main.js"], {
      cwd: process.cwd(),
      env: {
        ...backendEnv,
        PORT: String(activeRuntimePort),
        REPORT_EXPORT_OBJECT_ROOT: join(workspace, "report-exports")
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const gatewayOutput = captureProcessOutput(gateway);
    activeGatewayOutput = gatewayOutput;

    try {
      await waitForGateway(gateway, gatewayOutput);

      const health = await getJson("http://127.0.0.1:4191/api/v1/health", {
        "X-Request-Id": "runtime smoke/health"
      });
      assert.equal(health.traceId, "runtime_smoke_health");
      assert.equal(health.data.status, "ok");

      const unauthorized = await fetch("http://127.0.0.1:4191/api/v1/tenants?status=watch");
      assert.equal(unauthorized.status, 401);
      const unauthorizedBody = await unauthorized.json();
      assert.equal(unauthorizedBody.status, "denied");
      assert.equal(unauthorizedBody.states.error, true);
      assert.equal(unauthorizedBody.error.code, "unauthorized");
      assert.equal(unauthorizedBody.meta.path, "/api/v1/tenants?status=watch");

      const login = await postJson("http://127.0.0.1:4191/api/v1/auth/login", {
        email: "service-admin@example.com",
        password: "correct-password"
      }, { "X-Request-Id": "runtime auth/login" });
      assert.equal(login.status, "ok");
      assert.equal(login.partial, true);
      assert.equal(login.traceId, "runtime_auth_login");
      assert.equal(login.data.authState, "mfa_required");

      const invalidLoginResponse = await fetch("http://127.0.0.1:4191/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "service-admin@example.com" })
      });
      assert.equal(invalidLoginResponse.status, 200);
      const invalidLogin = await invalidLoginResponse.json();
      assert.equal(invalidLogin.status, "invalid");
      assert.equal(invalidLogin.error.code, "password_required");

      const publicOtpCompletion = await fetch("http://127.0.0.1:4191/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "service-admin@example.com",
          password: "correct-password",
          otp: "123456"
        })
      });
      assert.equal(publicOtpCompletion.status, 200);
      const publicOtpCompletionBody = await publicOtpCompletion.json();
      assert.equal(publicOtpCompletionBody.status, "invalid");
      assert.equal(publicOtpCompletionBody.states.error, true);
      assert.equal(publicOtpCompletionBody.service, "authService");
      assert.equal(publicOtpCompletionBody.error.code, "mfa_challenge_required");

      const verified = await postJson("http://127.0.0.1:4191/api/v1/auth/login", {
        email: "service-admin@example.com",
        mfaChallengeId: login.data.mfaChallengeId,
        password: "correct-password",
        otp: "123456"
      });
      assert.equal(verified.status, "ok");
      assert.equal(verified.data.authenticated, true);
      assert.equal(verified.data.session.adminId, "svc-admin-001");
      assert.equal(verified.data.session.adminName, "Надя Орлова");
      assert.equal(verified.data.session.authState, "mfa_verified");
      assert.equal(typeof verified.data.accessToken, "string");

      const authState = await getJson("http://127.0.0.1:4191/api/v1/auth/state", {
        authorization: `Bearer ${verified.data.accessToken}`
      });
      assert.equal(authState.data.authenticated, true);
      assert.equal(authState.data.session.adminId, "svc-admin-001");

      const bearerAuthStateResponse = await fetch("http://127.0.0.1:4191/api/v1/auth/state", {
        headers: { authorization: `Bearer ${verified.data.accessToken}` }
      });
      assert.equal(bearerAuthStateResponse.status, 200);
      const bearerAuthState = await bearerAuthStateResponse.json();
      assert.equal(bearerAuthState.status, "ok");
      assert.equal(bearerAuthState.data.authenticated, true);
      assert.equal(bearerAuthState.data.session.id, verified.data.session.id);

      const bearerLogoutResponse = await fetch("http://127.0.0.1:4191/api/v1/auth/logout", {
        method: "POST",
        headers: {
          authorization: `Bearer ${verified.data.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ reason: "runtime bearer logout" })
      });
      assert.equal(bearerLogoutResponse.status, 200);
      const bearerLogout = await bearerLogoutResponse.json();
      assert.equal(bearerLogout.status, "ok");
      assert.equal(bearerLogout.data.outbox.type, "service_admin.logout");

      const revokedBearerState = await fetch("http://127.0.0.1:4191/api/v1/auth/state", {
        headers: { authorization: `Bearer ${verified.data.accessToken}` }
      });
      assert.equal(revokedBearerState.status, 401);
      const revokedBearerStateBody = await revokedBearerState.json();
      assert.equal(revokedBearerStateBody.status, "denied");
      assert.equal(revokedBearerStateBody.error.code, "unauthorized");

      const logout = await postJson("http://127.0.0.1:4191/api/v1/auth/logout", {
        reason: "runtime logout"
      });
      assert.equal(logout.status, "ok");
      assert.equal(logout.data.auditEvent.reason, "runtime logout");

      const secondLogoutResponse = await fetch("http://127.0.0.1:4191/api/v1/auth/logout", {
        method: "POST",
        headers: withAdminKey({ "content-type": "application/json" }),
        body: JSON.stringify({ reason: "runtime logout status" })
      });
      assert.equal(secondLogoutResponse.status, 200);
      const secondLogout = await secondLogoutResponse.json();
      assert.equal(secondLogout.status, "ok");

      const tenants = await getJson("http://127.0.0.1:4191/api/v1/tenants?status=watch");
      assert.equal(tenants.meta.source, "api");
      assert.ok(tenants.data.items.every((tenant) => tenant.status === "watch"));
      assert.equal(tenants.data.items[0].notes.length > 0, true);
      assert.equal(typeof tenants.data.items[0].healthScore, "number");
      assert.ok(tenants.data.items[0].sla);

      const tenantDetail = await getJson("http://127.0.0.1:4191/api/v1/tenants/tenant-volga");
      assert.equal(tenantDetail.data.tenant.id, "tenant-volga");
      assert.ok(tenantDetail.data.users.length > 0);
      assert.ok(tenantDetail.data.flags.every((flag) => typeof flag.key === "string"));

      const confirmationRequired = await patchJson("http://127.0.0.1:4191/api/v1/tenants/tenant-volga/status", {
        status: "restricted",
        reason: "runtime status confirmation"
      }, { "X-Request-Id": "runtime tenant/status" });
      assert.equal(confirmationRequired.status, "invalid");
      assert.equal(confirmationRequired.error.code, "confirmation_required");
      assert.equal(confirmationRequired.traceId, "runtime_tenant_status");

      const statusChanged = await patchJson("http://127.0.0.1:4191/api/v1/tenants/tenant-volga/status", {
        confirmed: true,
        status: "restricted",
        reason: "runtime status confirmation"
      });
      assert.equal(statusChanged.status, "ok");
      assert.equal(statusChanged.data.tenant.status, "restricted");

      const deniedResponse = await fetch("http://127.0.0.1:4191/api/v1/permissions/validate", {
        method: "POST",
        headers: withAdminKey({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "settings.manage",
          resource: "settings",
          roleMode: "employee"
        })
      });
      assert.equal(deniedResponse.status, 200);
      const denied = await deniedResponse.json();
      assert.equal(denied.status, "denied");
      assert.equal(denied.states.error, true);

      const misleadingRole = await postJson("http://127.0.0.1:4191/api/v1/permissions/validate", {
        action: "dialogs.read",
        resource: "settings",
        roleMode: "non-admin"
      });
      assert.equal(misleadingRole.status, "denied");
      assert.equal(misleadingRole.error.code, "role_unrecognized");
      assert.equal(misleadingRole.data.role, "unknown");

      const permissionModel = await getJson("http://127.0.0.1:4191/api/v1/permissions/model");
      assert.ok(permissionModel.data.roles.length > 0);
      assert.ok(permissionModel.data.actions.length > 0);

      const dialogs = await getJson("http://127.0.0.1:4191/api/v1/dialogs?status=queued&page=1&pageSize=10");
      assert.equal(dialogs.service, "dialogService");
      assert.equal(dialogs.data.pagination.mode, "backend-ready");
      assert.ok(dialogs.data.items.every((conversation) => conversation.status === "queued"));

      const dialogDetail = await getJson("http://127.0.0.1:4191/api/v1/dialogs/vladimir");
      assert.equal(dialogDetail.data.conversation.id, "vladimir");
      assert.ok(dialogDetail.data.messages.length > 0);

      const closeWithoutTopic = await patchJson("http://127.0.0.1:4191/api/v1/dialogs/vladimir/status", {
        nextStatus: "closed",
        roleMode: "admin"
      });
      assert.equal(closeWithoutTopic.status, "invalid");
      assert.equal(closeWithoutTopic.error.code, "topic_required");

      const closeWithTopic = await patchJson("http://127.0.0.1:4191/api/v1/dialogs/vladimir/status", {
        nextStatus: "closed",
        resolutionOutcome: "resolved",
        roleMode: "admin",
        topic: "Product / Mismatch"
      });
      assert.equal(closeWithTopic.status, "ok");
      assert.equal(closeWithTopic.data.conversation.status, "closed");

      const internalMessage = await postJson("http://127.0.0.1:4191/api/v1/dialogs/maria/messages", {
        mode: "internal",
        text: "Runtime internal note"
      });
      assert.equal(internalMessage.status, "ok");
      assert.equal(internalMessage.data.message.type, "internal");
      assert.equal(internalMessage.data.outboundDelivery, null);

      const replyMessage = await postJson("http://127.0.0.1:4191/api/v1/dialogs/maria/messages", {
        mode: "reply",
        text: "Runtime reply"
      });
      assert.equal(replyMessage.status, "ok");
      assert.equal(replyMessage.data.outboundDelivery.deliveryState, "queued");

      const upload = await postJson("http://127.0.0.1:4191/api/v1/dialogs/attachments", {
        channel: "SDK",
        fileName: "runtime.pdf",
        sizeBytes: 2048
      }, withTenantScope("tenant-volga"));
      assert.equal(upload.data.storageState, "upload_queued");

      const outbound = await postJson("http://127.0.0.1:4191/api/v1/dialogs/outbound", {
        channel: "Telegram",
        clientName: "Runtime Client",
        message: "Hello",
        phone: "+7 900 000-00-00",
        topic: "Delivery / Status"
      }, withTenantScope("tenant-volga"));
      assert.equal(outbound.data.status, "queued");
      assert.equal(outbound.data.consentCheck, "required_before_send");

      const channels = await getJson("http://127.0.0.1:4191/api/v1/channels");
      assert.ok(channels.data.items.some((channel) => channel.id === "telegram"));

      const inbound = await postJson("http://127.0.0.1:4191/api/v1/channels/telegram/inbound", {
        conversationId: "dmitry",
        eventId: "runtime-inbound-001",
        text: "Runtime inbound"
      });
      assert.equal(inbound.data.duplicate, false);

      const duplicateInbound = await postJson("http://127.0.0.1:4191/api/v1/channels/telegram/inbound", {
        conversationId: "dmitry",
        eventId: "runtime-inbound-001",
        text: "Runtime inbound"
      });
      assert.equal(duplicateInbound.data.duplicate, true);

      const sameIdDifferentChannel = await postJson("http://127.0.0.1:4191/api/v1/channels/vk/inbound", {
        conversationId: "alexey",
        eventId: "runtime-inbound-001",
        text: "Runtime inbound from another channel"
      });
      assert.equal(sameIdDifferentChannel.data.duplicate, false);

      const realtime = await getJson("http://127.0.0.1:4191/api/v1/realtime/events?since=now-5m");
      assert.ok(realtime.data.events.some((event) => event.eventName === "message.created"));
      const replayCursor = realtime.data.events[0]?.eventId;
      assert.ok(replayCursor);
      assert.ok(realtime.data.events.length > 1);

      const realtimeStream = await readSseChunk("http://127.0.0.1:4191/api/v1/realtime/events/stream?since=now-5m", /event: message\.created/);
      assert.match(realtimeStream.contentType, /text\/event-stream/);
      assert.match(realtimeStream.body, /event: message\.created/);
      assert.match(realtimeStream.body, /"eventName":"message\.created"/);
      const afterCursorStream = await readSseChunk("http://127.0.0.1:4191/api/v1/realtime/events/stream", /^id: /m, {
        "Last-Event-ID": replayCursor
      });
      assert.doesNotMatch(afterCursorStream.body, new RegExp(`^id: ${escapeRegExp(replayCursor)}$`, "m"));
      const headerPrecedenceStream = await readSseChunk("http://127.0.0.1:4191/api/v1/realtime/events/stream?since=now-5m", /^id: /m, {
        "Last-Event-ID": replayCursor
      });
      assert.doesNotMatch(headerPrecedenceStream.body, new RegExp(`^id: ${escapeRegExp(replayCursor)}$`, "m"));

      const realtimeSocket = await readWebSocketMessage("ws://127.0.0.1:4191/api/v1/realtime/events/socket?since=now-5m", /"eventName":"message\.created"/);
      assert.equal(realtimeSocket.timedOut, false, `WebSocket timed out with status ${realtimeSocket.status} and ${realtimeSocket.messages.length} messages`);
      assert.equal(realtimeSocket.status, 101);
      assert.ok(realtimeSocket.messages.some((message) => JSON.parse(message).eventName === "message.created"));

      const deniedSocket = await readWebSocketMessage("ws://127.0.0.1:4191/api/v1/realtime/events/socket?since=now-5m", null, {});
      assert.equal(deniedSocket.timedOut, false, `Denied WebSocket timed out with status ${deniedSocket.status}`);
      assert.equal(deniedSocket.status, 401);

      const routingMissingTenant = await getJson("http://127.0.0.1:4191/api/v1/routing/workload?channel=VK");
      assert.equal(routingMissingTenant.status, "invalid");
      assert.equal(routingMissingTenant.error.code, "tenant_context_required");

      const routingTenantScope = withTenantScope("tenant-volga");
      const routingWorkload = await getJson("http://127.0.0.1:4191/api/v1/routing/workload?channel=VK", routingTenantScope);
      assert.equal(routingWorkload.service, "routingService");
      assert.ok(routingWorkload.data.operators.every((operator) => operator.channels.includes("VK")));
      assert.ok(routingWorkload.data.operators.every((operator) => typeof operator.avg === "string"));
      assert.ok(routingWorkload.data.operators.every((operator) => typeof operator.sla === "number"));
      assert.deepEqual(routingWorkload.data.queues.map((queue) => queue.channel), ["VK"]);
      assert.deepEqual(routingWorkload.data.queues.map((queue) => queue.name), ["VK"]);

      const channelDeniedAssignment = await postJson("http://127.0.0.1:4191/api/v1/routing/assignments", {
        action: "assign",
        conversationId: "alexey",
        reason: "Runtime redistribution",
        targetOperatorId: "operator-ivan"
      }, routingTenantScope);
      assert.equal(channelDeniedAssignment.status, "denied");
      assert.equal(channelDeniedAssignment.error.code, "operator_channel_denied");

      const limitDeniedAssignment = await postJson("http://127.0.0.1:4191/api/v1/routing/assignments", {
        action: "assign",
        conversationId: "alexey",
        reason: "Runtime redistribution",
        targetOperatorId: "operator-full"
      }, routingTenantScope);
      assert.equal(limitDeniedAssignment.status, "denied");
      assert.equal(limitDeniedAssignment.error.code, "operator_limit_exceeded");

      const clientOverrideAssignment = await postJson("http://127.0.0.1:4191/api/v1/routing/assignments", {
        action: "assign",
        conversationId: "alexey",
        overrideLimit: true,
        reason: "Runtime redistribution",
        targetOperatorId: "operator-full"
      }, routingTenantScope);
      assert.equal(clientOverrideAssignment.status, "denied");
      assert.equal(clientOverrideAssignment.data.overrideRequested, true);
      assert.equal(clientOverrideAssignment.data.overrideSupported, false);

      const unsupportedAssignment = await postJson("http://127.0.0.1:4191/api/v1/routing/assignments", {
        action: "rotate",
        conversationId: "alexey",
        reason: "Runtime redistribution",
        targetOperatorId: "operator-anna"
      }, routingTenantScope);
      assert.equal(unsupportedAssignment.status, "invalid");
      assert.equal(unsupportedAssignment.error.code, "assignment_action_unsupported");

      const runtimeAssignment = await postJson("http://127.0.0.1:4191/api/v1/routing/assignments", {
        action: "assign",
        conversationId: "alexey",
        reason: "Runtime redistribution",
        targetOperatorId: "operator-anna"
      }, routingTenantScope);
      assert.equal(runtimeAssignment.status, "ok");
      assert.equal(runtimeAssignment.data.conversation.status, "assigned");

      const transferAssignment = await postJson("http://127.0.0.1:4191/api/v1/routing/assignments", {
        action: "transfer",
        conversationId: "vladimir",
        reason: "Runtime senior transfer",
        targetOperatorId: "operator-ivan"
      }, routingTenantScope);
      assert.equal(transferAssignment.status, "ok");
      assert.equal(transferAssignment.data.conversation.status, "transferred");

      const slaPauseMissingReason = await postJson("http://127.0.0.1:4191/api/v1/routing/sla/pause", {
        conversationId: "maria",
        durationMinutes: 15,
        reason: ""
      }, routingTenantScope);
      assert.equal(slaPauseMissingReason.status, "invalid");
      assert.equal(slaPauseMissingReason.error.code, "sla_pause_reason_required");

      const slaPaused = await postJson("http://127.0.0.1:4191/api/v1/routing/sla/pause", {
        conversationId: "maria",
        durationMinutes: 15,
        reason: "Runtime customer hold"
      }, routingTenantScope);
      assert.equal(slaPaused.status, "ok");
      assert.equal(slaPaused.data.schedulerJob.queue, "sla-timers");

      const closedRescue = await postJson("http://127.0.0.1:4191/api/v1/routing/rescue/start", {
        conversationId: "closed-dialog",
        reason: "Runtime escalation"
      }, routingTenantScope);
      assert.equal(closedRescue.status, "denied");
      assert.equal(closedRescue.error.code, "conversation_closed");

      const rescueStarted = await postJson("http://127.0.0.1:4191/api/v1/routing/rescue/start", {
        conversationId: "vladimir",
        durationSeconds: 1,
        reason: "Runtime no operator answer"
      }, routingTenantScope);
      assert.equal(rescueStarted.status, "ok");
      assert.equal(rescueStarted.data.rescue.durationSeconds, 240);
      assert.equal(typeof rescueStarted.data.rescue.startedAt, "number");
      assert.equal(typeof rescueStarted.data.rescue.deadlineAt, "number");
      assert.equal(rescueStarted.data.rescue.deadlineAt - rescueStarted.data.rescue.startedAt, 240_000);
      assert.equal(rescueStarted.data.schedulerJob.action, "return_to_sla_queue");

      const duplicateRescueStart = await postJson("http://127.0.0.1:4191/api/v1/routing/rescue/start", {
        conversationId: "vladimir",
        reason: "Runtime duplicate rescue"
      }, routingTenantScope);
      assert.equal(duplicateRescueStart.status, "conflict");
      assert.equal(duplicateRescueStart.error.code, "rescue_already_active");
      assert.equal(duplicateRescueStart.data.rescue.deadlineAt, rescueStarted.data.rescue.deadlineAt);

      const rescueResolved = await postJson("http://127.0.0.1:4191/api/v1/routing/rescue/resolve", {
        conversationId: "vladimir",
        outcome: "returned_to_queue",
        reason: "Runtime timer expired"
      }, routingTenantScope);
      assert.equal(rescueResolved.status, "ok");
      assert.equal(rescueResolved.data.reportEvent.eventName, "rescue.report.ready");

      const rescueReport = await getJson("http://127.0.0.1:4191/api/v1/routing/reports/rescue?period=today", routingTenantScope);
      assert.equal(rescueReport.service, "routingService");
      assert.equal(rescueReport.data.exportDescriptor.metricDefinitionVersion, "routing-rescue-v1");

      const reportWorkspace = await getJson("http://127.0.0.1:4191/api/v1/reports/workspace?channel=VK&period=today&reportType=SLA");
      assert.equal(reportWorkspace.service, "reportService");
      assert.equal(reportWorkspace.data.metricDefinitionVersion, "metrics/v1");
      assert.ok(reportWorkspace.data.rescueReportRows.every((row) => "client" in row && "timer" in row));

      const invalidReportExport = await postJson("http://127.0.0.1:4191/api/v1/reports/exports", {
        channel: "VK",
        columns: [],
        period: "today",
        reportType: "SLA"
      });
      assert.equal(invalidReportExport.status, "invalid");
      assert.equal(invalidReportExport.error.code, "report_columns_required");

      const queuedReportExport = await postJson("http://127.0.0.1:4191/api/v1/reports/exports", {
        channel: "VK",
        columns: ["metric", "today", "status"],
        idempotencyKey: "runtime-report-export-vk-today",
        period: "today",
        reportType: "SLA"
      });
      assert.equal(queuedReportExport.status, "ok");
      assert.equal(queuedReportExport.data.job.statusKey, "queued");
      assert.equal(queuedReportExport.data.job.metricDefinitionVersion, "metrics/v1");
      assert.equal(queuedReportExport.data.job.permissionRequired, "reports.export");

      const duplicateReportExport = await postJson("http://127.0.0.1:4191/api/v1/reports/exports", {
        channel: "VK",
        columns: ["metric", "today", "status"],
        idempotencyKey: "runtime-report-export-vk-today",
        period: "today",
        reportType: "SLA"
      });
      assert.equal(duplicateReportExport.data.duplicate, true);
      assert.equal(duplicateReportExport.data.job.id, queuedReportExport.data.job.id);
      assert.equal(duplicateReportExport.data.job.permissionRequired, "reports.export");

      const reusedReportExportKey = await postJson("http://127.0.0.1:4191/api/v1/reports/exports", {
        channel: "VK",
        columns: ["metric", "previous"],
        idempotencyKey: "runtime-report-export-vk-today",
        period: "today",
        reportType: "SLA"
      });
      assert.equal(reusedReportExportKey.status, "conflict");
      assert.equal(reusedReportExportKey.error.code, "idempotency_key_reused");

      const retryReportExport = await postJson("http://127.0.0.1:4191/api/v1/reports/exports/export-2420/retry", {
        reason: "Runtime retry"
      });
      assert.equal(retryReportExport.status, "ok");
      assert.equal(retryReportExport.data.job.statusKey, "running");

      const retryReadyReportExport = await postJson("http://127.0.0.1:4191/api/v1/reports/exports/export-2418/retry", {
        reason: "Runtime ready retry"
      });
      assert.equal(retryReadyReportExport.status, "conflict");
      assert.equal(retryReadyReportExport.error.code, "report_export_retry_not_allowed");

      const notReadyReportFile = await getJson("http://127.0.0.1:4191/api/v1/reports/exports/export-2419/file");
      assert.equal(notReadyReportFile.status, "denied");
      assert.equal(notReadyReportFile.error.code, "report_export_not_ready");

      const reportFile = await getJson("http://127.0.0.1:4191/api/v1/reports/exports/export-2418/file?canDownload=true");
      assert.equal(reportFile.status, "ok");
      assert.equal(reportFile.data.jobId ?? reportFile.data.descriptor?.jobId ?? "export-2418", "export-2418");

      const reportDownload = await fetch("http://127.0.0.1:4191/api/v1/reports/exports/export-2418/download", {
        headers: withAdminKey()
      });
      assert.equal(reportDownload.ok, true, `report export download returned ${reportDownload.status}`);
      assert.match(reportDownload.headers.get("content-disposition") ?? "", /attachment/);
      assert.match(reportDownload.headers.get("content-disposition") ?? "", /export-2418/);
      assert.match(reportDownload.headers.get("content-type") ?? "", /spreadsheetml|text\/csv/);
      const reportDownloadBytes = Buffer.from(await reportDownload.arrayBuffer());
      assert.ok(reportDownloadBytes.byteLength > 0);
      assert.doesNotMatch(reportDownloadBytes.toString("utf8"), /downloadUrl|objectKey/);

      const integrationWorkspace = await getJson("http://127.0.0.1:4191/api/v1/integrations/workspace");
      assert.equal(integrationWorkspace.service, "integrationService");
      assert.ok(integrationWorkspace.data.apiEnvironmentKeys.every((key) => key.keyPreview.includes("****")));
      assert.ok(integrationWorkspace.data.apiEnvironmentKeys.every((key) => !("rawKey" in key)));

      const invalidChannelTest = await postJson("http://127.0.0.1:4191/api/v1/integrations/channel-tests", {
        channelId: "sdk",
        message: "",
        recipient: ""
      });
      assert.equal(invalidChannelTest.status, "invalid");
      assert.equal(invalidChannelTest.error.code, "recipient_and_message_required");

      const channelTest = await postJson("http://127.0.0.1:4191/api/v1/integrations/channel-tests", {
        channelId: "sdk",
        connectionId: "sdk-stage",
        environment: "stage",
        message: "Runtime SDK test",
        mode: "receive",
        recipient: "+7 900 000-00-00"
      });
      assert.equal(channelTest.status, "ok");
      assert.equal(channelTest.data.delivery.status, "accepted_to_queue");
      assert.equal(channelTest.data.delivery.sandboxIsolation, true);

      const keyRotation = await postJson("http://127.0.0.1:4191/api/v1/integrations/api-keys/stage-key/rotate", {});
      assert.equal(keyRotation.status, "ok");
      assert.equal(keyRotation.data.rawKeyShownOnce, false);
      assert.equal("rawKey" in keyRotation.data, false);

      const webhookReplay = await postJson("http://127.0.0.1:4191/api/v1/integrations/webhooks/deliveries/dlv-441/replay", {
        idempotencyKey: "runtime-replay-dlv-441"
      });
      assert.equal(webhookReplay.status, "ok");
      assert.equal(webhookReplay.data.originalTraceId, "hook_vk_441");
      assert.equal(webhookReplay.data.status, "replay_queued");

      const duplicateWebhookReplay = await postJson("http://127.0.0.1:4191/api/v1/integrations/webhooks/deliveries/dlv-441/replay", {
        idempotencyKey: "runtime-replay-dlv-441"
      });
      assert.equal(duplicateWebhookReplay.data.duplicate, true);
      assert.equal(duplicateWebhookReplay.data.replayId, webhookReplay.data.replayId);

      const revokedSession = await postJson("http://127.0.0.1:4191/api/v1/integrations/security/sessions/sess-risk/revoke", {});
      assert.equal(revokedSession.status, "ok");
      assert.equal(revokedSession.data.status, "revoked");

      const tenantDemoScope = withTenantScope("tenant-demo");
      const automationWorkspace = await getJson("http://127.0.0.1:4191/api/v1/automation/workspace", tenantDemoScope);
      assert.equal(automationWorkspace.service, "automationService");
      assert.ok(automationWorkspace.data.botScenarios.length > 0);
      assert.ok(automationWorkspace.data.proactiveRules.length > 0);

      const invalidBotFlow = await postJson("http://127.0.0.1:4191/api/v1/automation/bot-flow/validate", {
        name: "Broken",
        flowNodes: [{ id: "bad", type: "bad_type" }]
      }, tenantDemoScope);
      assert.equal(invalidBotFlow.status, "invalid");
      assert.equal(invalidBotFlow.error.code, "bot_flow_invalid");

      const validBotFlowAlias = await postJson("http://127.0.0.1:4191/api/v1/automation/bot-flows/validate", {
        flowEdges: [],
        flowNodes: [{ id: "start", type: "message" }],
        name: "Checkout bot"
      }, tenantDemoScope);
      assert.equal(validBotFlowAlias.status, "ok");
      assert.equal(validBotFlowAlias.data.payload.schemaVersion, "bot-flow/v1");

      const botPublish = await postJson("http://127.0.0.1:4191/api/v1/automation/bots/bot-checkout/publish", {
        channels: ["SDK"],
        flowEdges: [],
        flowNodes: [{ id: "start", type: "message" }],
        idempotencyKey: "runtime-publish-bot-checkout",
        name: "Checkout bot"
      }, tenantDemoScope);
      assert.equal(botPublish.status, "ok");
      assert.equal(botPublish.data.queue, "bot-runtime");
      assert.match(botPublish.data.runtimeVersion, /^runtime-bot-checkout-/);

      const botPublishAlias = await postJson("http://127.0.0.1:4191/api/v1/automation/bot-scenarios/bot-checkout/publish", {
        channels: ["SDK"],
        flowEdges: [],
        flowNodes: [{ id: "start", type: "message" }],
        idempotencyKey: "runtime-publish-bot-checkout-alias",
        name: "Checkout bot"
      }, tenantDemoScope);
      assert.equal(botPublishAlias.status, "ok");
      assert.match(botPublishAlias.data.runtimeVersion, /^runtime-bot-checkout-/);

      const botPublishHeader = await postJson(
        "http://127.0.0.1:4191/api/v1/automation/bot-scenarios/bot-header/publish",
        {
          channels: ["SDK"],
          flowEdges: [],
          flowNodes: [{ id: "start", type: "message" }],
          name: "Header bot"
        },
        { ...tenantDemoScope, "Idempotency-Key": "runtime-publish-bot-header" }
      );
      assert.equal(botPublishHeader.status, "ok");
      assert.match(botPublishHeader.data.runtimeVersion, /^runtime-bot-header-/);

      const duplicateBotPublishHeader = await postJson(
        "http://127.0.0.1:4191/api/v1/automation/bot-scenarios/bot-header/publish",
        {
          channels: ["SDK"],
          flowEdges: [],
          flowNodes: [{ id: "start", type: "message" }],
          name: "Header bot"
        },
        { ...tenantDemoScope, "Idempotency-Key": "runtime-publish-bot-header" }
      );
      assert.equal(duplicateBotPublishHeader.data.duplicate, true);
      assert.equal(duplicateBotPublishHeader.data.runtimeVersion, botPublishHeader.data.runtimeVersion);

      const reusedBotPublishHeader = await postJson(
        "http://127.0.0.1:4191/api/v1/automation/bot-scenarios/bot-header/publish",
        {
          channels: ["VK"],
          flowEdges: [],
          flowNodes: [{ id: "start", type: "message" }],
          name: "Header bot changed"
        },
        { ...tenantDemoScope, "Idempotency-Key": "runtime-publish-bot-header" }
      );
      assert.equal(reusedBotPublishHeader.status, "conflict");
      assert.equal(reusedBotPublishHeader.error.code, "idempotency_key_reused");

      const botTestRun = await postJson("http://127.0.0.1:4191/api/v1/automation/bot-scenarios/bot-checkout/test-runs", {
        name: "Checkout bot",
        testCases: [{ id: "happy-path", expected: "handoff" }]
      }, tenantDemoScope);
      assert.equal(botTestRun.status, "ok");
      assert.equal(botTestRun.data.status, "running");
      assert.match(botTestRun.data.testRunId, /^bot_test_/);

      const proactiveRule = await postJson("http://127.0.0.1:4191/api/v1/automation/proactive-rules", {
        activeVariant: "B",
        channels: ["SDK", "Telegram"],
        cooldown: "24h",
        id: "rule-runtime-checkout",
        segment: "checkout"
      }, tenantDemoScope);
      assert.equal(proactiveRule.status, "ok");
      assert.equal(proactiveRule.data.experiment.persisted, true);
      assert.equal(proactiveRule.data.queue, "proactive-delivery");

      const botHandoff = await postJson("http://127.0.0.1:4191/api/v1/automation/handoff-events", {
        botId: "bot-checkout",
        collectedFields: { orderId: "A-42" },
        conversationId: "conv-42",
        queue: "Delivery",
        reason: "customer_requested_operator"
      }, tenantDemoScope);
      assert.equal(botHandoff.status, "ok");
      assert.equal(botHandoff.data.eventName, "bot.handoff.created");

      const botHandoffAlias = await postJson("http://127.0.0.1:4191/api/v1/automation/bot-handoffs", {
        botId: "bot-checkout",
        conversationId: "conv-42",
        reason: "customer_requested_operator"
      }, tenantDemoScope);
      assert.equal(botHandoffAlias.status, "ok");
      assert.equal(botHandoffAlias.data.eventName, "bot.handoff.created");

      const qualityWorkspace = await getJson("http://127.0.0.1:4191/api/v1/quality/workspace", tenantDemoScope);
      assert.equal(qualityWorkspace.service, "qualityService");
      assert.ok(qualityWorkspace.data.qualityMetrics.every((score) => score.conversationId && score.channel && score.operator));

      const draftScore = await postJson("http://127.0.0.1:4191/api/v1/quality/draft-score", {
        attachments: [{ id: "att-1", status: "uploading" }],
        conversationId: "conv-risk",
        mode: "reply",
        suggestions: [{ id: "ai-reply" }],
        text: "This is not our problem"
      }, tenantDemoScope);
      assert.equal(draftScore.status, "ok");
      assert.equal(draftScore.data.telemetry.model, "quality-rules/v1");
      assert.ok(draftScore.data.checks.some((check) => check.id === "attachment"));

      const draftScoreAlias = await postJson("http://127.0.0.1:4191/api/v1/quality/draft-scores", {
        conversationId: "conv-empty",
        mode: "reply",
        text: ""
      }, tenantDemoScope);
      assert.equal(draftScoreAlias.status, "ok");
      assert.equal(draftScoreAlias.data.checks[0].id, "empty");

      const qualityRating = await postJson("http://127.0.0.1:4191/api/v1/quality/ratings", {
        channel: "SDK",
        clientId: "client-42",
        conversationId: "conv-42",
        operator: "operator-7",
        scale: "CSAT",
        score: 5,
        topic: "Delivery"
      }, tenantDemoScope);
      assert.equal(qualityRating.status, "ok");
      assert.equal(qualityRating.data.realtimeEvent.eventName, "quality.score.updated");

      const manualQa = await postJson("http://127.0.0.1:4191/api/v1/quality/manual-reviews", {
        conversationId: "conv-42",
        reviewer: "senior-1",
        score: 92
      }, tenantDemoScope);
      assert.equal(manualQa.status, "ok");
      assert.equal(manualQa.data.override.auditRequired, false);

      const tariffs = await getJson("http://127.0.0.1:4191/api/v1/billing/tariffs");
      assert.equal(tariffs.service, "billingService");
      assert.equal(tariffs.data.previewRequired, true);

      const tariffPreview = await postJson("http://127.0.0.1:4191/api/v1/billing/tariff-preview", {
        nextPlanId: "starter",
        reason: "Runtime downgrade preview",
        tenantId: "tenant-volga"
      });
      assert.equal(tariffPreview.status, "ok");
      assert.equal(tariffPreview.data.confirmation.expectedText, "CHANGE tenant-volga TO starter");

      const tariffPreviewAlias = await postJson("http://127.0.0.1:4191/api/v1/billing/tenants/tenant-volga/tariff-change/preview", {
        nextPlanId: "starter",
        reason: "Runtime downgrade preview"
      });
      assert.equal(tariffPreviewAlias.status, "ok");
      assert.equal(tariffPreviewAlias.data.confirmation.expectedText, "CHANGE tenant-volga TO starter");

      const blockedTariffChange = await postJson("http://127.0.0.1:4191/api/v1/billing/tenants/tenant-volga/tariff-change", {
        confirmationText: "wrong",
        confirmed: true,
        nextPlanId: "starter",
        reason: "Runtime downgrade preview"
      });
      assert.equal(blockedTariffChange.status, "invalid");
      assert.equal(blockedTariffChange.error.code, "confirmation_required");

      const approvalRequiredTariffChange = await postJson("http://127.0.0.1:4191/api/v1/billing/tenants/tenant-volga/tariff-change", {
        confirmationText: "CHANGE tenant-volga TO starter",
        confirmed: true,
        nextPlanId: "starter",
        reason: "Runtime downgrade preview"
      });
      assert.equal(approvalRequiredTariffChange.status, "invalid");
      assert.equal(approvalRequiredTariffChange.error.code, "approval_required");

      const appliedTariffPatch = await patchJson("http://127.0.0.1:4191/api/v1/billing/tenants/tenant-lumen/tariff", {
        confirmationText: "CHANGE tenant-lumen TO business",
        confirmed: true,
        nextPlanId: "business",
        reason: "Runtime trial conversion"
      });
      assert.equal(appliedTariffPatch.status, "ok");
      assert.equal(appliedTariffPatch.data.queue, "billing-sync");

      const quotaDenied = await postJson("http://127.0.0.1:4191/api/v1/billing/quota-checks", {
        requested: 1000000,
        resource: "webhooks",
        tenantId: "tenant-lumen"
      });
      assert.equal(quotaDenied.status, "denied");
      assert.equal(quotaDenied.error.code, "quota_exceeded");

      const quotaSnapshot = await getJson("http://127.0.0.1:4191/api/v1/quotas/tenants/tenant-lumen");
      assert.equal(quotaSnapshot.service, "quotaService");
      assert.ok(quotaSnapshot.data.quotas.some((quota) => quota.resource === "webhooks"));

      const quotaDeniedString = await postJson("http://127.0.0.1:4191/api/v1/quotas/check", {
        requested: "1000000",
        resource: "webhooks",
        tenantId: "tenant-lumen"
      });
      assert.equal(quotaDeniedString.status, "denied");
      assert.equal(quotaDeniedString.error.code, "quota_exceeded");

      const supportUsers = await getJson("http://127.0.0.1:4191/api/v1/service-admin/users?tenantId=tenant-volga&status=active&query=volga");
      assert.equal(supportUsers.service, "supportAdminService");
      assert.ok(supportUsers.data.items.every((user) => user.tenantId === "tenant-volga"));

      const forbiddenBlockResponse = await fetch("http://127.0.0.1:4191/api/v1/service-admin/users/usr-volga-admin/block", {
        method: "POST",
        headers: withRestrictedAdminKey({ "content-type": "application/json" }),
        body: JSON.stringify({
          confirmed: true,
          reason: "Runtime permission denial"
        })
      });
      assert.equal(forbiddenBlockResponse.status, 403);
      const forbiddenBlock = await forbiddenBlockResponse.json();
      assert.equal(forbiddenBlock.status, "denied");
      assert.equal(forbiddenBlock.error.code, "forbidden");

      const resetTwoFactor = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-ns-agent/2fa-reset", {
        confirmed: true,
        reason: "Runtime phone replacement"
      }, {
        "X-Demo-Service-Admin-Actor-Id": "runtime-admin-42",
        "X-Demo-Service-Admin-Actor-Name": "Runtime Admin"
      });
      assert.equal(resetTwoFactor.status, "ok");
      assert.equal(resetTwoFactor.data.user.mfa, "reset_pending");
      assert.equal(resetTwoFactor.data.auditEvent.actor, "runtime-admin-42");

      const resetTwoFactorAlias = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-ns-agent/mfa/reset", {
        confirmed: true,
        reason: "Runtime phone replacement"
      });
      assert.equal(resetTwoFactorAlias.status, "ok");

      const forcedLogout = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-volga-admin/force-logout", {
        confirmed: true,
        reason: "Runtime security check"
      });
      assert.equal(forcedLogout.data.user.sessions, 0);

      const forcedLogoutAlias = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-volga-admin/sessions/logout", {
        confirmed: true,
        reason: "Runtime security check"
      });
      assert.equal(forcedLogoutAlias.data.user.sessions, 0);

      const blockedUser = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-volga-admin/block", {
        confirmed: true,
        reason: "Runtime account compromise"
      });
      assert.equal(blockedUser.data.user.status, "blocked");

      const unblockedUser = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-volga-admin/unblock", {
        confirmed: true,
        reason: "Runtime account restored"
      });
      assert.equal(unblockedUser.data.user.status, "active");

      const resentInvite = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-lumen-invite/invite/resend", {
        confirmed: true,
        reason: "Runtime invite resend"
      });
      assert.equal(resentInvite.data.user.inviteStatus, "sent");

      const impersonation = await postJson("http://127.0.0.1:4191/api/v1/service-admin/impersonations/start", {
        confirmed: true,
        durationMinutes: 15,
        reason: "Runtime customer approved check",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      }, withTenantScope("tenant-volga"));
      assert.equal(impersonation.status, "ok");
      assert.equal(impersonation.data.impersonation.mode, "read_only_by_default");

      const impersonationAlias = await postJson("http://127.0.0.1:4191/api/v1/service-admin/impersonations", {
        confirmed: true,
        durationMinutes: 15,
        reason: "Runtime customer approved check",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      }, withTenantScope("tenant-volga"));
      assert.equal(impersonationAlias.data.duplicate, true);
      assert.equal(impersonationAlias.data.impersonation.id, impersonation.data.impersonation.id);

      const breakGlass = await postJson("http://127.0.0.1:4191/api/v1/service-admin/break-glass/approvals", {
        confirmed: true,
        reason: "Runtime emergency investigation",
        tenantId: "tenant-volga"
      }, withTenantScope("tenant-volga"));
      assert.equal(breakGlass.status, "ok");
      assert.equal(breakGlass.data.access.writeGranted, false);

      const breakGlassAlias = await postJson("http://127.0.0.1:4191/api/v1/service-admin/break-glass-approvals", {
        confirmed: true,
        reason: "Runtime user investigation",
        userId: "usr-volga-admin"
      }, withTenantScope("tenant-volga"));
      assert.equal(breakGlassAlias.status, "ok");
      assert.equal(breakGlassAlias.data.auditEvent.tenantId, "tenant-volga");

      const stoppedImpersonation = await postJson(`http://127.0.0.1:4191/api/v1/service-admin/impersonations/${impersonation.data.impersonation.id}/stop`, {
        reason: "Runtime exit reason"
      });
      assert.equal(stoppedImpersonation.status, "ok");
      assert.equal(stoppedImpersonation.data.auditEvent.action, "impersonation.stop");

      const duplicateStop = await postJson(`http://127.0.0.1:4191/api/v1/service-admin/impersonations/${impersonation.data.impersonation.id}/stop`, {
        reason: "Runtime exit reason repeated"
      });
      assert.equal(duplicateStop.status, "ok");
      assert.equal(duplicateStop.data.duplicate, true);
      assert.equal(duplicateStop.data.stoppedAt, stoppedImpersonation.data.stoppedAt);

      const missingUserProbe = await postJson("http://127.0.0.1:4191/api/v1/service-admin/users/usr-runtime-missing/block", {
        confirmed: true,
        reason: "Runtime missing user probe"
      }, {
        "X-Demo-Service-Admin-Actor-Id": "runtime-probe-admin",
        "X-Demo-Service-Admin-Actor-Name": "Runtime Probe Admin"
      });
      assert.equal(missingUserProbe.status, "not_found");
      assert.equal(missingUserProbe.error.code, "user_not_found");
      assert.equal(missingUserProbe.data.auditEvent.actor, "runtime-probe-admin");
      assert.equal(missingUserProbe.data.auditEvent.result, "blocked_user_not_found");

      const missingUserProbeAudit = await getJson("http://127.0.0.1:4191/api/v1/service-admin/audit-events?target=usr-runtime-missing");
      assert.equal(missingUserProbeAudit.status, "ok");
      assert.ok(missingUserProbeAudit.data.items.some((event) => event.id === missingUserProbe.data.auditEvent.id && event.actor === "runtime-probe-admin"));

      const auditEvents = await getJson("http://127.0.0.1:4191/api/v1/service-admin/audit-events?tenantId=tenant-volga&action=user.block");
      assert.equal(auditEvents.status, "ok");
      assert.ok(auditEvents.data.items.some((event) => event.action === "user.block"));

      const platformSnapshot = await getJson("http://127.0.0.1:4191/api/v1/platform/snapshot?status=degraded");
      assert.equal(platformSnapshot.service, "platformMonitoringService");
      assert.ok(platformSnapshot.data.components.every((component) => component.status !== "operational"));
      assert.ok(platformSnapshot.data.metrics.some((metric) => metric.id === "webhook_retry_queue"));

      const componentDrilldown = await getJson("http://127.0.0.1:4191/api/v1/platform/components/cmp-webhooks");
      assert.equal(componentDrilldown.status, "ok");
      assert.ok(componentDrilldown.data.affectedTenants.some((tenant) => tenant.id === "tenant-volga"));

      const platformAck = await postJson("http://127.0.0.1:4191/api/v1/platform/components/cmp-webhooks/acknowledgements", {
        confirmed: true,
        reason: "Runtime platform alert reviewed"
      });
      assert.equal(platformAck.status, "ok");
      assert.equal(platformAck.data.statusPageSync.queue, "status-page-sync");

      const incidentList = await getJson("http://127.0.0.1:4191/api/v1/incidents?componentId=cmp-webhooks&status=investigating");
      assert.equal(incidentList.service, "incidentService");
      assert.ok(incidentList.data.items.every((incident) => incident.componentId === "cmp-webhooks"));

      const incidentDetail = await getJson("http://127.0.0.1:4191/api/v1/incidents/inc-webhook-retry");
      assert.equal(incidentDetail.data.component.id, "cmp-webhooks");
      assert.equal(incidentDetail.data.postmortem.status, "not_started");

      const incidentUpdate = await postJson("http://127.0.0.1:4191/api/v1/incidents/inc-webhook-retry/updates", {
        confirmed: true,
        message: "Runtime webhook delivery delay is being monitored.",
        reason: "Runtime incident action",
        status: "monitoring"
      });
      assert.equal(incidentUpdate.status, "ok");
      assert.equal(incidentUpdate.data.realtimeEvent.eventName, "incident.updated");

      const featureFlags = await getJson("http://127.0.0.1:4191/api/v1/feature-flags?query=ai&status=on");
      assert.equal(featureFlags.service, "featureFlagService");
      assert.ok(featureFlags.data.items.some((flag) => flag.id === "flag-ai-replies"));

      const flagPreview = await postJson("http://127.0.0.1:4191/api/v1/feature-flags/flag-ai-replies/preview", {
        nextRollout: 100,
        nextStatus: "on",
        reason: "Runtime rollout preview"
      });
      assert.equal(flagPreview.status, "ok");
      assert.equal(flagPreview.data.confirmation.expectedText, "UPDATE ff-ai-replies");

      const flagUpdate = await patchJson("http://127.0.0.1:4191/api/v1/feature-flags/flag-ai-replies", {
        confirmationText: "UPDATE ff-ai-replies",
        confirmed: true,
        nextRollout: 100,
        nextStatus: "on",
        reason: "Runtime rollout preview"
      });
      assert.equal(flagUpdate.status, "ok");
      assert.equal(flagUpdate.data.outbox.queue, "feature-flag-rollout");

      const flagInternalTest = await postJson("http://127.0.0.1:4191/api/v1/feature-flags/flag-ai-replies/internal-tests", {
        segment: "business",
        tenantId: "tenant-northstar"
      });
      assert.equal(flagInternalTest.status, "ok");
      assert.equal(flagInternalTest.data.evaluation.eligible, true);

      const operationsReadiness = await getJson("http://127.0.0.1:4191/api/v1/operations/readiness?domain=delivery");
      assert.equal(operationsReadiness.service, "operationsReadinessService");
      assert.equal(operationsReadiness.data.summary.productionReady, false);
      assert.ok(operationsReadiness.data.loadTests.some((scenario) => scenario.id === "lt-webhook-delivery"));

      const deniedOperations = await fetch("http://127.0.0.1:4191/api/v1/operations/readiness", {
        headers: withRestrictedAdminKey()
      });
      assert.equal(deniedOperations.status, 403);

      const loadTestRun = await postJson("http://127.0.0.1:4191/api/v1/operations/load-tests/lt-critical-flows/runs", {
        confirmed: true,
        reason: "Runtime load test"
      });
      assert.equal(loadTestRun.status, "ok");
      assert.equal(loadTestRun.data.run.queue, "load-test-runs");

      const restoreCheck = await postJson("http://127.0.0.1:4191/api/v1/operations/backup-drills/backup-postgres-nightly/restore-checks", {
        confirmed: true,
        reason: "Runtime restore check"
      });
      assert.equal(restoreCheck.status, "ok");
      assert.equal(restoreCheck.data.restoreCheck.destructiveAllowed, false);

      const deadLetters = await getJson("http://127.0.0.1:4191/api/v1/operations/dead-letter?queue=webhook-delivery");
      assert.equal(deadLetters.status, "ok");
      assert.ok(deadLetters.data.messages.some((message) => message.id === "dlm-webhook-001"));

      const deadLetterReplay = await postJson("http://127.0.0.1:4191/api/v1/operations/dead-letter/dlm-webhook-001/replay", {
        confirmed: true,
        reason: "Runtime dead letter replay"
      });
      assert.equal(deadLetterReplay.status, "ok");
      assert.equal(deadLetterReplay.data.replay.queue, "dead-letter-replay");

      const rollbackCheck = await postJson("http://127.0.0.1:4191/api/v1/operations/migrations/mig-add-message-search-index/rollback-check", {
        confirmed: true,
        reason: "Runtime rollback check"
      });
      assert.equal(rollbackCheck.status, "ok");
      assert.equal(rollbackCheck.data.policy.requiresRollbackPlan, true);

      const securityReview = await getJson("http://127.0.0.1:4191/api/v1/operations/security-review?area=api_keys");
      assert.equal(securityReview.status, "ok");
      assert.ok(securityReview.data.controls.every((control) => control.secretMaterialExposed === false));

      const clients = await getJson("http://127.0.0.1:4191/api/v1/clients?maskSensitive=false&page=1&pageSize=5");
      assert.equal(clients.service, "clientService");
      assert.match(clients.data.items[0].phone, /^\+7 \*\*\* \*\*\*-\*\*-\d{2}$/);
      assert.ok(clients.data.mergeGraph.length > 0);

      const merge = await postJson("http://127.0.0.1:4191/api/v1/clients/merge", {
        primaryProfileId: "src_sdk_maria",
        candidateProfileId: "src_telegram_dmitry",
        reason: "Runtime duplicate merge"
      });
      assert.equal(merge.status, "ok");
      assert.equal(merge.data.auditEvent.immutable, true);

      const uploadDescriptor = await postJson("http://127.0.0.1:4191/api/v1/files/uploads", {
        channel: "SDK",
        fileName: "runtime.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048
      });
      assert.equal(uploadDescriptor.data.objectKeyExposed, false);
      assert.equal(uploadDescriptor.data.storageState, "upload_descriptor_ready");

      const finalizedUpload = await postJson(`http://127.0.0.1:4191/api/v1/files/${uploadDescriptor.data.fileId}/finalize`, {
        checksum: "runtime-sha256"
      });
      assert.equal(finalizedUpload.data.scanState, "scan_pending");

      const deniedDownload = await getJson(`http://127.0.0.1:4191/api/v1/files/${uploadDescriptor.data.fileId}/download-policy?roleMode=admin`);
      assert.equal(deniedDownload.status, "denied");

      const invalidOutboundResponse = await fetch("http://127.0.0.1:4191/api/v1/dialogs/outbound", {
        method: "POST",
        headers: withAdminKey({ "content-type": "application/json" }),
        body: JSON.stringify({})
      });
      assert.equal(invalidOutboundResponse.status, 200);
      const invalidOutbound = await invalidOutboundResponse.json();
      assert.equal(invalidOutbound.status, "invalid");
      assert.equal(invalidOutbound.error.code, "outbound_payload_required");

      const templates = await getJson("http://127.0.0.1:4191/api/v1/templates?operatorId=operator-1");
      assert.equal(templates.service, "templateService");
      assert.ok(templates.data.items.length > 0);

      const savedTemplate = await postJson("http://127.0.0.1:4191/api/v1/templates", {
        channel: "SDK",
        text: "Runtime template",
        title: "Runtime",
        topic: "Delivery"
      });
      assert.equal(savedTemplate.status, "ok");
      assert.match(savedTemplate.data.auditId, /^evt_template_/);

      const knowledge = await getJson("http://127.0.0.1:4191/api/v1/knowledge?visibility=public");
      assert.equal(knowledge.service, "knowledgeService");
      assert.ok(knowledge.data.items.every((article) => article.visibility === "public"));

      const knowledgeDetail = await getJson("http://127.0.0.1:4191/api/v1/knowledge/kb-delivery-tracking");
      assert.ok(knowledgeDetail.data.article.versions.length > 0);

      const draftArticle = await postJson("http://127.0.0.1:4191/api/v1/knowledge/kb-delivery-tracking/drafts", {
        body: "Runtime article update",
        reason: "Runtime review"
      });
      assert.equal(draftArticle.data.article.status, "draft");

      const docs = await getJson("http://127.0.0.1:4191/api/docs-json");
      assert.ok(docs.paths["/api/v1/health"]);
      assert.ok(docs.paths["/api/v1/auth/state"]);
      assert.ok(docs.paths["/api/v1/auth/login"]);
      assert.ok(docs.paths["/api/v1/auth/logout"]);
      assert.ok(docs.paths["/api/v1/tenants/{tenantId}"]);
      assert.ok(docs.paths["/api/v1/tenants/{tenantId}/status"]);
      assert.ok(docs.paths["/api/v1/permissions/validate"]);
      assert.ok(docs.paths["/api/v1/permissions/model"]);
      assert.ok(docs.paths["/api/v1/dialogs"]);
      assert.ok(docs.paths["/api/v1/dialogs/{conversationId}"]);
      assert.ok(docs.paths["/api/v1/dialogs/{conversationId}/status"]);
      assert.ok(docs.paths["/api/v1/dialogs/{conversationId}/messages"]);
      assert.ok(docs.paths["/api/v1/dialogs/attachments"]);
      assert.ok(docs.paths["/api/v1/dialogs/outbound"]);
      assert.ok(docs.paths["/api/v1/channels"]);
      assert.ok(docs.paths["/api/v1/channels/{channel}/inbound"]);
      assert.ok(docs.paths["/api/v1/realtime/events"]);
      assert.ok(docs.paths["/api/v1/routing/workload"]);
      assert.ok(docs.paths["/api/v1/routing/assignments"]);
      assert.ok(docs.paths["/api/v1/routing/sla/pause"]);
      assert.ok(docs.paths["/api/v1/routing/rescue/start"]);
      assert.ok(docs.paths["/api/v1/routing/rescue/resolve"]);
      assert.ok(docs.paths["/api/v1/routing/reports/rescue"]);
      assert.ok(docs.paths["/api/v1/reports/workspace"]);
      assert.ok(docs.paths["/api/v1/reports/exports"]);
      assert.ok(docs.paths["/api/v1/reports/exports/{jobId}/retry"]);
      assert.ok(docs.paths["/api/v1/reports/exports/{jobId}/file"]);
      assert.ok(docs.paths["/api/v1/reports/exports/{jobId}/download"]);
      assert.ok(docs.paths["/api/v1/integrations/workspace"]);
      assert.ok(docs.paths["/api/v1/integrations/channel-tests"]);
      assert.ok(docs.paths["/api/v1/integrations/api-keys/{keyId}/rotate"]);
      assert.ok(docs.paths["/api/v1/integrations/webhooks/deliveries/{deliveryId}/replay"]);
      assert.ok(docs.paths["/api/v1/integrations/security/sessions/{sessionId}/revoke"]);
      assert.ok(docs.paths["/api/v1/automation/workspace"]);
      assert.ok(docs.paths["/api/v1/automation/bot-flow/validate"]);
      assert.ok(docs.paths["/api/v1/automation/bot-flows/validate"]);
      assert.ok(docs.paths["/api/v1/automation/bots/{scenarioId}/publish"]);
      assert.ok(docs.paths["/api/v1/automation/bot-scenarios/{scenarioId}/publish"]);
      assert.ok(docs.paths["/api/v1/automation/bot-scenarios/{scenarioId}/test-runs"]);
      assert.ok(docs.paths["/api/v1/automation/proactive-rules"]);
      assert.ok(docs.paths["/api/v1/automation/handoff-events"]);
      assert.ok(docs.paths["/api/v1/automation/bot-handoffs"]);
      assert.ok(docs.paths["/api/v1/quality/workspace"]);
      assert.ok(docs.paths["/api/v1/quality/draft-score"]);
      assert.ok(docs.paths["/api/v1/quality/draft-scores"]);
      assert.ok(docs.paths["/api/v1/quality/ratings"]);
      assert.ok(docs.paths["/api/v1/quality/manual-reviews"]);
      assert.ok(docs.paths["/api/v1/billing/tariffs"]);
      assert.ok(docs.paths["/api/v1/billing/tariff-preview"]);
      assert.ok(docs.paths["/api/v1/billing/tenants/{tenantId}/tariff-change/preview"]);
      assert.ok(docs.paths["/api/v1/billing/tenants/{tenantId}/tariff-change"]);
      assert.ok(docs.paths["/api/v1/billing/tenants/{tenantId}/tariff"]);
      assert.ok(docs.paths["/api/v1/billing/quota-checks"]);
      assert.ok(docs.paths["/api/v1/quotas/tenants/{tenantId}"]);
      assert.ok(docs.paths["/api/v1/quotas/check"]);
      assert.ok(docs.paths["/api/v1/service-admin/users"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/2fa-reset"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/mfa/reset"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/force-logout"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/sessions/logout"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/block"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/unblock"]);
      assert.ok(docs.paths["/api/v1/service-admin/users/{userId}/invite/resend"]);
      assert.ok(docs.paths["/api/v1/service-admin/impersonations/start"]);
      assert.ok(docs.paths["/api/v1/service-admin/impersonations"]);
      assert.ok(docs.paths["/api/v1/service-admin/impersonations/{impersonationId}/stop"]);
      assert.ok(docs.paths["/api/v1/service-admin/break-glass/approvals"]);
      assert.ok(docs.paths["/api/v1/service-admin/break-glass-approvals"]);
      assert.ok(docs.paths["/api/v1/service-admin/audit-events"]);
      assert.ok(docs.paths["/api/v1/platform/snapshot"]);
      assert.ok(docs.paths["/api/v1/platform/components/{componentId}"]);
      assert.ok(docs.paths["/api/v1/platform/components/{componentId}/acknowledgements"]);
      assert.ok(docs.paths["/api/v1/platform-monitoring/snapshot"]);
      assert.ok(docs.paths["/api/v1/platform-monitoring/components/{componentId}"]);
      assert.ok(docs.paths["/api/v1/platform-monitoring/components/{componentId}/acknowledgements"]);
      assert.ok(docs.paths["/api/v1/incidents"]);
      assert.ok(docs.paths["/api/v1/incidents/{incidentId}"]);
      assert.ok(docs.paths["/api/v1/incidents/{incidentId}/updates"]);
      assert.ok(docs.paths["/api/v1/feature-flags"]);
      assert.ok(docs.paths["/api/v1/feature-flags/{flagId}/preview"]);
      assert.ok(docs.paths["/api/v1/feature-flags/{flagId}"]);
      assert.ok(docs.paths["/api/v1/feature-flags/{flagId}/internal-tests"]);
      assert.ok(docs.paths["/api/v1/operations/readiness"]);
      assert.ok(docs.paths["/api/v1/operations/load-tests/{scenarioId}/runs"]);
      assert.ok(docs.paths["/api/v1/operations/backup-drills/{drillId}/restore-checks"]);
      assert.ok(docs.paths["/api/v1/operations/dead-letter"]);
      assert.ok(docs.paths["/api/v1/operations/dead-letter/{messageId}/replay"]);
      assert.ok(docs.paths["/api/v1/operations/migrations/{migrationId}/rollback-check"]);
      assert.ok(docs.paths["/api/v1/operations/security-review"]);
      assert.ok(docs.paths["/api/v1/clients"]);
      assert.ok(docs.paths["/api/v1/clients/merge"]);
      assert.ok(docs.paths["/api/v1/files/uploads"]);
      assert.ok(docs.paths["/api/v1/files/{fileId}/finalize"]);
      assert.ok(docs.paths["/api/v1/files/{fileId}/download-policy"]);
      assert.ok(docs.paths["/api/v1/templates"]);
      assert.ok(docs.paths["/api/v1/knowledge"]);
      assert.ok(docs.paths["/api/v1/knowledge/{articleId}"]);
      assert.ok(docs.paths["/api/v1/knowledge/{articleId}/drafts"]);
    } finally {
      await stopGateway(gateway);
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: withAdminKey(headers) });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: withAdminKey({ "content-type": "application/json", ...headers }),
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
}

async function patchJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: withAdminKey({ "content-type": "application/json", ...headers }),
    body: JSON.stringify(body)
  });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
}

async function readSseChunk(url, expectedPattern, headers = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 3000);
  const response = await fetch(url, {
    headers: withAdminKey({ accept: "text/event-stream", ...headers }),
    signal: controller.signal
  });
  assert.equal(response.status, 200, `${url} returned ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  try {
    while (!expectedPattern.test(body)) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      body += decoder.decode(value, { stream: true });
    }
    return {
      body,
      contentType: response.headers.get("content-type") ?? ""
    };
  } catch (error) {
    if (timedOut && body) {
      return {
        body,
        contentType: response.headers.get("content-type") ?? ""
      };
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
  }
}

async function readWebSocketMessage(url, expectedPattern, headers = withAdminKey()) {
  const target = new URL(url);
  const key = randomBytes(16).toString("base64");
  const requestHeaders = {
    Upgrade: "websocket",
    Connection: "Upgrade",
    "Sec-WebSocket-Key": key,
    "Sec-WebSocket-Version": "13",
    ...headers
  };
  let activeSocket = null;
  let header = "";
  let status = 0;
  let body = Buffer.alloc(0);
  const messages = [];
  let finishWait = () => {};
  let timedOut = false;

  const request = httpRequest({
    headers: requestHeaders,
    hostname: target.hostname,
    method: "GET",
    path: `${target.pathname}${target.search}`,
    port: runtimePort(target)
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    request.destroy();
    activeSocket?.destroy();
    finishWait();
  }, 5000);

  try {
    await new Promise((resolve, reject) => {
      finishWait = resolve;
      const collectFrames = (chunk) => {
        body = Buffer.concat([body, chunk]);
        const parsed = readWebSocketTextFrames(body);
        body = parsed.remaining;
        messages.push(...parsed.messages);

        if (!expectedPattern || messages.some((message) => expectedPattern.test(message))) {
          resolve();
        }
      };

      request.once("response", (response) => {
        status = response.statusCode ?? 0;
        header = `HTTP/1.1 ${status}`;
        response.resume();
        resolve();
      });

      request.once("upgrade", (response, socket, head) => {
        activeSocket = socket;
        status = response.statusCode ?? 101;
        header = `HTTP/1.1 ${status}\r\n${response.rawHeaders.join("\r\n")}`;
        collectFrames(head);
        socket.on("data", collectFrames);
        socket.once("error", (error) => {
          if (status) {
            resolve();
            return;
          }

          reject(error);
        });
        socket.once("close", () => {
          if (status) {
            resolve();
          }
        });
      });

      request.once("error", (error) => {
        if (timedOut) {
          resolve();
          return;
        }

        if (status) {
          resolve();
          return;
        }

        const wrapped = new Error(`GET ${url} websocket request failed on port ${activeRuntimePort}: ${error.message}\n${formatProcessOutput(activeGatewayOutput)}`);
        wrapped.cause = error;
        reject(wrapped);
      });
      request.end();
    });

    return { header, messages, status, timedOut };
  } finally {
    clearTimeout(timeout);
    activeSocket?.destroy();
  }
}

function readWebSocketTextFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    let length = secondByte & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) {
        break;
      }
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const masked = (secondByte & 0x80) !== 0;
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) {
      break;
    }

    const opcode = firstByte & 0x0f;
    const payloadStart = offset + headerLength + maskLength;
    let payload = buffer.subarray(payloadStart, payloadStart + length);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload, (byte, index) => byte ^ mask[index % 4]);
    }

    if (opcode === 0x1) {
      messages.push(payload.toString("utf8"));
    }

    offset += frameLength;
  }

  return {
    messages,
    remaining: buffer.subarray(offset)
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withAdminKey(headers = {}) {
  return {
    "X-Demo-Service-Admin-Key": "dev-service-admin-key",
    "X-Demo-Service-Admin-Actor-Id": "runtime-admin",
    "X-Demo-Service-Admin-Actor-Name": "Runtime Admin",
    "X-Demo-Service-Admin-Mfa-Verified": "true",
    "X-Demo-Service-Admin-Permissions": "*",
    "X-Demo-Service-Admin-Roles": "admin",
    "X-Demo-Service-Admin-Session-Expires-At": "2999-01-01T00:00:00.000Z",
    ...headers
  };
}

function withRestrictedAdminKey(headers = {}) {
  return {
    "X-Demo-Service-Admin-Key": "dev-service-admin-key",
    "X-Demo-Service-Admin-Actor-Id": "runtime-readonly-admin",
    "X-Demo-Service-Admin-Actor-Name": "Runtime Readonly Admin",
    "X-Demo-Service-Admin-Mfa-Verified": "true",
    "X-Demo-Service-Admin-Permissions": "service-admin.users.read",
    "X-Demo-Service-Admin-Session-Expires-At": "2999-01-01T00:00:00.000Z",
    ...headers
  };
}

function withTenantScope(tenantId) {
  return {
    "X-Demo-Service-Admin-Tenant-Id": tenantId
  };
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  assert.equal(port > 0, true, "Expected an available runtime port");
  return port;
}

function rewriteRuntimeUrl(input) {
  const raw = typeof input === "string" ? input : input.url;
  const rewritten = raw.replace("127.0.0.1:4191", `127.0.0.1:${activeRuntimePort}`);
  if (typeof input === "string") {
    return rewritten;
  }

  return new Request(rewritten, input);
}

function runtimePort(target) {
  return target.hostname === "127.0.0.1" && target.port === "4191"
    ? activeRuntimePort
    : Number(target.port);
}

async function waitForGateway(gateway, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (gateway.exitCode !== null) {
      throw new Error(`Gateway exited early: ${formatProcessOutput(output)}`);
    }

    try {
      const response = await fetch("http://127.0.0.1:4191/api/v1/ready");
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the compiled Nest app is listening.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Gateway did not become ready in time");
}

function captureProcessOutput(child) {
  const output = {
    stderr: "",
    stdout: ""
  };
  const append = (key, chunk) => {
    output[key] = `${output[key]}${chunk.toString()}`.slice(-12_000);
  };

  child.stdout?.on("data", (chunk) => append("stdout", chunk));
  child.stderr?.on("data", (chunk) => append("stderr", chunk));
  return output;
}

function formatProcessOutput(output) {
  return [
    output.stderr ? `stderr:\n${output.stderr}` : "",
    output.stdout ? `stdout:\n${output.stdout}` : ""
  ].filter(Boolean).join("\n");
}

async function stopGateway(gateway) {
  if (gateway.exitCode !== null) {
    return;
  }

  gateway.kill();

  await Promise.race([
    new Promise((resolve) => gateway.once("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ]);
}
