import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { AutomationRepository } from "../automation/automation.repository.js";
import { KnowledgeRetrievalService } from "./knowledge-retrieval.service.js";

export class KnowledgeRetrievalApiService {
  constructor(private readonly retrieval = new KnowledgeRetrievalService(), private readonly automation = AutomationRepository.default()) {}
  async retrieveScenario(input: { query?: string; scenarioId?: string; tenantId: string; tokenBudget?: number }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const scenario = input.scenarioId ? await this.automation.findBotScenario(input.scenarioId) : undefined;
    if (!scenario || scenario.tenantId !== input.tenantId || scenario.status === "archived") return result("invalid", input.tenantId, { passages: [], tokenBudget: 0, tokensUsed: 0 }, "knowledge_retrieval_scenario_not_found");
    const query = String(input.query ?? "").trim();
    if (!query) return result("invalid", input.tenantId, { passages: [], tokenBudget: 0, tokensUsed: 0 }, "knowledge_retrieval_query_required");
    return result("ok", input.tenantId, await this.retrieval.retrieve({ query, sourceBindings: scenario.sourceBindings ?? [], tenantId: input.tenantId, tokenBudget: input.tokenBudget }));
  }
}
function result(status: "invalid" | "ok", tenantId: string, data: Record<string, unknown>, code?: string): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ service: "knowledgeRetrievalService", operation: "retrieveScenarioKnowledge", traceId: `trc_knowledge_retrieval_${Date.now()}`, status, meta: { apiVersion: "v1", generatedAt: new Date().toISOString(), tenantId }, data, error: code ? { code, message: code } : null }); }
