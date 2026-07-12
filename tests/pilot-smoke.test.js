import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createPrismaClient } from "../backend/packages/database/dist/index.js";
import { waitForMailpitMfaOtp, waitForMailpitRecoveryToken } from "../scripts/mailpit-mfa-otp.mjs";

const baseUrl = (process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:4101/api/v1").replace(/\/+$/, "");
const databaseUrl = String(
  process.env.DATABASE_URL ?? "postgresql://support:support@127.0.0.1:56432/support_communication"
).trim();
const operatorPassword = "Public-SDK-Smoke-2026!";
const recoveredOperatorPassword = "Public-SDK-Recovered-2026!";
const tenantId = String(process.env.PILOT_TENANT_ID ?? "tenant-volga").trim();
const runId = `public_sdk_local_smoke_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const operatorEmail = `${runId}@smoke.local`;
const operatorId = `usr_${runId}`;
const widgetExternalId = String(process.env.PILOT_WIDGET_EXTERNAL_ID ?? runId);
const widgetMessageText = String(process.env.PILOT_WIDGET_MESSAGE_TEXT ?? "Pilot smoke: visitor message");
const operatorReplyText = String(process.env.PILOT_OPERATOR_REPLY_TEXT ?? "Pilot smoke: operator reply");
const environment = String(process.env.PILOT_PUBLIC_API_ENVIRONMENT ?? "stage").trim() || "stage";
const publicApiKey = `sk_test_${runId}_${randomBytes(16).toString("hex")}`;
const publicApiKeyId = `key_${runId}`;
const sdkQueueId = "queue-pilot-sdk-smoke";
const sdkConnectionId = "conn-pilot-sdk-smoke";
const expectedConversationId = `sdk_${createHash("sha256")
  .update(`${tenantId}:${widgetExternalId}`)
  .digest("hex")
  .slice(0, 24)}`;
const prisma = createPrismaClient({ datasourceUrl: databaseUrl });

before(async () => {
  assert.ok(databaseUrl, "DATABASE_URL is required for the local Public SDK smoke.");
  assert.equal(environment, "stage", "The self-seeded Public SDK smoke uses the stage environment.");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  assert.ok(tenant, `Seeded tenant ${tenantId} was not found.`);
  const preparedAt = new Date();
  await prisma.$transaction([
    prisma.team.upsert({
      create: { channels: ["SDK"], id: "group-line-1", name: "Line 1", scope: "Pilot smoke", status: "active", tenantId, updatedAt: preparedAt },
      update: { status: "active", updatedAt: preparedAt },
      where: { tenantId_id: { id: "group-line-1", tenantId } }
    }),
    prisma.supportQueue.upsert({
      create: { defaultTeamId: "group-line-1", id: sdkQueueId, name: "Pilot SDK smoke", status: "active", tenantId, updatedAt: preparedAt },
      update: { defaultTeamId: "group-line-1", name: "Pilot SDK smoke", status: "active", updatedAt: preparedAt },
      where: { tenantId_id: { id: sdkQueueId, tenantId } }
    }),
    prisma.channelConnection.upsert({
      create: {
        chatLimit: 20,
        credentialsMasked: true,
        environment,
        health: 100,
        id: sdkConnectionId,
        lastSyncAt: new Date(),
        name: "Pilot SDK smoke",
        rawExternalId: "sdk:pilot-smoke",
        routingQueueId: sdkQueueId,
        status: "active",
        tenantId,
        traffic: "smoke",
        type: "sdk",
        webhookUrl: "https://pilot-smoke.local/sdk"
      },
      update: { environment, routingQueueId: sdkQueueId, status: "active" },
      where: { id: sdkConnectionId }
    }),
    prisma.tenantUser.create({
      data: {
        device: "release-gate",
        email: operatorEmail,
        id: operatorId,
        inviteStatus: "accepted",
        lastActiveAt: null,
        metadata: { employeeSettings: { chatLimit: 20 }, smoke: true },
        mfa: "enabled",
        name: "Public SDK Smoke Operator",
        risk: "low",
        role: "Admin",
        sessions: 0,
        status: "active",
        supportNotes: "Ephemeral operator for Public SDK release smoke.",
        tenantId
      }
    }),
    prisma.teamMembership.create({
      data: {
        active: true,
        id: `tm_${runId}`,
        operatorId,
        role: "member",
        teamId: "group-line-1",
        tenantId,
        updatedAt: preparedAt
      }
    }),
    prisma.queueMembership.create({
      data: {
        active: true,
        id: `qm_${runId}`,
        operatorId,
        queueId: sdkQueueId,
        role: "member",
        tenantId,
        updatedAt: preparedAt
      }
    }),
    prisma.passwordCredential.create({
      data: {
        algorithm: "sha256",
        email: operatorEmail,
        hash: `sha256:${createHash("sha256").update(operatorPassword).digest("hex")}`,
        subjectId: operatorId,
        updatedAt: new Date(),
        version: 1
      }
    }),
    prisma.publicApiKey.create({
      data: {
        channelConnectionId: sdkConnectionId,
        environment,
        keyId: publicApiKeyId,
        keyPreview: `sk_test_****_${publicApiKey.slice(-4)}`,
        name: "Local Public SDK release smoke",
        owner: "release-gate",
        scopes: ["clients:identify", "conversations:write"],
        secretHash: createHash("sha256").update(publicApiKey).digest("hex"),
        status: "active",
        tenantId
      }
    })
  ]);
});

after(async () => {
  try {
    if (process.env.PILOT_SMOKE_KEEP_EVIDENCE !== "true") {
      await cleanupSmokeEvidence();
    }
  } finally {
    await prisma.$disconnect?.();
  }
});

describe("pilot smoke flow", () => {
  it("covers widget -> operator -> widget roundtrip against live API", async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200, "Health endpoint is unavailable.");

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200, "Ready endpoint is unavailable.");

    const loginEnvelope = await loginTenantOperator();
    assert.equal(loginEnvelope.status, "ok");
    assert.equal(loginEnvelope.data?.authenticated, true);
    const accessToken = String(loginEnvelope.data?.accessToken ?? "");
    assert.ok(accessToken, "Tenant operator login did not return accessToken.");

    const queuesEnvelope = await getJson(`${baseUrl}/routing/queues?status=active`, {
      authorization: `Bearer ${accessToken}`
    });
    assert.equal(queuesEnvelope.status, "ok");
    assert.equal(
      queuesEnvelope.data?.queues?.some(
        (queue) => queue?.id === sdkQueueId && queue?.defaultTeamId === "group-line-1" && queue?.memberIds?.includes(operatorId)
      ),
      true,
      "Canonical SDK queue, team or operator membership is unavailable through the live API."
    );

    const identifyEnvelope = await publicPost("/public/sdk/identify", {
      externalId: widgetExternalId
    });
    assert.equal(identifyEnvelope.status, "ok");
    const conversationId = String(identifyEnvelope.data?.conversationId ?? "");
    assert.ok(conversationId, "identify did not return conversationId.");
    assert.equal(conversationId, expectedConversationId);

    const sendEnvelope = await publicPost("/public/sdk/messages", {
      conversationId,
      externalId: widgetExternalId,
      pageUrl: "https://pilot-smoke.local/demo",
      text: widgetMessageText
    });
    assert.equal(sendEnvelope.status, "ok");
    assert.equal(String(sendEnvelope.data?.conversationId ?? ""), conversationId);
    assert.equal(sendEnvelope.data?.autoAssignment?.assignment?.action, "assign");
    assert.equal(sendEnvelope.data?.autoAssignment?.assignment?.targetOperatorId, operatorId);
    const visitorSessionToken = String(sendEnvelope.data?.visitorSessionToken ?? "");
    assert.ok(visitorSessionToken, "send message did not return visitorSessionToken.");

    const dialogsEnvelope = await getJson(`${baseUrl}/dialogs?page=1&pageSize=100`, {
      authorization: `Bearer ${accessToken}`
    });
    assert.equal(dialogsEnvelope.status, "ok");
    assert.equal(
      Array.isArray(dialogsEnvelope.data?.items) && dialogsEnvelope.data.items.some((item) => item?.id === conversationId),
      true,
      "Operator dialogs list does not include conversation from widget."
    );

    const assigneesEnvelope = await getJson(`${baseUrl}/dialogs/assignees`, {
      authorization: `Bearer ${accessToken}`
    });
    assert.equal(assigneesEnvelope.status, "ok");
    assert.equal(assigneesEnvelope.data?.items?.some((item) => item?.id === operatorId), true);
    const assignedDialogsEnvelope = await getJson(`${baseUrl}/dialogs?page=1&pageSize=100`, {
      authorization: `Bearer ${accessToken}`
    });
    const assignedDialog = assignedDialogsEnvelope.data?.items?.find((item) => item?.id === conversationId);
    assert.equal(assignedDialog?.operatorId, operatorId);
    assert.equal(assignedDialog?.queueId, sdkQueueId);
    assert.equal(assignedDialog?.teamId, "group-line-1");

    const returnEnvelope = await postJson(
      `${baseUrl}/routing/assignments`,
      { action: "return_queue", conversationId, reason: "Pilot smoke return to queue" },
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(returnEnvelope.status, "ok");
    const redistributionKey = `pilot-redistribution-${widgetExternalId}`;
    const redistributionPayload = {
      idempotencyKey: redistributionKey,
      reason: "Pilot smoke canonical redistribution",
      selectedQueues: [sdkQueueId],
      targetRule: "least_loaded"
    };
    const redistributionPreview = await postJson(
      `${baseUrl}/routing/redistribution/preview`,
      redistributionPayload,
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(redistributionPreview.status, "ok");
    assert.equal(redistributionPreview.data?.plan?.some((item) => item.conversationId === conversationId), true);
    const redistributionCommit = await postJson(
      `${baseUrl}/routing/redistribution/commit`,
      redistributionPayload,
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(redistributionCommit.status, "ok");
    assert.equal(redistributionCommit.data?.appliedAssignments?.some((item) => item.conversationId === conversationId), true);
    const redistributedDialogsEnvelope = await getJson(`${baseUrl}/dialogs?page=1&pageSize=100`, {
      authorization: `Bearer ${accessToken}`
    });
    assert.equal(redistributedDialogsEnvelope.data?.items?.find((item) => item?.id === conversationId)?.operatorId, operatorId);

    const workloadEnvelope = await getJson(`${baseUrl}/routing/workload`, {
      authorization: `Bearer ${accessToken}`
    });
    assert.equal(workloadEnvelope.status, "ok");
    assert.equal(workloadEnvelope.data?.dataQuality?.canonical, true);
    assert.equal(workloadEnvelope.data?.queues?.some((queue) => queue.channel === sdkQueueId && queue.active >= 1), true);
    assert.equal(workloadEnvelope.data?.operators?.some((operator) => operator.id === operatorId && operator.chats >= 1), true);

    const rescueStartEnvelope = await postJson(
      `${baseUrl}/routing/rescue/start`,
      { conversationId, reason: "Pilot smoke rescue workflow", source: "pilot_smoke" },
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(rescueStartEnvelope.status, "ok");
    assert.equal(rescueStartEnvelope.data?.rescue?.state, "active");

    const rescueDialogsEnvelope = await getJson(`${baseUrl}/dialogs?page=1&pageSize=100`, {
      authorization: `Bearer ${accessToken}`
    });
    const rescueDialog = rescueDialogsEnvelope.data?.items?.find((item) => item?.id === conversationId);
    assert.equal(rescueDialog?.rescueState?.state, "active");

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const appendEnvelope = await postJson(
      `${baseUrl}/dialogs/${encodeURIComponent(conversationId)}/messages`,
      {
        mode: "reply",
        text: operatorReplyText
      },
      {
        authorization: `Bearer ${accessToken}`
      }
    );
    assert.equal(appendEnvelope.status, "ok");

    const polledReply = await waitForOperatorReply({
      conversationId,
      expectedText: operatorReplyText,
      visitorSessionToken
    });
    assert.equal(polledReply.text, operatorReplyText);

    const rescueResolveEnvelope = await postJson(
      `${baseUrl}/routing/rescue/resolve`,
      { conversationId, outcome: "saved", reason: "Pilot smoke operator replied" },
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(rescueResolveEnvelope.status, "ok");
    assert.equal(rescueResolveEnvelope.data?.rescue?.state, "saved");
    const rescueReportEnvelope = await getJson(`${baseUrl}/routing/reports/rescue?period=today`, {
      authorization: `Bearer ${accessToken}`
    });
    assert.equal(rescueReportEnvelope.status, "ok");
    assert.equal(rescueReportEnvelope.data?.rows?.some((row) => row.conversationId === conversationId && row.outcome === "saved"), true);

    const reportEnvelope = await getJson(
      `${baseUrl}/reports/workspace?period=${encodeURIComponent("Сегодня")}&channel=SDK`,
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(reportEnvelope.status, "ok");
    assert.equal(reportEnvelope.data?.source, "conversation_lifecycle_events");
    assert.equal(reportEnvelope.data?.hasActivity, true);
    assert.ok(
      Number(reportEnvelope.data?.rows?.find((row) => row.metric === "Новые диалоги")?.today) >= 1,
      "Reports did not count the real SDK conversation for the current tenant."
    );
    assert.deepEqual(reportEnvelope.data?.bars, [["SDK", 100]]);
    assert.equal(reportEnvelope.data?.filterOptions?.queueId?.includes(sdkQueueId), true);
    assert.equal(reportEnvelope.data?.filterOptions?.teamId?.includes("group-line-1"), true);
    assert.equal(
      reportEnvelope.data?.rows?.find((row) => row.metric === "Среднее время первого ответа")?.today === "00:00",
      false,
      "Reports did not calculate the first operator response from persisted messages."
    );

    const routingActivityEnvelope = await getJson(
      `${baseUrl}/reports/routing-activity?period=today&channel=SDK&operatorId=${encodeURIComponent(operatorId)}`,
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(routingActivityEnvelope.status, "ok");
    assert.equal(routingActivityEnvelope.data?.source, "routing_analytics_rows");
    assert.equal(routingActivityEnvelope.data?.empty, false);
    assert.equal(routingActivityEnvelope.data?.rows?.some((row) => row.operatorId === operatorId && row.assignments >= 1), true);
    assert.equal(routingActivityEnvelope.data?.totals?.assignments >= 1, true);
    assert.equal(routingActivityEnvelope.data?.totals?.operators, 1);
    assert.equal(routingActivityEnvelope.data?.totals?.totalEvents >= 1, true);
    assert.equal(routingActivityEnvelope.data?.totals?.transfers, 0);

    const recoveryRequest = await postJson(`${baseUrl}/auth/recovery/request`, { email: operatorEmail });
    assert.equal(recoveryRequest.status, "ok");
    assert.deepEqual(recoveryRequest.data, { queued: true });
    assert.equal(JSON.stringify(recoveryRequest).includes("recovery_"), false);
    const recoveryToken = await waitForMailpitRecoveryToken({ email: operatorEmail });
    const recoveryReset = await postJson(`${baseUrl}/auth/recovery/complete`, {
      email: operatorEmail,
      password: recoveredOperatorPassword,
      token: recoveryToken
    });
    assert.equal(recoveryReset.status, "ok");
    assert.equal(recoveryReset.data?.authenticated, false);
    assert.equal(recoveryReset.data?.nextStep, "otp");
    const revokedSessionResponse = await fetch(`${baseUrl}/dialogs?page=1&pageSize=1`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(revokedSessionResponse.status, 401, "Password recovery did not revoke the previous operator session.");

    const recoveryOtp = await waitForMailpitMfaOtp({
      challengeId: String(recoveryReset.data?.mfaChallengeId ?? ""),
      email: operatorEmail
    });
    const recoveredLogin = await postJson(`${baseUrl}/auth/recovery/complete`, {
      email: operatorEmail,
      mfaChallengeId: recoveryReset.data?.mfaChallengeId,
      otp: recoveryOtp,
      password: recoveredOperatorPassword,
      token: recoveryToken
    });
    assert.equal(recoveredLogin.status, "ok");
    assert.equal(recoveredLogin.data?.authenticated, true);
    assert.ok(recoveredLogin.data?.accessToken);
  });
});

async function loginTenantOperator() {
  const passwordEnvelope = await postJson(`${baseUrl}/auth/tenant/login`, {
    email: operatorEmail,
    password: operatorPassword,
    tenantId
  });
  if (passwordEnvelope.data?.accessToken) {
    return passwordEnvelope;
  }

  const mfaChallengeId = String(passwordEnvelope.data?.mfaChallengeId ?? "");
  assert.equal(passwordEnvelope.status, "ok");
  assert.equal(passwordEnvelope.data?.nextStep, "otp");
  assert.ok(mfaChallengeId, "Tenant operator login did not return an MFA challenge.");
  const operatorOtp = await waitForMailpitMfaOtp({
    challengeId: mfaChallengeId,
    email: operatorEmail
  });

  return postJson(`${baseUrl}/auth/tenant/login`, {
    email: operatorEmail,
    mfaChallengeId,
    otp: operatorOtp,
    tenantId
  });
}

async function cleanupSmokeEvidence() {
  const [descriptors, messages] = await Promise.all([
    prisma.conversationOutboundDescriptor.findMany({
      select: { id: true, outboxEventId: true },
      where: { conversationId: expectedConversationId }
    }),
    prisma.conversationMessage.findMany({
      select: { id: true },
      where: { conversationId: expectedConversationId }
    })
  ]);
  const outboxEventIds = descriptors.map((descriptor) => descriptor.outboxEventId).filter(Boolean);
  const realtimeResourceIds = [expectedConversationId, ...messages.map((message) => message.id)];

  await prisma.$transaction([
    prisma.routingAnalyticsRow.deleteMany({ where: { conversationId: expectedConversationId } }),
    prisma.queueMembership.deleteMany({ where: { operatorId, tenantId } }),
    prisma.channelDeliveryReceipt.deleteMany({ where: { conversationId: expectedConversationId } }),
    prisma.conversationOutboundDescriptor.deleteMany({ where: { conversationId: expectedConversationId } }),
    prisma.conversationRealtimeEvent.deleteMany({ where: { resourceId: { in: realtimeResourceIds } } }),
    // Conversation lifecycle events are an append-only audit trail. Each run uses
    // a unique conversation id, so the evidence remains isolated and queryable.
    prisma.outboxEvent.deleteMany({ where: { id: { in: outboxEventIds } } }),
    prisma.publicApiKey.deleteMany({ where: { keyId: publicApiKeyId } }),
    prisma.serviceAdminSession.deleteMany({ where: { adminId: operatorId } }),
    prisma.mfaChallenge.deleteMany({ where: { email: operatorEmail } }),
    prisma.authRecoveryToken.deleteMany({ where: { email: operatorEmail } }),
    prisma.passwordCredential.deleteMany({ where: { email: operatorEmail } }),
    prisma.tenantUser.deleteMany({ where: { id: operatorId } })
  ]);
}

async function publicPost(path, payload) {
  const params = new URLSearchParams({ environment });
  return postJson(`${baseUrl}${path}?${params.toString()}`, payload, {
    authorization: `Bearer ${publicApiKey}`
  });
}

async function publicPoll(conversationId, visitorSessionToken, sinceMessageId) {
  const params = new URLSearchParams({
    environment,
    visitorSessionToken
  });
  if (sinceMessageId) {
    params.set("since", sinceMessageId);
  }

  return getJson(
    `${baseUrl}/public/sdk/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    {
      authorization: `Bearer ${publicApiKey}`
    }
  );
}

async function waitForOperatorReply({ conversationId, expectedText, visitorSessionToken }) {
  const deadline = Date.now() + 20_000;
  let sinceMessageId = "";

  while (Date.now() < deadline) {
    const pollEnvelope = await publicPoll(conversationId, visitorSessionToken, sinceMessageId);
    assert.equal(pollEnvelope.status, "ok");
    const messages = Array.isArray(pollEnvelope.data?.messages) ? pollEnvelope.data.messages : [];

    const matchedReply = messages.find((message) => String(message?.text ?? "") === expectedText);
    if (matchedReply) {
      return matchedReply;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.id) {
      sinceMessageId = String(lastMessage.id);
    }

    await delay(1_000);
  }

  throw new Error(`Widget poll did not return expected operator reply within timeout: "${expectedText}".`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(payload)
  });
  return parseEnvelope(response, url);
}

async function patchJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(payload)
  });
  return parseEnvelope(response, url);
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers
  });
  return parseEnvelope(response, url);
}

async function parseEnvelope(response, url) {
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, 200, `Request failed (${response.status}) for ${url}`);
  assert.ok(payload && typeof payload === "object", `Response is not a JSON envelope for ${url}`);
  return payload;
}
