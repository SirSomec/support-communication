import { matchesBotTriggerPhrase } from "./bot-trigger-matcher.js";
const DEFAULT_REFUSAL = "Извините, по этому вопросу я не могу помочь. Если нужно, могу передать диалог оператору.";
const MAX_TOPICS = 40;
const MAX_TOPIC_CHARS = 120;
const MAX_BEHAVIOR_CHARS = 1_000;
const DEFAULT_MAX_RESPONSE_TOKENS = 1_000;
export function normalizeAgentPolicy(config) {
    const source = (config?.policy && typeof config.policy === "object" ? config.policy : config);
    const threshold = Number(source?.retrievalScoreThreshold);
    const maxResponseTokens = Number(source?.maxResponseTokens);
    return {
        behaviorRules: String(source?.behaviorRules ?? "").trim().slice(0, MAX_BEHAVIOR_CHARS),
        maxResponseTokens: Number.isInteger(maxResponseTokens) ? Math.max(100, Math.min(4_000, maxResponseTokens)) : DEFAULT_MAX_RESPONSE_TOKENS,
        blockedTopics: normalizeTopics(source?.blockedTopics),
        operatorOnlyTopics: normalizeTopics(source?.operatorOnlyTopics),
        refusalMessage: String(source?.refusalMessage ?? "").trim() || DEFAULT_REFUSAL,
        requireSource: source?.requireSource === undefined ? true : source.requireSource !== false,
        retrievalMode: source?.retrievalMode === "llm" ? "llm" : source?.retrievalMode === "semantic" ? "semantic" : "lexical",
        retrievalScoreThreshold: Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0
    };
}
function normalizeTopics(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const topics = [];
    for (const item of value) {
        const topic = String(item ?? "").trim().slice(0, MAX_TOPIC_CHARS);
        if (!topic)
            continue;
        const key = topic.toLocaleLowerCase("ru-RU");
        if (seen.has(key))
            continue;
        seen.add(key);
        topics.push(topic);
        if (topics.length >= MAX_TOPICS)
            break;
    }
    return topics;
}
/**
 * Проверка входящего вопроса до вызова модели: запрещённые темы → вежливый
 * отказ, «только оператор» → handoff. Совпадение по целым словам (tokens),
 * чтобы «оплата» не срабатывала внутри «оплаченный» без явного слова.
 */
export function evaluatePrePolicy(message, policy, locale = "ru-RU") {
    if (topicMatches(message, policy.operatorOnlyTopics, locale)) {
        return { action: "handoff", reason: "policy_operator_only" };
    }
    if (topicMatches(message, policy.blockedTopics, locale)) {
        return { action: "refuse", message: policy.refusalMessage, reason: "policy_blocked_topic" };
    }
    return { action: "allow" };
}
/**
 * Проверка ответа модели. requireSource передаёт оператору, только когда знания
 * БЫЛИ найдены, но модель их не процитировала (фактический ответ мимо
 * доказательств). Пустой retrieval (приветствие/smalltalk) не эскалируем — там
 * модель по своим rails здоровается или честно предлагает оператора сама.
 */
export function evaluatePostPolicy(citationCount, materialsAvailable, policy) {
    if (policy.requireSource && materialsAvailable > 0 && citationCount === 0) {
        return { action: "handoff", reason: "policy_source_required" };
    }
    return { action: "allow" };
}
function topicMatches(message, topics, locale) {
    if (!message.trim() || !topics.length)
        return false;
    return topics.some((topic) => matchesBotTriggerPhrase(message, topic, "tokens", locale));
}
//# sourceMappingURL=agent-policy.js.map