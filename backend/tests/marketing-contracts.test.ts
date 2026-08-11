import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MARKETING_CONSENT_TEXT, hashMarketingApiKey, isLegacyMarketingConsentText, normalizeConsentReply, normalizePhone, quietHoursEnd } from "../apps/api-gateway/src/marketing/marketing.service.ts";

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
  it("explains that any reply is treated as marketing consent", () => {
    assert.match(DEFAULT_MARKETING_CONSENT_TEXT, /ответьте.+любым текстом/i);
    assert.match(DEFAULT_MARKETING_CONSENT_TEXT, /соглашаетесь.+маркетинговых сообщений/i);
  });

  it("upgrades only known legacy prompts without overwriting owner copy", () => {
    assert.equal(isLegacyMarketingConsentText("Согласны на рекламу?"), true);
    assert.equal(isLegacyMarketingConsentText("Разрешаете получать маркетинговые сообщения? Ответьте «Да», чтобы подтвердить согласие."), true);
    assert.equal(isLegacyMarketingConsentText("Наш согласованный юридический текст"), false);
  });

  it("treats any non-empty reply after the request as consent", () => {
    assert.equal(normalizeConsentReply("\u0414\u0430!"), "grant");
    assert.equal(normalizeConsentReply("\u0438\u043d\u0442\u0435\u0440\u0435\u0441\u043d\u043e"), "grant");
    assert.equal(normalizeConsentReply("\u043d\u0435\u0442"), "grant");
    assert.equal(normalizeConsentReply("Attachment received"), "grant");
    assert.equal(normalizeConsentReply("   "), null);
  });
});

describe("marketing import identifiers", () => {
  it("normalizes Russian phone formats before exact matching", () => {
    assert.equal(normalizePhone("+7 (999) 123-45-67"), "79991234567");
    assert.equal(normalizePhone("8 999 123 45 67"), "79991234567");
  });
});
