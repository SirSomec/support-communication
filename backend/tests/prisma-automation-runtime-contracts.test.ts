import assert from "node:assert/strict";
import { it } from "node:test";
import { AutomationRepository, type AutomationBotRuntimeCommitInput, type PrismaAutomationClient } from "../apps/api-gateway/src/automation/automation.repository.ts";

it("commits Prisma runtime instance and journal atomically and replays the same event", async () => {
  const instances = new Map<string, Record<string, unknown>>();
  const steps = new Map<string, Record<string, unknown>>();
  const effects = new Map<string, Record<string, unknown>>();
  const instanceDelegate = {
    async create({ data }: { data: Record<string, unknown> }) { instances.set(`${data.tenantId}:${data.conversationId}`, { ...data }); return data; },
    async findUnique({ where }: { where: Record<string, any> }) { const key = where.tenantId_conversationId; return instances.get(`${key.tenantId}:${key.conversationId}`) ?? null; },
    async updateMany() { return { count: 1 }; }
  };
  const stepDelegate = {
    async create({ data }: { data: Record<string, unknown> }) { steps.set(`${data.tenantId}:${data.conversationId}:${data.inputEventId}`, { ...data }); return data; },
    async findUnique({ where }: { where: Record<string, any> }) { const key = where.tenantId_conversationId_inputEventId; return steps.get(`${key.tenantId}:${key.conversationId}:${key.inputEventId}`) ?? null; }
  };
  const effectDelegate = {
    async create({ data }: { data: Record<string, unknown> }) { effects.set(String(data.id), { ...data }); return data; },
    async findMany() { return [...effects.values()]; }, async findUnique({ where }: { where: { id: string } }) { return effects.get(where.id) ?? null; },
    async update({ data, where }: { data: Record<string, unknown>; where: { id: string } }) { const row = { ...effects.get(where.id), ...data }; effects.set(where.id, row); return row; },
    async updateMany() { return { count: 1 }; }
  };
  const client = {
    botRuntimeInstance: instanceDelegate,
    botRuntimeStepJournal: stepDelegate,
    botRuntimeSideEffect: effectDelegate,
    async $transaction<T>(operation: (tx: any) => Promise<T>) { return operation({ botRuntimeInstance: instanceDelegate, botRuntimeSideEffect: effectDelegate, botRuntimeStepJournal: stepDelegate }); }
  } as unknown as PrismaAutomationClient;
  const repository = AutomationRepository.prisma({ client });
  const input: AutomationBotRuntimeCommitInput = {
    instance: { attempts: 0, context: {}, conversationId: "conv-1", createdAt: "2026-07-11T10:00:00.000Z", currentNodeId: "reply", id: "runtime-1", lastError: null, nextAttemptAt: null, scenarioId: "bot-1", status: "active", tenantId: "tenant-1", updatedAt: "2026-07-11T10:00:00.000Z", versionId: "v1" },
    step: { conversationId: "conv-1", createdAt: "2026-07-11T10:00:00.000Z", error: null, handoffSummary: null, id: "step-1", inputEvent: {}, inputEventId: "evt-1", lifecycleEvent: {}, nodeId: "reply", nodeType: "message", outcome: "message_queued", runtimeId: "runtime-1", sideEffects: [{ kind: "message_delivery", descriptor: { id: "delivery-1" } }], tenantId: "tenant-1", webhookResponse: null }
  };
  const first = await repository.commitBotRuntimeTransitionAsync(input);
  const replay = await repository.commitBotRuntimeTransitionAsync(input);
  assert.equal(first.outcome, "committed");
  assert.equal(replay.outcome, "duplicate");
  assert.equal(instances.size, 1);
  assert.equal(steps.size, 1);
  assert.equal(effects.size, 1);
});
