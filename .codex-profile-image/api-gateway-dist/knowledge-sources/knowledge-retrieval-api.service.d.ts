import { type BackendEnvelope } from "@support-communication/envelope";
import { AutomationRepository } from "../automation/automation.repository.js";
import { KnowledgeRetrievalService } from "./knowledge-retrieval.service.js";
export declare class KnowledgeRetrievalApiService {
    private readonly retrieval;
    private readonly automation;
    constructor(retrieval?: KnowledgeRetrievalService, automation?: AutomationRepository);
    retrieveScenario(input: {
        mode?: string;
        query?: string;
        scenarioId?: string;
        sourceIds?: string[];
        tenantId: string;
        tokenBudget?: number;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
}
