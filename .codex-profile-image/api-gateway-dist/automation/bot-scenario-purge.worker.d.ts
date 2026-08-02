import type { AutomationRepository } from "./automation.repository.js";
export interface BotScenarioPurgeWorkerInput {
    automationRepository: Pick<AutomationRepository, "listExpiredArchivedBotScenariosAsync" | "purgeArchivedBotScenarioAsync" | "saveScenarioAuditEvent">;
    limit?: number;
    now?: string;
}
export interface BotScenarioPurgeWorkerResult {
    auditHeld: number;
    legalHeld: number;
    notEligible: number;
    purged: number;
    scanned: number;
}
/**
 * Performs final deletion only after archive retention has elapsed. Every
 * deletion call carries both tenantId and scenarioId; repository implementations
 * additionally re-check archive status, retention and both holds atomically.
 */
export declare function runBotScenarioPurgeOnce(input: BotScenarioPurgeWorkerInput): Promise<BotScenarioPurgeWorkerResult>;
