import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeadLetterReplayIdempotencyFingerprint,
  createDeadLetterReplayConflictEnvelope,
  createDeterministicDeadLetterReplayBackendStore,
  executeDeadLetterReplayWorker,
  listKnownDeadLetterQueueNames,
  persistDeadLetterReplayRequeueAudit,
  persistDeadLetterReplayValidationDenial,
  requeueDeadLetterThroughReplayHelper,
  validateDeadLetterQueueOwnership,
  validateDeadLetterReplayIdempotency
} from "../apps/api-gateway/src/operations/dead-letter-replay.worker.ts";
import { deadLetterMessages } from "../apps/api-gateway/src/operations/seed-catalog.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";

describe("dead-letter replay worker contracts", () => {
  const webhookMessage = deadLetterMessages.find((item) => item.id === "dlm-webhook-001")!;
  const billingMessage = deadLetterMessages.find((item) => item.id === "dlm-billing-001")!;

  it("adds dead-letter replay worker tests for queue ownership validation", () => {
    const valid = validateDeadLetterQueueOwnership(webhookMessage);
    assert.equal(valid.ok, true);
    assert.equal(valid.ownership?.ownerQueue, "webhook-delivery");
    assert.equal(valid.ownership?.replayEnabled, true);

    const mismatch = validateDeadLetterQueueOwnership({
      queueName: "webhook-delivery",
      resourceType: "billing_sync"
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "dead_letter_queue_ownership_mismatch");

    const disabled = validateDeadLetterQueueOwnership(billingMessage);
    assert.equal(disabled.ok, false);
    assert.equal(disabled.code, "dead_letter_replay_disabled");
  });

  it("adds dead-letter replay worker tests for idempotency validation", () => {
    const repository = OperationsRepository.inMemory();
    const fingerprint = buildDeadLetterReplayIdempotencyFingerprint({
      messageId: webhookMessage.id,
      reason: "Replay after signature fix",
      resourceId: webhookMessage.resourceId
    });
    repository.saveDeadLetterReplayIdempotencyKey({
      fingerprint,
      key: "replay-webhook-001",
      result: { replay: { id: "dead_letter_replay_cached" } }
    });

    const duplicate = validateDeadLetterReplayIdempotency({
      fingerprint,
      idempotencyKey: "replay-webhook-001",
      operationsRepository: repository
    });
    const conflict = validateDeadLetterReplayIdempotency({
      fingerprint: buildDeadLetterReplayIdempotencyFingerprint({
        messageId: "dlm-report-001",
        reason: "Replay report export",
        resourceId: "export-2421"
      }),
      idempotencyKey: "replay-webhook-001",
      operationsRepository: repository
    });

    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "idempotency_key_reused");
  });

  it("implements queue ownership validation before dead-letter replay", async () => {
    const repository = OperationsRepository.inMemory();
    const result = await executeDeadLetterReplayWorker({
      backendStore: createDeterministicDeadLetterReplayBackendStore(),
      message: billingMessage,
      operationsRepository: repository,
      reason: "Replay disabled queue"
    });

    assert.equal(result.status, "denied");
    assert.equal(result.envelope.code, "dead_letter_replay_disabled");
    assert.equal(repository.listDeadLetterReplayValidationDenials({ messageId: billingMessage.id }).length, 1);
  });

  it("implements idempotency validation before dead-letter replay", async () => {
    const repository = OperationsRepository.inMemory();
    const first = await executeDeadLetterReplayWorker({
      backendStore: createDeterministicDeadLetterReplayBackendStore(),
      idempotencyKey: "replay-webhook-worker",
      message: webhookMessage,
      operationsRepository: repository,
      reason: "Replay after signature fix"
    });
    const duplicate = await executeDeadLetterReplayWorker({
      backendStore: createDeterministicDeadLetterReplayBackendStore(),
      idempotencyKey: "replay-webhook-worker",
      message: webhookMessage,
      operationsRepository: repository,
      reason: "Replay after signature fix"
    });
    const conflict = await executeDeadLetterReplayWorker({
      backendStore: createDeterministicDeadLetterReplayBackendStore(),
      idempotencyKey: "replay-webhook-worker",
      message: deadLetterMessages.find((item) => item.id === "dlm-report-001")!,
      operationsRepository: repository,
      reason: "Replay report export"
    });

    assert.equal(first.status, "requeued");
    assert.equal(duplicate.status, "requeued");
    assert.equal(duplicate.duplicate, true);
    assert.equal(conflict.status, "denied");
    assert.equal(conflict.envelope.code, "idempotency_key_reused");
  });

  it("implements dead-letter requeue through the common replay helper after validation", async () => {
    const repository = OperationsRepository.inMemory();
    const backendStore = createDeterministicDeadLetterReplayBackendStore();
    const helper = await requeueDeadLetterThroughReplayHelper({
      backendStore,
      id: webhookMessage.resourceId,
      now: new Date("2026-07-01T12:00:00.000Z"),
      queue: "webhook-delivery",
      reason: "operator approved replay"
    });
    const worker = await executeDeadLetterReplayWorker({
      backendStore,
      message: webhookMessage,
      now: new Date("2026-07-01T12:05:00.000Z"),
      operationsRepository: repository,
      reason: "Replay after signature fix"
    });

    assert.equal(helper.item.deadLetteredAt, null);
    assert.equal(helper.auditEvent.result, "requeued");
    assert.equal(worker.status, "requeued");
    assert.equal(worker.backendItem.queue, "webhook-delivery");
    assert.equal(worker.replay.sourceQueue, "webhook-delivery");
    assert.equal(repository.readState().deadLetterReplays.length, 1);
  });

  it("wires dead-letter replay validation-denial audit rows", () => {
    const repository = OperationsRepository.inMemory();
    const saved = persistDeadLetterReplayValidationDenial(repository, {
      auditEvent: {
        action: "operations.dead_letter.replay.validation_denied",
        code: "dead_letter_queue_unknown",
        id: "evt_validation_denied_001",
        immutable: true,
        messageId: "dlm-unknown-001",
        queueName: "unknown-queue",
        reason: "Replay unknown queue",
        target: "dlm-unknown-001"
      },
      code: "dead_letter_queue_unknown",
      messageId: "dlm-unknown-001",
      queueName: "unknown-queue",
      reason: "Replay unknown queue"
    });
    saved.code = "mutated";

    const listed = repository.listDeadLetterReplayValidationDenials({ messageId: "dlm-unknown-001" });
    assert.equal(listed[0].code, "dead_letter_queue_unknown");
    assert.equal(listed[0].auditEvent.immutable, true);
  });

  it("wires dead-letter replay requeue audit rows", () => {
    const repository = OperationsRepository.inMemory();
    const saved = persistDeadLetterReplayRequeueAudit(repository, {
      auditEvent: {
        action: "operations.dead_letter.replay.requeued",
        backendAuditId: "evt_dead_letter_replay_backend_001",
        id: "evt_dead_letter_requeue_001",
        immutable: true,
        messageId: webhookMessage.id,
        queueName: webhookMessage.queueName,
        reason: "Replay after signature fix",
        resourceId: webhookMessage.resourceId,
        target: webhookMessage.id
      },
      messageId: webhookMessage.id,
      queueName: webhookMessage.queueName,
      reason: "Replay after signature fix",
      replay: {
        id: "dead_letter_replay_001",
        messageId: webhookMessage.id,
        queue: "dead-letter-replay",
        sourceQueue: webhookMessage.queueName
      }
    });
    saved.reason = "mutated";

    const listed = repository.listDeadLetterReplayRequeueAudits({ messageId: webhookMessage.id });
    assert.equal(listed[0].auditEvent.immutable, true);
    assert.equal(listed[0].reason, "Replay after signature fix");
    assert.equal(listed[0].replay.queue, "dead-letter-replay");
  });

  it("wires dead-letter replay conflict envelopes", () => {
    const envelope = createDeadLetterReplayConflictEnvelope({
      code: "idempotency_key_reused",
      message: "Bearer sk-live-secret was already used for another replay",
      messageId: webhookMessage.id,
      queueName: webhookMessage.queueName
    });

    assert.equal(envelope.sanitized, true);
    assert.equal(envelope.code, "idempotency_key_reused");
    assert.match(envelope.message, /Bearer \[REDACTED:api_key\]/);
    assert.doesNotMatch(envelope.message, /sk-live-secret/);
  });

  it("wires unknown-queue fail-closed behavior", async () => {
    const repository = OperationsRepository.inMemory();
    const result = await executeDeadLetterReplayWorker({
      backendStore: createDeterministicDeadLetterReplayBackendStore(),
      message: {
        ...webhookMessage,
        id: "dlm-unknown-001",
        queueName: "payments-delivery",
        resourceType: "payments_delivery"
      },
      operationsRepository: repository,
      reason: "Replay unknown queue"
    });

    assert.equal(result.status, "denied");
    assert.equal(result.envelope.code, "dead_letter_queue_unknown");
    assert.deepEqual(listKnownDeadLetterQueueNames(), [
      "billing-sync",
      "realtime-fanout",
      "report-export",
      "webhook-delivery"
    ]);
    assert.equal(repository.listDeadLetterReplayValidationDenials({ messageId: "dlm-unknown-001" })[0]?.code, "dead_letter_queue_unknown");
  });

  it("converts backend replay exceptions into sanitized denial envelopes", async () => {
    const repository = OperationsRepository.inMemory();
    const result = await executeDeadLetterReplayWorker({
      backendStore: createDeterministicDeadLetterReplayBackendStore({
        missingIds: new Set([webhookMessage.resourceId])
      }),
      message: webhookMessage,
      operationsRepository: repository,
      reason: "Replay after signature fix"
    });

    assert.equal(result.status, "denied");
    assert.equal(result.envelope.code, "dead_letter_replay_backend_failed");
    assert.equal(result.envelope.sanitized, true);
    assert.equal(repository.listDeadLetterReplayValidationDenials({ messageId: webhookMessage.id })[0]?.code, "dead_letter_replay_backend_failed");
  });
});
