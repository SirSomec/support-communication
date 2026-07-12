import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateUrlKnowledgeSourceConfig } from "./url-source-config.js";

describe("validateUrlKnowledgeSourceConfig", () => {
  it("normalizes safe HTTPS URLs and removes fragments", () => {
    const result = validateUrlKnowledgeSourceConfig({ url: " HTTPS://Docs.Example.com:443/guide#section " });
    assert.deepEqual(result, { ok: true, hostname: "docs.example.com", config: { url: "https://docs.example.com/guide" } });
  });

  it("rejects malformed, non-HTTPS and credential-bearing URLs", () => {
    assert.deepEqual(validateUrlKnowledgeSourceConfig({}), { ok: false, code: "url_source_config_invalid" });
    assert.deepEqual(validateUrlKnowledgeSourceConfig({ url: "http://example.com" }), { ok: false, code: "url_source_https_required" });
    assert.deepEqual(validateUrlKnowledgeSourceConfig({ url: "https://user:pass@example.com" }), { ok: false, code: "url_source_credentials_forbidden" });
  });

  it("rejects localhost and private or reserved IPv4 literals", () => {
    for (const host of ["localhost", "api.localhost", "127.0.0.1", "10.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1"]) {
      assert.deepEqual(validateUrlKnowledgeSourceConfig({ url: `https://${host}/` }), { ok: false, code: "url_source_host_forbidden" }, host);
    }
  });

  it("rejects localhost and private or reserved IPv6 literals", () => {
    for (const host of ["[::1]", "[::]", "[fc00::1]", "[fe80::1]", "[ff02::1]", "[2001:db8::1]", "[::ffff:127.0.0.1]"]) {
      assert.deepEqual(validateUrlKnowledgeSourceConfig({ url: `https://${host}/` }), { ok: false, code: "url_source_host_forbidden" }, host);
    }
  });

  it("enforces an optional exact host allowlist", () => {
    assert.equal(validateUrlKnowledgeSourceConfig({ url: "https://docs.example.com/a" }, { allowedHosts: ["docs.example.com"] }).ok, true);
    assert.deepEqual(validateUrlKnowledgeSourceConfig({ url: "https://other.example.com/a" }, { allowedHosts: ["docs.example.com"] }), { ok: false, code: "url_source_host_not_allowed" });
  });

  it("enforces normalized URL length", () => {
    assert.deepEqual(validateUrlKnowledgeSourceConfig({ url: "https://example.com/long" }, { maxNormalizedLength: 20 }), { ok: false, code: "url_source_too_long" });
  });
});
