export * from "./seed-catalog.js";

import {
  aiCoachingQueue,
  aiEffectivenessMetrics,
  aiRealtimeChecks,
  aiSuggestions,
  knowledgeArticles,
  qualityMetrics
} from "./seed-catalog.js";
import type { QualityState } from "./quality.repository.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bootstrapQualityState(base?: Partial<QualityState>): QualityState {
  return {
    aiSuggestionDecisions: [],
    aiScoringAudits: base?.aiScoringAudits ?? [],
    manualQaReviews: base?.manualQaReviews ?? [],
    ratings: base?.ratings ?? [],
    workspace: {
      aiCoachingQueue: clone(aiCoachingQueue),
      aiEffectivenessMetrics: clone(aiEffectivenessMetrics),
      aiRealtimeChecks: clone(aiRealtimeChecks),
      aiSuggestions: clone(aiSuggestions),
      knowledgeArticles: clone(knowledgeArticles),
      qualityMetrics: clone(qualityMetrics) as unknown as QualityState["workspace"]["qualityMetrics"]
    }
  };
}
