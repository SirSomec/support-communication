/**
 * Match modes intentionally operate on a normalized, human-readable message.
 * They never mutate the stored trigger phrase or the original inbound payload.
 */
export type BotTriggerMatchMode = "exact" | "contains" | "tokens";

/**
 * Makes text comparable across common user input differences.
 *
 * NFC preserves normal displayed characters while making composed and
 * decomposed Unicode forms equal. Whitespace is collapsed so line breaks and
 * repeated spaces do not make an otherwise identical phrase miss.
 */
export function normalizeBotTriggerText(value: string, locale = "ru-RU"): string {
  return value.normalize("NFC").toLocaleLowerCase(locale).replace(/\s+/gu, " ").trim();
}

/**
 * Splits a normalized string into whole letters/numbers. It deliberately does
 * not stem words: a trigger for "оплата" must not accidentally match
 * "оплатить". The caller can use `contains` when that broader behavior is
 * wanted.
 */
export function tokenizeBotTriggerText(value: string, locale = "ru-RU"): string[] {
  const normalized = normalizeBotTriggerText(value, locale);
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Determines whether one configured phrase matches an inbound message.
 *
 * - exact: the full normalized message equals the phrase;
 * - contains: the normalized phrase is a contiguous substring of the message;
 * - tokens: every whole token of the phrase occurs in the message, regardless
 *   of token order. This is useful for a customer who writes a phrase with
 *   extra words between its key terms.
 *
 * Empty or punctuation-only phrases never match; accepting one would make a
 * scenario trigger on every inbound message.
 */
export function matchesBotTriggerPhrase(
  message: string,
  phrase: string,
  mode: BotTriggerMatchMode,
  locale = "ru-RU"
): boolean {
  const normalizedMessage = normalizeBotTriggerText(message, locale);
  const normalizedPhrase = normalizeBotTriggerText(phrase, locale);

  if (!normalizedMessage || !normalizedPhrase) {
    return false;
  }

  if (tokenizeBotTriggerText(normalizedPhrase, locale).length === 0) {
    return false;
  }

  if (mode === "exact") {
    return normalizedMessage === normalizedPhrase;
  }

  if (mode === "contains") {
    return normalizedMessage.includes(normalizedPhrase);
  }

  const phraseTokens = tokenizeBotTriggerText(normalizedPhrase, locale);

  const messageTokens = new Set(tokenizeBotTriggerText(normalizedMessage, locale));
  return phraseTokens.every((token) => messageTokens.has(token));
}
