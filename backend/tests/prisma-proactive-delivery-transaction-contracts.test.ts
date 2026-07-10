import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOutboxEvent } from "@support-communication/events";
import {
  AutomationRepository,
  type AutomationProactiveDeliveryCommitInput,
  type PrismaAutomationClient
} from "../apps/api-gateway/src/automation/automation.repository.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";

describe("Prisma proactive delivery transaction contracts", () => {
  it("replays a concurrent experiment assignment unique race", async () => {
    let persisted: Record<string, unknown> | null = null;
    let waitingFinds = 0;
    let releaseFinds!: () => void;
    const bothFindsStarted = new Promise<void>((resolve) => {
      releaseFinds = resolve;
    });
    const client = {
      proactiveExperimentAssignment: {
        async create({ data }: { data: Record<string, unknown> }) {
          if (persisted) {
            throw uniqueError();
          }
          persisted = structuredClone(data);
          return structuredClone(data);
        },
        async findMany() {
          return persisted ? [structuredClone(persisted)] : [];
        },
        async findUnique() {
          waitingFinds += 1;
          if (waitingFinds > 2) {
            return persisted ? structuredClone(persisted) : null;
          }
          if (waitingFinds === 2) {
            releaseFinds();
          }
          await bothFindsStarted;
          return null;
        }
      }
    } as unknown as PrismaAutomationClient;
    const repository = AutomationRepository.prisma({ client });
    const assignment = {
      assignedAt: "2026-07-10T08:00:00.000Z",
      assignmentId: "assignment-atomic",
      experimentId: "exp-rule-atomic",
      ruleId: "rule-atomic",
      subjectId: "visitor-atomic",
      tenantId: "tenant-atomic",
      variant: "A"
    };

    const [left, right] = await Promise.all([
      repository.saveProactiveExperimentAssignmentAsync(assignment),
      repository.saveProactiveExperimentAssignmentAsync(assignment)
    ]);

    assert.equal(left.assignmentId, assignment.assignmentId);
    assert.equal(right.assignmentId, assignment.assignmentId);
    assert.equal(left.variant, "A");
    assert.equal(right.variant, "A");
  });

  it("commits one delivery when two workers race the same idempotency reservation", async () => {
    const fake = createAtomicPrismaClient();
    const repository = AutomationRepository.prisma({ client: fake.client });
    const conversationRepository = ConversationRepository.inMemory();
    const input = createCommitInput(conversationRepository);

    const [left, right] = await Promise.all([
      repository.commitProactiveDeliveryAsync(input),
      repository.commitProactiveDeliveryAsync(input)
    ]);

    assert.deepEqual([left.outcome, right.outcome].sort(), ["duplicate", "queued"]);
    assert.deepEqual(fake.counts(), {
      attributions: 1,
      attempts: 1,
      descriptors: 1,
      idempotencyKeys: 1,
      outboxEvents: 1
    });
    assert.equal(fake.capUsed(), 1);
    assert.equal((await conversationRepository.listOutboundDescriptors()).length, 0);
  });

  it("allows only one visitor to consume the final frequency-cap slot", async () => {
    const fake = createAtomicPrismaClient();
    const repository = AutomationRepository.prisma({ client: fake.client });
    const conversationRepository = ConversationRepository.inMemory();

    const [left, right] = await Promise.all([
      repository.commitProactiveDeliveryAsync(createCommitInput(conversationRepository, "visitor-left")),
      repository.commitProactiveDeliveryAsync(createCommitInput(conversationRepository, "visitor-right"))
    ]);

    assert.deepEqual([left.outcome, right.outcome].sort(), ["cap_exhausted", "queued"]);
    assert.equal(fake.capUsed(), 1);
    assert.deepEqual(fake.counts(), {
      attributions: 1,
      attempts: 1,
      descriptors: 1,
      idempotencyKeys: 1,
      outboxEvents: 1
    });
  });

  it("rolls back a partial transaction and succeeds on the next recovery run", async () => {
    const fake = createAtomicPrismaClient({ failOutboxOnce: true });
    const repository = AutomationRepository.prisma({ client: fake.client });
    const input = createCommitInput(ConversationRepository.inMemory());

    await assert.rejects(
      () => repository.commitProactiveDeliveryAsync(input),
      /proactive_transaction_injected_failure/
    );
    assert.deepEqual(fake.counts(), {
      attributions: 0,
      attempts: 0,
      descriptors: 0,
      idempotencyKeys: 0,
      outboxEvents: 0
    });
    assert.equal(fake.capUsed(), 0);

    const recovered = await repository.commitProactiveDeliveryAsync(input);

    assert.equal(recovered.outcome, "queued");
    assert.equal(fake.capUsed(), 1);
    assert.equal(fake.counts().descriptors, 1);
  });
});

function createCommitInput(
  conversationRepository: ConversationRepository,
  subjectId = "visitor-atomic"
): AutomationProactiveDeliveryCommitInput {
  const evaluatedAt = "2026-07-10T08:00:00.000Z";
  const descriptorId = `proactive_rule_atomic_tenant_atomic_${subjectId}`;
  const idempotencyKey = `proactive-delivery:tenant-atomic:rule-atomic:${subjectId}`;
  const outbox = createOutboxEvent({
    aggregateId: descriptorId,
    aggregateType: "conversation_outbound",
    payload: {
      descriptorId,
      idempotencyKey,
      proactiveRuleId: "rule-atomic",
      subjectId
    },
    queue: "message-delivery",
    traceId: "trc_proactive_atomic",
    type: "conversation.outbound.requested"
  });

  return {
    attemptedAt: evaluatedAt,
    attribution: {
      assignedAt: evaluatedAt,
      attributionId: `attribution_${descriptorId}`,
      descriptorId,
      experimentId: "exp-rule-atomic",
      ruleId: "rule-atomic",
      subjectId,
      tenantId: "tenant-atomic",
      variant: "A"
    },
    attempt: {
      attemptedAt: evaluatedAt,
      attemptId: `attempt_${descriptorId}`,
      channel: "SDK",
      descriptorId,
      ruleId: "rule-atomic",
      status: "queued",
      subjectId,
      tenantId: "tenant-atomic",
      traceId: "trc_proactive_atomic"
    },
    conversationRepository,
    descriptor: {
      auditId: null,
      channel: "SDK",
      conversationId: null,
      createdAt: evaluatedAt,
      deliveryState: "queued",
      id: descriptorId,
      idempotencyKey,
      kind: "outbound_conversation",
      messageId: null,
      outboxEventId: outbox.id,
      payload: {
        channel: "SDK",
        evaluatedAt,
        message: "Atomic proactive delivery",
        proactiveRuleId: "rule-atomic",
        queue: "message-delivery",
        segment: "checkout",
        subjectId,
        topic: "Checkout",
        variant: "A"
      },
      requestFingerprint: "fingerprint-atomic",
      retryable: true,
      status: "queued",
      tenantId: "tenant-atomic",
      traceId: "trc_proactive_atomic"
    },
    evaluatedAt,
    idempotencyRecord: {
      fingerprint: "fingerprint-atomic",
      key: idempotencyKey,
      result: {
        descriptorId,
        outboxEventId: outbox.id
      },
      ruleId: "rule-atomic",
      subjectId,
      tenantId: "tenant-atomic"
    },
    outbox,
    ruleId: "rule-atomic",
    tenantId: "tenant-atomic"
  };
}

function createAtomicPrismaClient(options: { failOutboxOnce?: boolean } = {}) {
  type Row = Record<string, unknown>;
  type State = {
    attributions: Map<string, Row>;
    attempts: Map<string, Row>;
    caps: Map<string, Row>;
    descriptors: Map<string, Row>;
    idempotencyKeys: Map<string, Row>;
    outboxEvents: Map<string, Row>;
  };

  let state: State = {
    attributions: new Map(),
    attempts: new Map(),
    caps: new Map([["cap-atomic", {
      active: true,
      capId: "cap-atomic",
      createdAt: new Date("2026-07-10T07:00:00.000Z"),
      limit: 1,
      period: "day",
      resetAt: new Date("2026-07-11T00:00:00.000Z"),
      ruleId: "rule-atomic",
      tenantId: "tenant-atomic",
      updatedAt: new Date("2026-07-10T07:00:00.000Z"),
      used: 0
    }]]),
    descriptors: new Map(),
    idempotencyKeys: new Map(),
    outboxEvents: new Map()
  };
  let failOutboxOnce = options.failOutboxOnce === true;
  let transactionTail = Promise.resolve();

  const client = {
    async $transaction<T>(operation: (transaction: unknown) => Promise<T>): Promise<T> {
      const run = transactionTail.then(async () => {
        const snapshot = cloneState(state);
        try {
          return await operation(client);
        } catch (error) {
          state = snapshot;
          throw error;
        }
      });
      transactionTail = run.then(() => undefined, () => undefined);
      return run;
    },
    proactiveDeliveryAttribution: createUniqueDelegate(() => state.attributions, "attributionId"),
    proactiveDeliveryAttempt: createUniqueDelegate(() => state.attempts, "attemptId"),
    proactiveDeliveryIdempotencyKey: createUniqueDelegate(() => state.idempotencyKeys, "key"),
    proactiveFrequencyCap: {
      async findMany({ where }: { where: Row }) {
        return [...state.caps.values()].filter((row) => matches(row, where)).map(cloneRow);
      },
      async updateMany({ data, where }: { data: Row; where: Row }) {
        const rows = [...state.caps.entries()].filter(([, row]) => matches(row, where));
        for (const [key, row] of rows) {
          state.caps.set(key, cloneRow({ ...row, ...data }));
        }
        return { count: rows.length };
      },
      async upsert() {
        throw new Error("not_used");
      }
    },
    conversationOutboundDescriptor: {
      async create({ data }: { data: Row }) {
        if (state.descriptors.has(String(data.id))) {
          throw uniqueError();
        }
        state.descriptors.set(String(data.id), cloneRow(data));
        return cloneRow(data);
      },
      async findUnique({ where }: { where: Row }) {
        return cloneOptional([...state.descriptors.values()].find((row) => matches(row, where)));
      }
    },
    outboxEvent: {
      async create({ data }: { data: Row }) {
        if (failOutboxOnce) {
          failOutboxOnce = false;
          throw new Error("proactive_transaction_injected_failure");
        }
        if (state.outboxEvents.has(String(data.id))) {
          throw uniqueError();
        }
        state.outboxEvents.set(String(data.id), cloneRow(data));
        return cloneRow(data);
      }
    }
  };

  return {
    capUsed: () => Number(state.caps.get("cap-atomic")?.used ?? 0),
    client: client as unknown as PrismaAutomationClient,
    counts: () => ({
      attributions: state.attributions.size,
      attempts: state.attempts.size,
      descriptors: state.descriptors.size,
      idempotencyKeys: state.idempotencyKeys.size,
      outboxEvents: state.outboxEvents.size
    })
  };

  function createUniqueDelegate(getMap: () => Map<string, Row>, keyField: string) {
    return {
      async create({ data }: { data: Row }) {
        const key = String(data[keyField]);
        if (getMap().has(key)) {
          throw uniqueError();
        }
        getMap().set(key, cloneRow(data));
        return cloneRow(data);
      },
      async findMany() {
        return [...getMap().values()].map(cloneRow);
      },
      async findUnique({ where }: { where: Row }) {
        return cloneOptional([...getMap().values()].find((row) => matches(row, where)));
      }
    };
  }

  function cloneState(source: State): State {
    return {
      attributions: cloneMap(source.attributions),
      attempts: cloneMap(source.attempts),
      caps: cloneMap(source.caps),
      descriptors: cloneMap(source.descriptors),
      idempotencyKeys: cloneMap(source.idempotencyKeys),
      outboxEvents: cloneMap(source.outboxEvents)
    };
  }

  function cloneMap(source: Map<string, Row>): Map<string, Row> {
    return new Map([...source.entries()].map(([key, value]) => [key, cloneRow(value)]));
  }
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) {
      return true;
    }
    const rowValue = row[key];
    return rowValue instanceof Date && value instanceof Date
      ? rowValue.getTime() === value.getTime()
      : rowValue === value;
  });
}

function cloneOptional<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}

function cloneRow<T>(value: T): T {
  return structuredClone(value);
}

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}
