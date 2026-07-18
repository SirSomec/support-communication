import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { AutomationRepository } from "../automation/automation.repository.js";
import { KnowledgeRetrievalService, type KnowledgeRetrievalMode } from "./knowledge-retrieval.service.js";
import { LlmKnowledgeSearchService } from "./llm-knowledge-search.service.js";
import { SemanticKnowledgeSearchService } from "./semantic-knowledge-search.service.js";

export class KnowledgeRetrievalApiService {
  constructor(
    // BAI-878: селекторы внедрены по умолчанию, чтобы «Проверить поиск» гонял те же
    // llm/semantic-режимы, что и бот; активны только при явном mode в запросе.
    private readonly retrieval = new KnowledgeRetrievalService(undefined, undefined, undefined, undefined, new LlmKnowledgeSearchService(), undefined, new SemanticKnowledgeSearchService()),
    private readonly automation = AutomationRepository.default()
  ) {}
  async retrieveScenario(input: { mode?: string; query?: string; scenarioId?: string; sourceIds?: string[]; tenantId: string; tokenBudget?: number }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const query = String(input.query ?? "").trim();
    if (!query) return result("invalid", input.tenantId, { passages: [], tokenBudget: 0, tokensUsed: 0 }, "knowledge_retrieval_query_required");
    const mode: KnowledgeRetrievalMode = input.mode === "llm" ? "llm" : input.mode === "semantic" ? "semantic" : "lexical";
    // BAI-825: раздел «Знания» проверяет поиск по явным источникам без сценария;
    // eligibility (ready + approved + tenant) всё равно применяет retrieval-сервис.
    const explicitSourceIds = Array.isArray(input.sourceIds)
      ? input.sourceIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];
    if (explicitSourceIds.length) {
      return result(
        "ok",
        input.tenantId,
        (await this.retrieval.retrieve({
          mode,
          query,
          sourceBindings: explicitSourceIds.map((sourceId) => ({ sourceId })),
          tenantId: input.tenantId,
          tokenBudget: input.tokenBudget
        })) as unknown as Record<string, unknown>
      );
    }
    const scenario = input.scenarioId ? await this.automation.findBotScenario(input.scenarioId) : undefined;
    if (!scenario || scenario.tenantId !== input.tenantId || scenario.status === "archived") return result("invalid", input.tenantId, { passages: [], tokenBudget: 0, tokensUsed: 0 }, "knowledge_retrieval_scenario_not_found");
    return result(
      "ok",
      input.tenantId,
      (await this.retrieval.retrieve({
        mode,
        query,
        sourceBindings: scenario.sourceBindings ?? [],
        tenantId: input.tenantId,
        tokenBudget: input.tokenBudget
      })) as unknown as Record<string, unknown>
    );
  }
}
function result(status: "invalid" | "ok", tenantId: string, data: Record<string, unknown>, code?: string): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ service: "knowledgeRetrievalService", operation: "retrieveScenarioKnowledge", traceId: `trc_knowledge_retrieval_${Date.now()}`, status, meta: { apiVersion: "v1", generatedAt: new Date().toISOString(), tenantId }, data, error: code ? { code, message: code } : null }); }
