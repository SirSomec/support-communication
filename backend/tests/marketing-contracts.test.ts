import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashMarketingApiKey, normalizeConsentReply, normalizePhone, quietHoursEnd } from "../apps/api-gateway/src/marketing/marketing.service.ts";

describe("marketing API key contract", () => {
  it("stores a deterministic hash instead of the organization API key", () => {
    const key = "mk_live_0123456789abcdef";
    assert.equal(hashMarketingApiKey(key), hashMarketingApiKey(key));
    assert.notEqual(hashMarketingApiKey(key), key);
    assert.match(hashMarketingApiKey(key), /^[a-f0-9]{64}$/);
  });

  it("keeps production and test-looking values isolated", () => {
    assert.notEqual(hashMarketingApiKey("mk_live_same"), hashMarketingApiKey("mk_test_same"));
  });
});

describe("marketing quiet hours", () => {
  it("defers a launch to the next permitted hour in the tenant time zone", () => {
    const deferred = quietHoursEnd(new Date("2026-08-11T20:30:00.000Z"), 21, 9, "Europe/Moscow");
    assert.equal(deferred?.toISOString(), "2026-08-12T06:00:00.000Z");
  });

  it("does not defer a launch outside the configured quiet hours", () => {
    assert.equal(quietHoursEnd(new Date("2026-08-11T10:00:00.000Z"), 21, 9, "Europe/Moscow"), null);
  });
});

describe("marketing consent replies", () => {
  it("accepts only explicit consent or refusal replies", () => {
    assert.equal(normalizeConsentReply("\u0414\u0430!"), "grant");
    assert.equal(normalizeConsentReply("\u043e\u0442\u043a\u0430\u0437\u044b\u0432\u0430\u044e\u0441\u044c"), "withdraw");
    assert.equal(normalizeConsentReply("\u0438\u043d\u0442\u0435\u0440\u0435\u0441\u043d\u043e"), null);
  });
});

describe("marketing import identifiers", () => {
  it("normalizes Russian phone formats before exact matching", () => {
    assert.equal(normalizePhone("+7 (999) 123-45-67"), "79991234567");
    assert.equal(normalizePhone("8 999 123 45 67"), "79991234567");
  });
});
