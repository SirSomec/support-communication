import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotScenario } from "../apps/api-gateway/src/automation/automation.types.ts";
import {
  applyBotRuntimeStateTransition,
  persistBotRuntimeHandoffDescriptors,
  persistBotRuntimeOutboundDescriptors,
  planBotRuntimeStateTransition,
  resolveBotRuntimeDeadLetterState,
  resolveBotRuntimeRetryState
} from "../apps/api-gateway/src/automation/bot-runtime.worker.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";

describe("bot runtime worker contracts", () => {
  it("plans one deterministic scenario-step state transition without side effects", () => {
    const transition = planBotRuntimeStateTransition({
      conversationId: "conv-bot-runtime-001",
      currentNodeId: "start",
      eventId: "evt_inbound_001",
      scenario: {
        channels: ["SDK"],
        flowEdges: [{ from: "start", label: "next", to: "collect-contact" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "collect-contact", title: "Collect contact", type: "contact_request" }
        ],
        id: "bot-runtime-state",
        name: "Runtime state bot",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      },
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_state"
    });

    assert.equal(transition.status, "transitioned");
    assert.equal(transition.previousNodeId, "start");
    assert.equal(transition.nextNodeId, "collect-contact");
    assert.equal(transition.nodeType, "contact_request");
    assert.equal(transition.conversationId, "conv-bot-runtime-001");
    assert.equal(transition.scenarioId, "bot-runtime-state");
    assert.equal(transition.tenantId, "tenant-demo");
    assert.equal(transition.traceId, "trc_bot_runtime_state");
    assert.equal(transition.eventId, "evt_inbound_001");
    assert.equal(transition.sideEffects.length, 1);
    assert.equal(transition.sideEffects[0]?.kind, "message_delivery");
  });

  it("rejects ambiguous scenario-step transitions before choosing an arbitrary edge", () => {
    assert.throws(
      () => planBotRuntimeStateTransition({
        conversationId: "conv-bot-runtime-ambiguous",
        currentNodeId: "start",
        eventId: "evt_inbound_ambiguous",
        scenario: {
          channels: ["SDK"],
          flowEdges: [
            { from: "start", label: "first", to: "message-a" },
            { from: "start", label: "second", to: "message-b" }
          ],
          flowNodes: [
            { id: "start", title: "Start", type: "message" },
            { id: "message-a", title: "Message A", type: "message" },
            { id: "message-b", title: "Message B", type: "message" }
          ],
          id: "bot-runtime-ambiguous",
          name: "Ambiguous runtime bot",
          schemaVersion: "bot-flow/v1",
          status: "published",
          tenantId: "tenant-demo"
        },
        tenantId: "tenant-demo",
        traceId: "trc_bot_runtime_ambiguous"
      }),
      /bot_runtime_transition_ambiguous/
    );
  });

  it("plans one outbound message descriptor from a deterministic message step", () => {
    const transition = planBotRuntimeStateTransition({
      channel: "SDK",
      conversationId: "conv-bot-runtime-outbound",
      currentNodeId: "start",
      eventId: "evt_inbound_outbound",
      scenario: {
        channels: ["SDK"],
        flowEdges: [{ from: "start", to: "reply" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "reply", title: "Thanks, I can help.", type: "message" }
        ],
        id: "bot-runtime-outbound",
        name: "Outbound runtime bot",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      },
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_outbound"
    });
    const [sideEffect] = transition.sideEffects;

    assert.equal(sideEffect.kind, "message_delivery");
    assert.equal(sideEffect.descriptor.channel, "SDK");
    assert.equal(sideEffect.descriptor.conversationId, "conv-bot-runtime-outbound");
    assert.equal(sideEffect.descriptor.deliveryState, "queued");
    assert.equal(sideEffect.descriptor.idempotencyKey, "bot-runtime:evt_inbound_outbound:reply");
    assert.equal(sideEffect.descriptor.kind, "message_delivery");
    assert.equal(sideEffect.descriptor.messageId, "bot_msg_evt_inbound_outbound_reply");
    assert.equal(sideEffect.descriptor.payload.text, "Thanks, I can help.");
    assert.equal(sideEffect.descriptor.retryable, true);
    assert.equal(sideEffect.descriptor.status, "queued");
    assert.equal(sideEffect.descriptor.tenantId, "tenant-demo");
    assert.equal(sideEffect.descriptor.traceId, "trc_bot_runtime_outbound");
  });

  it("plans one handoff descriptor from a deterministic handoff step", () => {
    const transition = planBotRuntimeStateTransition({
      conversationId: "conv-bot-runtime-handoff",
      currentNodeId: "start",
      eventId: "evt_inbound_handoff",
      scenario: {
        channels: ["SDK"],
        flowEdges: [{ from: "start", to: "handoff" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { config: { queueId: "queue-priority" }, id: "handoff", title: "Transfer to operator", type: "handoff" }
        ],
        id: "bot-runtime-handoff",
        name: "Handoff runtime bot",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      },
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_handoff"
    });
    const [sideEffect] = transition.sideEffects;

    assert.equal(sideEffect.kind, "bot_handoff");
    assert.equal(sideEffect.descriptor.eventName, "bot.handoff.created");
    assert.equal(sideEffect.descriptor.eventId, "evt_bot_handoff_evt_inbound_handoff_handoff");
    assert.equal(sideEffect.descriptor.resourceId, "conv-bot-runtime-handoff");
    assert.equal(sideEffect.descriptor.resourceType, "conversation");
    assert.equal(sideEffect.descriptor.schemaVersion, "bot-handoff/v1");
    assert.equal(sideEffect.descriptor.summary.botId, "bot-runtime-handoff");
    assert.equal(sideEffect.descriptor.summary.nodeId, "handoff");
    assert.equal(sideEffect.descriptor.summary.reason, "handoff_requested");
    assert.equal(sideEffect.descriptor.tenantId, "tenant-demo");
    assert.equal(sideEffect.descriptor.traceId, "trc_bot_runtime_handoff");
  });

  it("applies one scenario-step state transition without mutating previous runtime state", () => {
    const previousState = {
      conversationId: "conv-bot-runtime-apply",
      currentNodeId: "start",
      lastEventId: "evt_previous",
      scenarioId: "bot-runtime-apply",
      tenantId: "tenant-demo",
      updatedAt: "2026-06-30T18:00:00.000Z"
    };
    const transition = planBotRuntimeStateTransition({
      conversationId: "conv-bot-runtime-apply",
      currentNodeId: "start",
      eventId: "evt_inbound_apply",
      scenario: {
        channels: ["SDK"],
        flowEdges: [{ from: "start", to: "reply" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "reply", title: "Reply", type: "message" }
        ],
        id: "bot-runtime-apply",
        name: "Apply runtime bot",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      },
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_apply"
    });

    const nextState = applyBotRuntimeStateTransition(previousState, transition, "2026-06-30T18:01:00.000Z");

    assert.equal(previousState.currentNodeId, "start");
    assert.equal(previousState.lastEventId, "evt_previous");
    assert.equal(nextState.conversationId, "conv-bot-runtime-apply");
    assert.equal(nextState.currentNodeId, "reply");
    assert.equal(nextState.lastEventId, "evt_inbound_apply");
    assert.equal(nextState.previousNodeId, "start");
    assert.equal(nextState.scenarioId, "bot-runtime-apply");
    assert.equal(nextState.tenantId, "tenant-demo");
    assert.equal(nextState.traceId, "trc_bot_runtime_apply");
    assert.equal(nextState.updatedAt, "2026-06-30T18:01:00.000Z");
  });

  it("persists outbound descriptors planned by a bot runtime transition without duplicates", async () => {
    const repository = ConversationRepository.inMemory();
    const transition = planBotRuntimeStateTransition({
      channel: "SDK",
      conversationId: "conv-bot-runtime-persist",
      currentNodeId: "start",
      eventId: "evt_inbound_persist",
      scenario: {
        channels: ["SDK"],
        flowEdges: [{ from: "start", to: "reply" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "reply", title: "Persisted reply", type: "message" }
        ],
        id: "bot-runtime-persist",
        name: "Persist runtime bot",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      },
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_persist"
    });

    const first = await persistBotRuntimeOutboundDescriptors({ conversationRepository: repository, transition });
    const second = await persistBotRuntimeOutboundDescriptors({ conversationRepository: repository, transition });
    const descriptors = await repository.listOutboundDescriptors({
      conversationId: "conv-bot-runtime-persist",
      kind: "message_delivery",
      tenantId: "tenant-demo"
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0].descriptor.id, second[0].descriptor.id);
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].idempotencyKey, "bot-runtime:evt_inbound_persist:reply");
    assert.equal(descriptors[0].payload.text, "Persisted reply");
    assert.equal(descriptors[0].status, "queued");
    assert.equal(descriptors[0].traceId, "trc_bot_runtime_persist");
  });

  it("persists handoff descriptors planned by a bot runtime transition as replay-safe realtime events", async () => {
    const repository = ConversationRepository.inMemory();
    const transition = planBotRuntimeStateTransition({
      conversationId: "conv-bot-runtime-handoff-persist",
      currentNodeId: "start",
      eventId: "evt_inbound_handoff_persist",
      scenario: {
        channels: ["SDK"],
        flowEdges: [{ from: "start", to: "handoff" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { config: { queueId: "queue-priority" }, id: "handoff", title: "Priority operators", type: "handoff" }
        ],
        id: "bot-runtime-handoff-persist",
        name: "Persist handoff runtime bot",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      },
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_handoff_persist"
    });

    const first = await persistBotRuntimeHandoffDescriptors({
      conversationRepository: repository,
      occurredAt: "2026-06-30T18:30:00.000Z",
      transition
    });
    const second = await persistBotRuntimeHandoffDescriptors({
      conversationRepository: repository,
      occurredAt: "2026-06-30T18:31:00.000Z",
      transition
    });
    const events = await repository.listRealtimeEvents({ tenantId: "tenant-demo" });
    const outboundDescriptors = await repository.listOutboundDescriptors({
      conversationId: "conv-bot-runtime-handoff-persist",
      tenantId: "tenant-demo"
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0].realtimeEvent.eventId, second[0].realtimeEvent.eventId);
    assert.equal(events.length, 1);
    assert.equal(outboundDescriptors.length, 0);
    assert.equal(events[0].eventName, "bot.handoff.created");
    assert.equal(events[0].eventId, "evt_bot_handoff_evt_inbound_handoff_persist_handoff");
    assert.equal(events[0].occurredAt, "2026-06-30T18:30:00.000Z");
    assert.equal(events[0].resourceId, "conv-bot-runtime-handoff-persist");
    assert.equal(events[0].resourceType, "conversation");
    assert.equal(events[0].schemaVersion, "bot-handoff/v1");
    assert.equal(events[0].tenantId, "tenant-demo");
    assert.equal(events[0].traceId, "trc_bot_runtime_handoff_persist");
    assert.deepEqual(events[0].data, {
      botId: "bot-runtime-handoff-persist",
      nodeId: "handoff",
      queue: "queue-priority",
      reason: "handoff_requested"
    });
  });

  it("schedules bot runtime failures for retry with sanitized error details", () => {
    const retry = resolveBotRuntimeRetryState({
      currentAttempts: 2,
      error: new Error("provider failed with Authorization: Bearer bot-runtime-secret-token"),
      failedAt: "2026-06-30T19:00:00.000Z",
      retryBackoffMs: 120_000
    });

    assert.equal(retry.attempts, 3);
    assert.equal(retry.deadLetteredAt, null);
    assert.equal(retry.failedAt, "2026-06-30T19:00:00.000Z");
    assert.equal(retry.lastError.includes("bot-runtime-secret-token"), false);
    assert.match(retry.lastError, /\[REDACTED:api_key\]/);
    assert.equal(retry.nextAttemptAt, "2026-06-30T19:02:00.000Z");
    assert.equal(retry.status, "retry_scheduled");
  });

  it("rejects bot runtime retry scheduling when failure time or backoff is malformed", () => {
    assert.throws(
      () => resolveBotRuntimeRetryState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "not-a-date",
        retryBackoffMs: 60_000
      }),
      /bot_runtime_retry_failed_at_invalid/
    );

    assert.throws(
      () => resolveBotRuntimeRetryState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "2026-06-30T19:00:00.000Z",
        retryBackoffMs: 0
      }),
      /bot_runtime_retry_backoff_invalid/
    );

    assert.throws(
      () => resolveBotRuntimeRetryState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "2026-02-30T19:00:00.000Z",
        retryBackoffMs: 60_000
      }),
      /bot_runtime_retry_failed_at_invalid/
    );

    assert.throws(
      () => resolveBotRuntimeRetryState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "June 30, 2026 19:00:00 UTC",
        retryBackoffMs: 60_000
      }),
      /bot_runtime_retry_failed_at_invalid/
    );

    assert.throws(
      () => resolveBotRuntimeRetryState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "9999-12-31T23:59:59.999Z",
        retryBackoffMs: Number.MAX_SAFE_INTEGER
      }),
      /bot_runtime_retry_backoff_invalid/
    );
  });

  it("dead-letters bot runtime failures with sanitized error details and no retry schedule", () => {
    const deadLetter = resolveBotRuntimeDeadLetterState({
      currentAttempts: 3,
      error: "handoff provider failed with Bearer bot-runtime-dead-letter-secret",
      failedAt: "2026-06-30T19:10:00.000Z"
    });

    assert.equal(deadLetter.attempts, 4);
    assert.equal(deadLetter.deadLetteredAt, "2026-06-30T19:10:00.000Z");
    assert.equal(deadLetter.failedAt, "2026-06-30T19:10:00.000Z");
    assert.equal(deadLetter.lastError.includes("bot-runtime-dead-letter-secret"), false);
    assert.match(deadLetter.lastError, /\[REDACTED:api_key\]/);
    assert.equal(deadLetter.nextAttemptAt, null);
    assert.equal(deadLetter.status, "dead_lettered");
  });

  it("rejects bot runtime dead-letter state when failure time is malformed", () => {
    assert.throws(
      () => resolveBotRuntimeDeadLetterState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "2026-02-30T19:10:00.000Z"
      }),
      /bot_runtime_dead_letter_failed_at_invalid/
    );

    assert.throws(
      () => resolveBotRuntimeDeadLetterState({
        currentAttempts: 0,
        error: "runtime failed",
        failedAt: "June 30, 2026 19:10:00 UTC"
      }),
      /bot_runtime_dead_letter_failed_at_invalid/
    );
  });

  it("rejects malformed bot runtime scenarios before planning side effects", () => {
    const baseScenario: BotScenario = {
      channels: ["SDK"],
      flowEdges: [{ from: "start", to: "reply" }],
      flowNodes: [
        { id: "start", title: "Start", type: "message" },
        { id: "reply", title: "Reply", type: "message" }
      ],
      id: "bot-runtime-malformed",
      name: "Malformed runtime bot",
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId: "tenant-demo"
    };
    const plan = (scenario: BotScenario, overrides: Partial<Parameters<typeof planBotRuntimeStateTransition>[0]> = {}) => planBotRuntimeStateTransition({
      channel: "SDK",
      conversationId: "conv-bot-runtime-malformed",
      currentNodeId: "start",
      eventId: "evt_inbound_malformed",
      scenario,
      tenantId: "tenant-demo",
      traceId: "trc_bot_runtime_malformed",
      ...overrides
    });

    assert.throws(
      () => plan({ ...baseScenario, status: "draft" }),
      /bot_runtime_scenario_not_published/
    );
    assert.throws(
      () => plan({ ...baseScenario, tenantId: "tenant-other" }),
      /bot_runtime_scenario_tenant_mismatch/
    );
    assert.throws(
      () => plan({ ...baseScenario, schemaVersion: "bot-flow/v2" } as BotScenario),
      /bot_runtime_scenario_schema_unsupported/
    );
    assert.throws(
      () => plan({ ...baseScenario, channels: ["Telegram"] }),
      /bot_runtime_scenario_channel_unsupported/
    );
    assert.throws(
      () => plan({
        ...baseScenario,
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "reply", title: "Reply", type: "mystery" }
        ]
      }),
      /bot_runtime_transition_node_type_unsupported/
    );
  });
});
