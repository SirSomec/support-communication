import assert from "node:assert/strict";
import { describe, it } from "node:test";

const enabled = process.env.RUN_PILOT_SMOKE === "1";
const baseUrl = (process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:4100/api/v1").replace(/\/+$/, "");
const publicApiKey = String(process.env.PILOT_PUBLIC_API_KEY ?? "").trim();
const operatorEmail = String(process.env.PILOT_OPERATOR_EMAIL ?? "operator@pilot-client.test").trim().toLowerCase();
const operatorPassword = String(process.env.PILOT_OPERATOR_PASSWORD ?? "Pilot-Operator-2026!");
const widgetExternalId = String(process.env.PILOT_WIDGET_EXTERNAL_ID ?? `pilot-smoke-${Date.now()}`);
const widgetMessageText = String(process.env.PILOT_WIDGET_MESSAGE_TEXT ?? "Pilot smoke: visitor message");
const operatorReplyText = String(process.env.PILOT_OPERATOR_REPLY_TEXT ?? "Pilot smoke: operator reply");
const environment = String(process.env.PILOT_PUBLIC_API_ENVIRONMENT ?? "stage").trim() || "stage";

describe("pilot smoke flow", { skip: !enabled }, () => {
  it("covers widget -> operator -> widget roundtrip against live API", async () => {
    assert.ok(publicApiKey, "Set PILOT_PUBLIC_API_KEY before running RUN_PILOT_SMOKE=1.");

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200, "Health endpoint is unavailable.");

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200, "Ready endpoint is unavailable.");

    const loginEnvelope = await postJson(`${baseUrl}/auth/tenant/login`, {
      email: operatorEmail,
      password: operatorPassword
    });
    assert.equal(loginEnvelope.status, "ok");
    const accessToken = String(loginEnvelope.data?.accessToken ?? "");
    assert.ok(accessToken, "Tenant operator login did not return accessToken.");

    const identifyEnvelope = await publicPost("/public/sdk/identify", {
      externalId: widgetExternalId
    });
    assert.equal(identifyEnvelope.status, "ok");
    const conversationId = String(identifyEnvelope.data?.conversationId ?? "");
    assert.ok(conversationId, "identify did not return conversationId.");

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
  });
});

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
