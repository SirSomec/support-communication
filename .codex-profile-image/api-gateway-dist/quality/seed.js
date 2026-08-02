export * from "./seed-catalog.js";
import { aiCoachingQueue, aiEffectivenessMetrics, aiRealtimeChecks, aiSuggestions, knowledgeArticles, qualityMetrics, qualityRatings } from "./seed-catalog.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapQualityState(base) {
    return {
        aiSuggestionDecisions: [],
        aiScoringAudits: base?.aiScoringAudits ?? [],
        manualQaReviews: base?.manualQaReviews ?? [],
        ratings: base?.ratings ?? clone(qualityRatings),
        workspace: {
            aiCoachingQueue: clone(aiCoachingQueue),
            aiEffectivenessMetrics: clone(aiEffectivenessMetrics),
            aiRealtimeChecks: clone(aiRealtimeChecks),
            aiSuggestions: clone(aiSuggestions),
            knowledgeArticles: clone(knowledgeArticles),
            qualityMetrics: clone(qualityMetrics),
            tenantId: qualityRatings[0]?.tenantId ?? null
        }
    };
}
//# sourceMappingURL=seed.js.map