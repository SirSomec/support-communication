import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MARKETING_CONSENT_TEXT, hashMarketingApiKey, inboundMarketingDeliveryAddress, inboundMarketingProfileIdentity, isLegacyMarketingConsentText, isMarketingTenantOwner, marketingChannelIsRestricted, marketingChannelRestrictionKey, marketingConsentAllowsDelivery, marketingConsentPolicy, marketingContentForChannel, marketingConversationSourceProfileId, marketingDestinationIsUsable, marketingDestinationKey, marketingDestinationPayload, marketingTestRecipientSearchTerms, maskMarketingTestRecipientEmail, maskMarketingTestRecipientPhone, normalizeConsentReply, normalizeMarketingChannel, normalizeMarketingImportRecord, normalizePhone, quietHoursEnd } from "../apps/api-gateway/src/marketing/marketing.service.ts";

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
  it("keeps consent requests enabled and consent bypass disabled by default", () => {
    assert.deepEqual(marketingConsentPolicy(undefined), { allowWithoutConsent: false, requestConsentEnabled: true });
    assert.deepEqual(marketingConsentPolicy({ allowWithoutConsent: true, requestConsentEnabled: false }), { allowWithoutConsent: true, requestConsentEnabled: false });
  });

  it("allows an explicit bypass without overriding a withdrawn consent", () => {
    assert.equal(marketingConsentAllowsDelivery("granted", false), true);
    assert.equal(marketingConsentAllowsDelivery(undefined, false), false);
    assert.equal(marketingConsentAllowsDelivery(undefined, true), true);
    assert.equal(marketingConsentAllowsDelivery("pending", true), true);
    assert.equal(marketingConsentAllowsDelivery("withdrawn", true), false);
  });

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

  it("uses a stable tenant- and channel-scoped identity for first inbound consent", () => {
    const telegram = inboundMarketingProfileIdentity("tenant-a", "Telegram", "user-42");
    assert.equal(telegram, inboundMarketingProfileIdentity("tenant-a", "telegram", "user-42"));
    assert.notEqual(telegram, inboundMarketingProfileIdentity("tenant-a", "vk", "user-42"));
    assert.notEqual(telegram, inboundMarketingProfileIdentity("tenant-b", "telegram", "user-42"));
    assert.doesNotMatch(telegram, /user-42/);
  });

  it("routes first inbound consent to the provider conversation address", () => {
    assert.equal(inboundMarketingDeliveryAddress("+79990000000", "telegram-chat-42"), "telegram-chat-42");
    assert.equal(inboundMarketingDeliveryAddress("+79990000000"), "+79990000000");
  });
});

describe("marketing channel restrictions", () => {
  it("normalizes channels and blocks only the matching client-channel pair", () => {
    const restrictions = new Set([marketingChannelRestrictionKey("client-1", "Telegram")]);
    assert.equal(normalizeMarketingChannel(" MAX "), "max");
    assert.equal(marketingChannelIsRestricted(restrictions, "client-1", "telegram"), true);
    assert.equal(marketingChannelIsRestricted(restrictions, "client-1", "vk"), false);
    assert.equal(marketingChannelIsRestricted(restrictions, "client-2", "telegram"), false);
  });

  it("keeps a manual restriction independent from consent bypass", () => {
    const restrictions = new Set([marketingChannelRestrictionKey("client-1", "max")]);
    assert.equal(marketingConsentAllowsDelivery("granted", true), true);
    assert.equal(marketingChannelIsRestricted(restrictions, "client-1", "max"), true);
  });
});

describe("marketing tenant owner resolution", () => {
  it("recognizes an explicit owner role or the tenant owner email without granting access to other admins", () => {
    assert.equal(isMarketingTenantOwner({ email: "operator@example.com", role: "Owner" }, {}), true);
    assert.equal(isMarketingTenantOwner({ email: "Owner@Example.com", role: "Admin" }, { ownerEmail: "owner@example.com" }), true);
    assert.equal(isMarketingTenantOwner({ email: "admin@example.com", role: "Admin" }, { ownerEmail: "owner@example.com" }), false);
  });
});

describe("marketing conversation profile resolution", () => {
  it("uses the same stable source profile identity as the clients workspace", () => {
    assert.equal(marketingConversationSourceProfileId("Telegram", "+7 (999) 123-45-67"), "src_telegram_79991234567");
    assert.equal(marketingConversationSourceProfileId("", "+7 (999) 123-45-67"), "");
  });
});

describe("marketing import identifiers", () => {
  it("normalizes Russian phone formats before exact matching", () => {
    assert.equal(normalizePhone("+7 (999) 123-45-67"), "79991234567");
    assert.equal(normalizePhone("8 999 123 45 67"), "79991234567");
  });

  it("accepts common Russian spreadsheet headers and numeric phone cells", () => {
    assert.deepEqual(normalizeMarketingImportRecord({ "\uFEFFНомер телефона": 79991234567, "Электронная почта": " User@Example.ru " }), {
      phone: "79991234567",
      email: "User@Example.ru"
    });
    assert.deepEqual(normalizeMarketingImportRecord({ client_id: "client-42", external_id: 9001 }), {
      clientId: "client-42",
      externalId: "9001"
    });
  });
});

describe("marketing test recipient search", () => {
  it("matches a saved provider destination by phone and normalized channel", () => {
    assert.equal(marketingDestinationKey("+79991234567", "Telegram"), marketingDestinationKey("+79991234567", "telegram"));
    assert.equal(marketingDestinationKey("8 (999) 123-45-67", "Telegram"), marketingDestinationKey("+7 999 123-45-67", "telegram"));
    assert.notEqual(marketingDestinationKey("+79991234567", "telegram"), marketingDestinationKey("+79991234567", "vk"));
  });

  it("requires an address and provider connection where the official connector needs one", () => {
    const telegram = { channelConnectionId: null, providerConversationId: "chat-42" };
    const max = { channelConnectionId: "connection-max", providerConversationId: "chat-7" };
    assert.equal(marketingDestinationIsUsable("telegram", telegram), true);
    assert.equal(marketingDestinationIsUsable("max", telegram), false);
    assert.equal(marketingDestinationIsUsable("vk", undefined), false);
    assert.equal(marketingDestinationIsUsable("max", max), true);
    assert.deepEqual(marketingDestinationPayload(max), { channelConnectionId: "connection-max", providerConversationId: "chat-7" });
  });

  it("normalizes surname, phone, and email search terms", () => {
    assert.deepEqual(marketingTestRecipientSearchTerms("  Самойлов  "), { phone: "", query: "Самойлов" });
    assert.deepEqual(marketingTestRecipientSearchTerms("8 (999) 123-45-67"), { phone: "79991234567", query: "8 (999) 123-45-67" });
    assert.deepEqual(marketingTestRecipientSearchTerms("alex@example.ru"), { phone: "", query: "alex@example.ru" });
  });

  it("returns masked contact hints without exposing searchable values", () => {
    assert.equal(maskMarketingTestRecipientPhone("+7 999 123-45-67"), "••• 4567");
    assert.equal(maskMarketingTestRecipientEmail("alex@example.ru"), "a***@example.ru");
    assert.doesNotMatch(maskMarketingTestRecipientEmail("alex@example.ru"), /alex@/);
  });
});

describe("marketing channel content", () => {
  const content = { blocks: [{ type: "text", text: "Основной <текст>" }, { type: "heading", text: "Важное & новое" }] };

  it("moves headings before the message and marks them as HTML for Telegram and MAX", () => {
    assert.deepEqual(marketingContentForChannel(content, "telegram"), {
      message: "<b>Важное &amp; новое</b>\n\nОсновной &lt;текст&gt;",
      messageFormat: "html"
    });
    assert.equal(marketingContentForChannel(content, "MAX").messageFormat, "html");
  });

  it("uses a visible plain-text heading fallback for VK", () => {
    assert.deepEqual(marketingContentForChannel(content, "vk"), {
      message: "【Важное & новое】\n\nОсновной <текст>"
    });
  });
});
