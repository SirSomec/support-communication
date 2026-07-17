import { BotRuntimeService, type BotRuntimeInboundEvent } from "./bot-runtime.service.js";
import type { AutomationRepository } from "./automation.repository.js";

export interface BotRuntimeRetryWorkerInput {
  automationRepository: AutomationRepository;
  leaseMs?: number;
  limit?: number;
  maxAttempts?: number;
  now?: string;
  runtime?: Pick<BotRuntimeService, "handleInboundEvent">;
}

export interface BotRuntimeRetryWorkerResult {
  claimed: number;
  deadLettered: number;
  failed: number;
  retried: number;
  scanned: number;
  skipped: number;
}

export async function runBotRuntimeRetryOnce(input: BotRuntimeRetryWorkerInput): Promise<BotRuntimeRetryWorkerResult> {
  const now = normalizeRetryNow(input.now);
  const due = await input.automationRepository.listDueBotRuntimeRetriesAsync(now, input.limit ?? 50);
  const result: BotRuntimeRetryWorkerResult = {
    claimed: 0,
    deadLettered: 0,
    failed: 0,
    retried: 0,
    scanned: due.length,
    skipped: 0
  };
  const runtime = input.runtime ?? new BotRuntimeService(input.automationRepository, {
    maxAttempts: input.maxAttempts,
    now: () => new Date(now)
  });

  for (const candidate of due) {
    const leaseUntil = new Date(Date.parse(now) + (input.leaseMs ?? 30_000)).toISOString();
    const claimed = await input.automationRepository.claimBotRuntimeRetryAsync(candidate.id, candidate.attempts, now, leaseUntil);
    if (!claimed) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    try {
      const step = await input.automationRepository.findLatestBotRuntimeStepAsync(claimed.id);
      if (!step) throw new Error("bot_runtime_retry_step_not_found");
      const event = retryEventFromStep(claimed.tenantId, claimed.conversationId, claimed.attempts, step.inputEventId, step.inputEvent);
      const retried = await runtime.handleInboundEvent(event);
      if (retried.instance.status === "dead_lettered") {
        result.deadLettered += 1;
        result.failed += 1;
      } else if (retried.instance.status === "retry_scheduled") {
        result.failed += 1;
      } else {
        result.retried += 1;
      }
    } catch {
      // The lease in nextAttemptAt makes a crashed or malformed retry visible
      // again after a bounded delay without allowing a concurrent duplicate.
      result.failed += 1;
    }
  }

  return result;
}

function retryEventFromStep(
  tenantId: string,
  conversationId: string,
  attempts: number,
  inputEventId: string,
  inputEvent: Record<string, unknown>
): BotRuntimeInboundEvent {
  const channel = String(inputEvent.channel ?? "").trim();
  const traceId = String(inputEvent.traceId ?? "").trim();
  if (!channel || !traceId) throw new Error("bot_runtime_retry_event_context_invalid");
  const payload = inputEvent.payload && typeof inputEvent.payload === "object" && !Array.isArray(inputEvent.payload)
    ? inputEvent.payload as Record<string, unknown>
    : {};
  const scenarioId = String(inputEvent.scenarioId ?? "").trim();
  return {
    channel,
    conversationId,
    eventId: `${inputEventId}:retry:${attempts}`,
    payload,
    ...(scenarioId ? { scenarioId } : {}),
    tenantId,
    traceId
  };
}

function normalizeRetryNow(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("bot_runtime_retry_now_invalid");
  return date.toISOString();
}
