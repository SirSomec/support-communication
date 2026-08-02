import type { BotFlowNode } from "./automation.types.js";
/**
 * BAI-840: рамки консультации сценария. Хранятся в config AI-узла, поэтому
 * версионируются вместе со сценарием (снимок версии копирует flowNodes). Не
 * могут переопределить безопасностные rails system-prompt (они добавляются
 * после behaviorRules в buildAiBotSystemPrompt).
 */
export interface AgentPolicy {
    /** Темы, на которые бот не отвечает вовсе; клиент получает refusalMessage. */
    blockedTopics: string[];
    /** BAI-879: потолок токенов ответа модели (раньше — хардкод 500, из-за которого ответы обрывались). */
    maxResponseTokens: number;
    /** Темы, по которым бот сразу зовёт человека, не пытаясь ответить. */
    operatorOnlyTopics: string[];
    /** Фактический ответ обязан опираться на источник (citations). По умолчанию включено. */
    requireSource: boolean;
    /** BAI-877: как бот ищет по знаниям — "lexical" (по словам), "semantic" (по смыслу через эмбеддинги) или "llm" (дорогой моделью); оба умных режима падают в лексику при сбое. */
    retrievalMode: "lexical" | "llm" | "semantic";
    /** Минимальный лексический score фрагмента, ниже которого он не считается достаточным доказательством. */
    retrievalScoreThreshold: number;
    /** Вежливый отказ, показываемый на запрещённую тему. */
    refusalMessage: string;
    /** Дополнительные «правила поведения» (в system-prompt после rails, bounded). */
    behaviorRules: string;
}
export type AgentPolicyDecision = {
    action: "allow";
} | {
    action: "refuse";
    reason: string;
    message: string;
} | {
    action: "handoff";
    reason: string;
};
export declare function normalizeAgentPolicy(config: BotFlowNode["config"] | undefined): AgentPolicy;
/**
 * Проверка входящего вопроса до вызова модели: запрещённые темы → вежливый
 * отказ, «только оператор» → handoff. Совпадение по целым словам (tokens),
 * чтобы «оплата» не срабатывала внутри «оплаченный» без явного слова.
 */
export declare function evaluatePrePolicy(message: string, policy: AgentPolicy, locale?: string): AgentPolicyDecision;
/**
 * Проверка ответа модели. requireSource передаёт оператору, только когда знания
 * БЫЛИ найдены, но модель их не процитировала (фактический ответ мимо
 * доказательств). Пустой retrieval (приветствие/smalltalk) не эскалируем — там
 * модель по своим rails здоровается или честно предлагает оператора сама.
 */
export declare function evaluatePostPolicy(citationCount: number, materialsAvailable: number, policy: AgentPolicy): AgentPolicyDecision;
