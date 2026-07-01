import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  persistIncidentCommunicationAttempt,
  planCustomerVisibleIncidentCommunication,
  planInternalIncidentCommunication,
  recordIncidentCommunicationDeadLetterState,
  recordIncidentCommunicationRetryState,
  resolveIncidentCommunicationFailureState
} from "../apps/api-gateway/src/incidents/incident-communication.worker.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";

describe("incident communication worker contracts", () => {
  it("plans one customer-visible status-page descriptor from an incident-update sync job", () => {
    const planned = planCustomerVisibleIncidentCommunication({
      incident: {
        customerMessage: "Webhook delivery delays may affect outbound notifications.",
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Webhook delivery delay is being monitored."
      },
      job: {
        id: "status_page_incident_update_001",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_customer_visible"
    });

    assert.equal(planned.status, "planned");
    assert.equal(planned.descriptor.port, "status-page");
    assert.equal(planned.descriptor.visibility, "customer-visible");
    assert.equal(planned.descriptor.queue, "status-page-sync");
    assert.equal(planned.descriptor.scope, "incident-update");
    assert.equal(planned.descriptor.incidentId, "inc-webhook-retry");
    assert.equal(planned.descriptor.status, "queued");
    assert.equal(
      planned.descriptor.idempotencyKey,
      "incident-communication:customer-visible:inc-webhook-retry:incident-update:status_page_incident_update_001"
    );
    assert.equal(planned.descriptor.traceId, "trc_incident_comm_customer_visible");
    assert.equal(planned.descriptor.requestFingerprint, planned.requestFingerprint);
    assert.equal(planned.descriptor.payload.public, true);
    assert.equal(planned.descriptor.payload.tenantNamesExposed, false);
    assert.equal(planned.descriptor.payload.customerMessage, "Webhook delivery delays may affect outbound notifications.");
    assert.equal(planned.descriptor.payload.updateText, "Webhook delivery delay is being monitored.");
    assert.equal(planned.descriptor.payload.severity, "sev2");
    assert.equal(planned.descriptor.payload.status, "monitoring");
    assert.equal(planned.descriptor.payload.incidentId, "inc-webhook-retry");
    assert.match(planned.descriptor.id, /^incident_comm_inc_webhook_retry_/);
  });

  it("keeps separate idempotency for distinct incident update jobs on the same incident", () => {
    const repository = PlatformRepository.inMemory();
    const first = planCustomerVisibleIncidentCommunication({
      incident: {
        customerMessage: "Webhook delay is being investigated.",
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "investigating",
        updateText: "Initial investigation started."
      },
      job: {
        id: "status_page_incident_update_first",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_first_update"
    });
    const second = planCustomerVisibleIncidentCommunication({
      incident: {
        customerMessage: "Webhook delay mitigation is deployed.",
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Mitigation is deployed and monitored."
      },
      job: {
        id: "status_page_incident_update_second",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_second_update"
    });

    const firstAttempt = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:00:00.000Z",
      plan: first,
      repository
    });
    const secondAttempt = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:05:00.000Z",
      plan: second,
      repository
    });

    assert.notEqual(first.descriptor.idempotencyKey, second.descriptor.idempotencyKey);
    assert.notEqual(first.descriptor.id, second.descriptor.id);
    assert.notEqual(firstAttempt.attemptId, secondAttempt.attemptId);
    assert.equal(repository.listIncidentCommunicationAttempts({ incidentId: "inc-webhook-retry" }).length, 2);
  });

  it("rejects status-page sync jobs outside the incident-update scope", () => {
    assert.throws(
      () => planCustomerVisibleIncidentCommunication({
        incident: {
          customerMessage: "Auth degradation is visible to customers.",
          id: "inc-auth-degrade",
          severity: "sev2",
          status: "investigating",
          updateText: "Auth latency is under review."
        },
        job: {
          id: "status_page_component_alert_001",
          queue: "status-page-sync",
          scope: "component-alert",
          target: "inc-auth-degrade"
        },
        traceId: "trc_incident_comm_scope_guard"
      }),
      /incident_communication_scope_unsupported/
    );
  });

  it("rejects status-page sync jobs when the incident target does not match the job target", () => {
    assert.throws(
      () => planCustomerVisibleIncidentCommunication({
        incident: {
          customerMessage: "Webhook delivery delays may affect outbound notifications.",
          id: "inc-webhook-retry",
          severity: "sev2",
          status: "monitoring",
          updateText: "Webhook delivery delay is being monitored."
        },
        job: {
          id: "status_page_incident_update_mismatch",
          queue: "status-page-sync",
          scope: "incident-update",
          target: "inc-auth-degrade"
        },
        traceId: "trc_incident_comm_target_guard"
      }),
      /incident_communication_target_mismatch/
    );
  });

  it("plans one internal notification descriptor for an internal-only incident update", () => {
    const planned = planInternalIncidentCommunication({
      incident: {
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Internal remediation note only."
      },
      job: {
        id: "platform_notification_incident_update_001",
        queue: "platform-notification",
        scope: "incident-update-internal",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_internal"
    });

    assert.equal(planned.status, "planned");
    assert.equal(planned.descriptor.port, "internal-notification");
    assert.equal(planned.descriptor.visibility, "internal-only");
    assert.equal(planned.descriptor.queue, "platform-notification");
    assert.equal(planned.descriptor.scope, "incident-update-internal");
    assert.equal(planned.descriptor.incidentId, "inc-webhook-retry");
    assert.equal(planned.descriptor.status, "queued");
    assert.equal(
      planned.descriptor.idempotencyKey,
      "incident-communication:internal-only:inc-webhook-retry:incident-update-internal:platform_notification_incident_update_001"
    );
    assert.equal(planned.descriptor.traceId, "trc_incident_comm_internal");
    assert.equal(planned.descriptor.requestFingerprint, planned.requestFingerprint);
    assert.equal(planned.descriptor.payload.public, false);
    assert.equal(planned.descriptor.payload.tenantNamesExposed, false);
    assert.equal(planned.descriptor.payload.updateText, "Internal remediation note only.");
    assert.equal(planned.descriptor.payload.severity, "sev2");
    assert.equal(planned.descriptor.payload.status, "monitoring");
    assert.equal(planned.descriptor.payload.incidentId, "inc-webhook-retry");
    assert.equal("customerMessage" in planned.descriptor.payload, false);
    assert.match(planned.descriptor.id, /^incident_internal_inc_webhook_retry_/);
  });

  it("rejects internal notification jobs outside the incident-update-internal scope", () => {
    assert.throws(
      () => planInternalIncidentCommunication({
        incident: {
          id: "inc-auth-degrade",
          severity: "sev2",
          status: "investigating",
          updateText: "Auth latency is under review."
        },
        job: {
          id: "platform_notification_wrong_scope",
          queue: "platform-notification",
          scope: "incident-update",
          target: "inc-auth-degrade"
        },
        traceId: "trc_incident_comm_internal_scope_guard"
      }),
      /incident_communication_scope_unsupported/
    );
  });

  it("persists incident communication attempts without shared mutable references", () => {
    const repository = PlatformRepository.inMemory();
    const planned = planCustomerVisibleIncidentCommunication({
      incident: {
        customerMessage: "Webhook delivery delays may affect outbound notifications.",
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Webhook delivery delay is being monitored."
      },
      job: {
        id: "status_page_incident_update_001",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_attempt"
    });

    const saved = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:00:00.000Z",
      plan: planned,
      repository
    });
    saved.status = "mutated";
    const replay = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:01:00.000Z",
      plan: planned,
      repository
    });
    const attempts = repository.listIncidentCommunicationAttempts({
      incidentId: "inc-webhook-retry",
      visibility: "customer-visible"
    });
    attempts[0].status = "mutated";
    const storedAttempts = repository.listIncidentCommunicationAttempts({
      incidentId: "inc-webhook-retry",
      visibility: "customer-visible"
    });

    assert.equal(saved.attemptId, replay.attemptId);
    assert.equal(replay.descriptorId, planned.descriptor.id);
    assert.equal(replay.attemptedAt, "2026-07-01T09:00:00.000Z");
    assert.equal(storedAttempts.length, 1);
    assert.equal(storedAttempts[0].port, "status-page");
    assert.equal(storedAttempts[0].idempotencyKey, planned.descriptor.idempotencyKey);
    assert.equal(storedAttempts[0].traceId, "trc_incident_comm_attempt");
    assert.equal(storedAttempts[0].status, "queued");
  });

  it("persists incident communication retry state for a claimed attempt", () => {
    const repository = PlatformRepository.inMemory();
    const planned = planInternalIncidentCommunication({
      incident: {
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Internal remediation note only."
      },
      job: {
        id: "platform_notification_incident_update_001",
        queue: "platform-notification",
        scope: "incident-update-internal",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_retry"
    });
    const attempt = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:00:00.000Z",
      plan: planned,
      repository
    });
    repository.saveIncidentCommunicationAttempt({
      ...attempt,
      status: "publishing"
    });

    const retry = recordIncidentCommunicationRetryState({
      attemptId: attempt.attemptId,
      error: "status-page provider failed with Bearer incident-secret-token",
      failedAt: "2026-07-01T09:01:00.000Z",
      maxAttempts: 3,
      repository,
      retryBackoffMs: 60_000
    });
    retry.lastError = "mutated";
    const retries = repository.listIncidentCommunicationRetries({ attemptId: attempt.attemptId });

    assert.equal(retry.status, "retry_scheduled");
    assert.equal(retry.attempts, 1);
    assert.equal(retry.nextAttemptAt, "2026-07-01T09:02:00.000Z");
    assert.equal(retry.lastError.includes("incident-secret-token"), false);
    assert.equal(retries.length, 1);
    assert.equal(retries[0].status, "retry_scheduled");
  });

  it("increments persisted incident communication retry attempts across failures", () => {
    const repository = PlatformRepository.inMemory();
    const planned = planInternalIncidentCommunication({
      incident: {
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Internal remediation note only."
      },
      job: {
        id: "platform_notification_incident_update_retry_increment",
        queue: "platform-notification",
        scope: "incident-update-internal",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_retry_increment"
    });
    const attempt = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:00:00.000Z",
      plan: planned,
      repository
    });
    repository.saveIncidentCommunicationAttempt({
      ...attempt,
      status: "publishing"
    });
    recordIncidentCommunicationRetryState({
      attemptId: attempt.attemptId,
      error: "provider failed once",
      failedAt: "2026-07-01T09:01:00.000Z",
      maxAttempts: 3,
      repository,
      retryBackoffMs: 60_000
    });
    repository.saveIncidentCommunicationAttempt({
      ...attempt,
      status: "publishing"
    });

    const retry = recordIncidentCommunicationRetryState({
      attemptId: attempt.attemptId,
      error: "provider failed twice",
      failedAt: "2026-07-01T09:03:00.000Z",
      maxAttempts: 3,
      repository,
      retryBackoffMs: 60_000
    });
    const retries = repository.listIncidentCommunicationRetries({ attemptId: attempt.attemptId });

    assert.equal(retry.attempts, 2);
    assert.equal(retry.failedAt, "2026-07-01T09:03:00.000Z");
    assert.equal(retry.nextAttemptAt, "2026-07-01T09:04:00.000Z");
    assert.equal(retries.length, 1);
    assert.equal(retries[0].attempts, 2);
  });

  it("persists incident communication dead-letter state when retry attempts are exhausted", () => {
    const repository = PlatformRepository.inMemory();
    const planned = planCustomerVisibleIncidentCommunication({
      incident: {
        customerMessage: "Webhook delivery delays may affect outbound notifications.",
        id: "inc-webhook-retry",
        severity: "sev2",
        status: "monitoring",
        updateText: "Webhook delivery delay is being monitored."
      },
      job: {
        id: "status_page_incident_update_dead_letter",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      traceId: "trc_incident_comm_dead_letter"
    });
    const attempt = persistIncidentCommunicationAttempt({
      attemptedAt: "2026-07-01T09:00:00.000Z",
      plan: planned,
      repository
    });
    repository.saveIncidentCommunicationAttempt({
      ...attempt,
      status: "publishing"
    });

    const failure = resolveIncidentCommunicationFailureState({
      currentAttempts: 2,
      failedAt: "2026-07-01T09:03:00.000Z",
      maxAttempts: 3
    });
    assert.equal(failure.status, "dead_lettered");

    const deadLetter = recordIncidentCommunicationDeadLetterState({
      attemptId: attempt.attemptId,
      error: "status-page provider failed with Bearer incident-dead-letter-secret",
      failedAt: "2026-07-01T09:03:00.000Z",
      maxAttempts: 3,
      repository
    });
    deadLetter.lastError = "mutated";
    const deadLetters = repository.listIncidentCommunicationDeadLetters({ attemptId: attempt.attemptId });

    assert.equal(deadLetter.status, "dead_lettered");
    assert.equal(deadLetter.attempts, 3);
    assert.equal(deadLetter.deadLetteredAt, "2026-07-01T09:03:00.000Z");
    assert.equal(deadLetter.lastError.includes("incident-dead-letter-secret"), false);
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0].status, "dead_lettered");
  });
});
