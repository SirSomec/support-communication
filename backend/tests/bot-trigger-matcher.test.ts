import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesBotAlwaysExceptTrigger,
  matchesBotTriggerPhrase,
  normalizeBotTriggerText,
  tokenizeBotTriggerText
} from "../apps/api-gateway/src/automation/bot-trigger-matcher.ts";

describe("bot trigger matcher", () => {
  it("normalizes NFC, locale-aware case and repeated whitespace", () => {
    assert.equal(normalizeBotTriggerText("  Е\u0308ЛКА\n  И\tТЕСТ  "), "ёлка и тест");
    assert.equal(normalizeBotTriggerText("I", "tr"), "ı");
  });

  it("matches exact phrases only after user-input normalization", () => {
    assert.equal(matchesBotTriggerPhrase("  Нужна\nПОМОЩЬ ", "нужна помощь", "exact"), true);
    assert.equal(matchesBotTriggerPhrase("нужна помощь сейчас", "нужна помощь", "exact"), false);
  });

  it("matches a contiguous phrase in contains mode", () => {
    assert.equal(matchesBotTriggerPhrase("Здравствуйте, нужна помощь с оплатой", "помощь с оплатой", "contains"), true);
    assert.equal(matchesBotTriggerPhrase("Поможем с оплатой", "помощь", "contains"), false);
  });

  it("matches complete phrase tokens in any order without partial-word false positives", () => {
    assert.deepEqual(tokenizeBotTriggerText("Счёт-заказ № 42"), ["счёт", "заказ", "42"]);
    assert.equal(matchesBotTriggerPhrase("Где мой заказ, нужен счёт", "счёт заказ", "tokens"), true);
    assert.equal(matchesBotTriggerPhrase("Хочу оплатить заказ", "оплата заказ", "tokens"), false);
  });

  it("never lets empty or punctuation-only phrases trigger a scenario", () => {
    assert.equal(matchesBotTriggerPhrase("Любое сообщение", "   ", "contains"), false);
    assert.equal(matchesBotTriggerPhrase("Любое сообщение", "---", "tokens"), false);
  });

  it("matches always_except unless an exclusion phrase hits", () => {
    assert.equal(matchesBotAlwaysExceptTrigger("Где мой заказ?", [], "contains"), true);
    assert.equal(matchesBotAlwaysExceptTrigger("Где мой заказ?", ["оператор"], "contains"), true);
    assert.equal(matchesBotAlwaysExceptTrigger("Нужен оператор", ["оператор"], "contains"), false);
    assert.equal(matchesBotAlwaysExceptTrigger("", ["оператор"], "contains"), true);
  });
});
