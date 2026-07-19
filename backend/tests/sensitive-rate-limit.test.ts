import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rateLimitKey,
  resolveClientAddress,
  selectSensitiveRateLimitPolicy
} from "../apps/api-gateway/src/sensitive-rate-limit.middleware.ts";

describe("sensitive and public endpoint rate limits", () => {
  it("covers password, MFA, invite and recovery entry points", () => {
    for (const path of [
      "/api/v1/auth/login",
      "/api/v1/auth/tenant/login",
      "/api/v1/auth/invites/accept",
      "/api/v1/auth/recovery/request",
      "/api/v1/auth/recovery/complete"
    ]) {
      assert.ok(selectSensitiveRateLimitPolicy("POST", path), path);
    }
    assert.equal(selectSensitiveRateLimitPolicy("GET", "/api/v1/auth/tenant/state"), undefined);
  });

  it("covers public demo and variable-path integration ingress endpoints", () => {
    for (const path of [
      "/api/v1/public/demo-requests",
      "/api/v1/public/sdk/presence/heartbeat",
      "/api/v1/public/sdk/messages",
      "/api/v1/public/sdk/conversations/conversation-1/ratings",
      "/api/v1/webhooks/telegram",
      "/api/v1/webhooks/vk/connection-1",
      "/api/v1/webhooks/max/connection-2?signature=redacted",
      "/api/v1/open-channel/channel-token",
      "/api/v1/external-bot/webhooks/connection-3/bot-token"
    ]) {
      assert.ok(selectSensitiveRateLimitPolicy("POST", path), path);
    }
    assert.equal(selectSensitiveRateLimitPolicy("GET", "/api/v1/open-channel/channel-token/status"), undefined);
    assert.ok(selectSensitiveRateLimitPolicy("GET", "/api/v1/public/sdk/agents/status"));
    assert.equal(selectSensitiveRateLimitPolicy("POST", "/api/v1/webhooks/vk"), undefined);
  });

  it("uses proxy addresses only with an explicit trusted-proxy opt-in", () => {
    const previous = process.env.TRUST_PROXY_HEADERS;
    const request = {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.2" },
      socket: { remoteAddress: "172.18.0.3" }
    };
    delete process.env.TRUST_PROXY_HEADERS;
    assert.equal(resolveClientAddress(request), "172.18.0.3");
    process.env.TRUST_PROXY_HEADERS = "true";
    assert.equal(resolveClientAddress(request), "203.0.113.4");
    if (previous === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previous;
  });

  it("stores only hashes of addresses and accounts in Redis keys", () => {
    const key = rateLimitKey("tenant_login", "account", "person@example.test");
    assert.match(key, /^support:rate-limit:tenant_login:account:[a-f0-9]{64}$/);
    assert.doesNotMatch(key, /person|example/);
  });
});
