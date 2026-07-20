import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChannelConnectionPayload,
  getIntegrationProduct,
  validateIntegrationSetup
} from "../src/features/settings/integrationCenterModel.js";

test("integration center builds provider-safe channel payloads", () => {
  const telegram = getIntegrationProduct("telegram");
  const vk = getIntegrationProduct("vk");

  assert.deepEqual(buildChannelConnectionPayload(telegram, {
    name: "Support bot",
    routingQueueId: "queue-support",
    token: "123:token"
  }), {
    chatLimit: 8,
    credentials: { token: "123:token" },
    environment: "production",
    name: "Support bot",
    routingQueueId: "queue-support",
    type: "telegram"
  });

  assert.deepEqual(buildChannelConnectionPayload(vk, {
    groupId: "12345",
    name: "VK support",
    routingQueueId: "queue-support",
    token: "vk-token"
  }).credentials, {
    groupId: "12345",
    token: "vk-token"
  });
});

test("integration center explains the missing setup field", () => {
  const telegram = getIntegrationProduct("telegram");
  assert.match(validateIntegrationSetup(telegram, { name: "" }), /понятное название/);
  assert.match(validateIntegrationSetup(telegram, { name: "Support", token: "" }), /Токен бота/);
  assert.equal(validateIntegrationSetup(telegram, { name: "Support", token: "123:token" }), "");
});
