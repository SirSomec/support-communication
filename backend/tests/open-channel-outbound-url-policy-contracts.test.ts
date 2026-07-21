import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertOpenChannelOutboundUrlSafe,
  normalizeOpenChannelOutboundUrl
} from "../apps/api-gateway/src/integrations/open-channel/outbound-url-policy.ts";

describe("Open Channel outbound URL policy", () => {
  it("rejects loopback, private literals and credential-bearing URLs", () => {
    for (const url of [
      "http://127.0.0.1/admin",
      "http://10.0.0.2/hook",
      "http://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://user:password@example.com/hook"
    ]) {
      assert.equal(normalizeOpenChannelOutboundUrl(url), null, url);
    }
  });

  it("rejects hostnames that resolve to private infrastructure", async () => {
    await assert.rejects(
      () => assertOpenChannelOutboundUrlSafe(
        "https://webhook.example/hook",
        async () => [{ address: "10.10.0.5" }]
      ),
      /open_channel_outbound_url_forbidden/
    );
  });

  it("allows a public destination and removes fragments", async () => {
    const url = await assertOpenChannelOutboundUrlSafe(
      "https://webhook.example/hook#secret",
      async () => [{ address: "93.184.216.34" }]
    );
    assert.equal(url, "https://webhook.example/hook");
  });

  it("allows only an explicitly trusted local callback origin", async () => {
    const options = { trustedOrigins: ["http://host.docker.internal:8081"] };
    assert.equal(
      normalizeOpenChannelOutboundUrl("http://host.docker.internal:8081/hooks/jivo-chat", options),
      "http://host.docker.internal:8081/hooks/jivo-chat"
    );
    await assert.rejects(
      () => assertOpenChannelOutboundUrlSafe("http://host.docker.internal:8082/hooks/jivo-chat", async () => [{ address: "192.168.1.2" }], options),
      /open_channel_outbound_url_forbidden/
    );
  });
});
