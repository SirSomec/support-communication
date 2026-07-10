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
  await prisma.$transaction([
    prisma.tenantUser.create({
      data: {
        device: "release-gate",
        email: operatorEmail,
        id: operatorId,
        inviteStatus: "accepted",
        lastActiveAt: null,
        metadata: { smoke: true },
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
    await cleanupSmokeEvidence();
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
    const assignmentEnvelope = await patchJson(
      `${baseUrl}/dialogs/${encodeURIComponent(conversationId)}/assignment`,
      {
        operatorId,
        reason: "Pilot smoke queue assignment"
      },
      {
        authorization: `Bearer ${accessToken}`
      }
    );
    assert.equal(assignmentEnvelope.status, "ok");
    assert.equal(assignmentEnvelope.data?.action, "assignment");
    assert.equal(assignmentEnvelope.data?.conversation?.operatorId, operatorId);

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

    const reportEnvelope = await getJson(
      `${baseUrl}/reports/workspace?period=${encodeURIComponent("Сегодня")}&channel=SDK`,
      { authorization: `Bearer ${accessToken}` }
    );
    assert.equal(reportEnvelope.status, "ok");
    assert.equal(reportEnvelope.data?.source, "tenant_conversations");
    assert.equal(reportEnvelope.data?.hasActivity, true);
    assert.ok(
      Number(reportEnvelope.data?.rows?.find((row) => row.metric === "Новые диалоги")?.today) >= 1,
      "Reports did not count the real SDK conversation for the current tenant."
    );
    assert.deepEqual(reportEnvelope.data?.bars, [["SDK", 100]]);
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
    assert.equal(routingActivityEnvelope.data?.rows?.some((row) => row.operatorId === operatorId && row.assignments === 1), true);
    assert.deepEqual(routingActivityEnvelope.data?.totals, {
      assignments: 1,
      operators: 1,
      totalEvents: 1,
      transfers: 0,
      unattributedEvents: 0
    });

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
    prisma.channelDeliveryReceipt.deleteMany({ where: { conversationId: expectedConversationId } }),
    prisma.conversationOutboundDescriptor.deleteMany({ where: { conversationId: expectedConversationId } }),
    prisma.conversationRealtimeEvent.deleteMany({ where: { resourceId: { in: realtimeResourceIds } } }),
    prisma.conversation.deleteMany({ where: { id: expectedConversationId } }),
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
