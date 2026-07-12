import type { AutomationRepository, BotScenarioPurgeOutcome } from "./automation.repository.js";

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
export async function runBotScenarioPurgeOnce(input: BotScenarioPurgeWorkerInput): Promise<BotScenarioPurgeWorkerResult> {
  const now = normalizeNow(input.now);
  const candidates = await input.automationRepository.listExpiredArchivedBotScenariosAsync(now, input.limit ?? 50);
  const result: BotScenarioPurgeWorkerResult = { auditHeld: 0, legalHeld: 0, notEligible: 0, purged: 0, scanned: candidates.length };
  for (const candidate of candidates) {
    const outcome = (await input.automationRepository.purgeArchivedBotScenarioAsync(candidate.tenantId, candidate.id, now)).outcome;
    if (outcome === "purged") await input.automationRepository.saveScenarioAuditEvent({ action: "bot.purge", actor: "bot-scenario-purge-worker", actorType: "system", auditId: `bot_purge_${candidate.tenantId}_${candidate.id}_${now}`,
      createdAt: now, immutable: true, payload: { retentionUntil: candidate.retentionUntil }, reason: "retention_expired", scenarioId: candidate.id, tenantId: candidate.tenantId, traceId: `bot-scenario-purge:${candidate.id}:${now}` });
    increment(result, outcome);
  }
  return result;
}

function increment(result: BotScenarioPurgeWorkerResult, outcome: BotScenarioPurgeOutcome): void {
  if (outcome === "purged") result.purged += 1;
  else if (outcome === "legal_hold") result.legalHeld += 1;
  else if (outcome === "audit_hold") result.auditHeld += 1;
  else result.notEligible += 1;
}

function normalizeNow(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("bot_scenario_purge_now_invalid");
  return date.toISOString();
}
