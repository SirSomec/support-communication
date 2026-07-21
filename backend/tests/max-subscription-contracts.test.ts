import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { subscribeMaxWebhook } from "../apps/api-gateway/src/integrations/max-subscription.ts";

describe("MAX webhook subscription", () => {
  it("uses the official endpoint, Authorization header, and subscription payload", async () => {
    let call: { init: any; url: string } | undefined;
    await subscribeMaxWebhook({
      accessToken: "max-token",
      fetcher: async (url, init) => {
        call = { init, url };
        return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
      },
      secret: "secret_123",
      webhookUrl: "https://support.example.com/api/v1/webhooks/max/conn-1"
    });
    assert.equal(call?.url, "https://platform-api2.max.ru/subscriptions");
    assert.deepEqual(call?.init.headers, { Authorization: "max-token", "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(call?.init.body), {
      secret: "secret_123",
      update_types: ["message_created", "bot_started"],
      url: "https://support.example.com/api/v1/webhooks/max/conn-1"
    });
  });

  it("rejects an insecure webhook URL before making an API request", async () => {
    await assert.rejects(
      () => subscribeMaxWebhook({ accessToken: "max-token", secret: "secret_123", webhookUrl: "http://localhost/hook" }),
      /max_webhook_url_must_use_https_443/
    );
  });
});
