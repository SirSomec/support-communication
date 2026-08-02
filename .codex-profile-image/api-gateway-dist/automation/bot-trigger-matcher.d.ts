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
export declare function normalizeBotTriggerText(value: string, locale?: string): string;
/**
 * Splits a normalized string into whole letters/numbers. It deliberately does
 * not stem words: a trigger for "оплата" must not accidentally match
 * "оплатить". The caller can use `contains` when that broader behavior is
 * wanted.
 */
export declare function tokenizeBotTriggerText(value: string, locale?: string): string[];
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
export declare function matchesBotTriggerPhrase(message: string, phrase: string, mode: BotTriggerMatchMode, locale?: string): boolean;
/**
 * Catch-all trigger: matches every inbound message unless an exclusion phrase hits.
 * An empty exclusion list means the scenario always matches.
 */
export declare function matchesBotAlwaysExceptTrigger(message: string | null | undefined, exclusions: string[] | undefined, mode?: BotTriggerMatchMode, locale?: string): boolean;
