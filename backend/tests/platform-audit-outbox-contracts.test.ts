import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  persistPlatformAlertMutation,
  persistPlatformIncidentMutation,
  persistPlatformRolloutMutation
} from "../apps/api-gateway/src/platform/platform-audit-outbox.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";

const incidentInput = {
  actor: { id: "admin-1", name: "Service Admin" },
  customerVisible: true,
  idempotencyKey: "incident-runtime-idempotency",
  incidentId: "inc-webhook-retry",
  message: "Webhook delivery delay is being monitored.",
  reason: "QA incident action",
  status: "monitoring",
  traceId: "trc_platform_incident_audit"
};

describe("platform audit and outbox contracts", () => {
  it("defines platform audit contracts for incident changes", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformIncidentMutation({ ...incidentInput, repository });

    assert.equal(result.audit.mutationKind, "incident");
    assert.equal(result.audit.action, "incident.update");
    assert.equal(result.audit.target, "inc-webhook-retry");
    assert.equal(result.audit.immutable, true);
    assert.equal(result.audit.idempotencyKey, "platform-audit:incident:incident-runtime-idempotency");
    assert.equal(repository.listPlatformAuditRows({ mutationKind: "incident" }).length, 1);
  });

  it("defines platform audit contracts for alert changes", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformAlertMutation({
      actor: incidentInput.actor,
      componentId: "cmp-webhooks",
      idempotencyKey: "alert-ack-cmp-webhooks",
      reason: "Platform alert reviewed",
      repository,
      traceId: "trc_platform_alert_audit"
    });

    assert.equal(result.audit.mutationKind, "alert");
    assert.equal(result.audit.action, "platform.alert.acknowledge");
    assert.equal(result.audit.target, "cmp-webhooks");
    assert.equal(result.audit.idempotencyKey, "platform-audit:alert:alert-ack-cmp-webhooks");
  });

  it("defines platform audit contracts for rollout changes", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformRolloutMutation({
      actor: incidentInput.actor,
      flagKey: "ff-ai-replies",
      idempotencyKey: "rollout-ff-ai-replies",
      reason: "QA rollout preview",
      repository,
      rollout: 100,
      status: "on",
      traceId: "trc_platform_rollout_audit"
    });

    assert.equal(result.audit.mutationKind, "rollout");
    assert.equal(result.audit.action, "feature_flag.update");
    assert.equal(result.audit.target, "ff-ai-replies");
    assert.equal(result.audit.idempotencyKey, "platform-audit:rollout:rollout-ff-ai-replies");
  });

  it("defines platform outbox contracts for incident changes", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformIncidentMutation({ ...incidentInput, repository });

    assert.ok(result.outbox);
    assert.equal(result.outbox?.mutationKind, "incident");
    assert.equal(result.outbox?.queue, "status-page-sync");
    assert.equal(result.outbox?.type, "platform.incident.status_page.requested");
    assert.equal(result.outbox?.idempotencyKey, "platform-outbox:incident:incident-runtime-idempotency");
  });

  it("defines platform outbox contracts for alert changes", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformAlertMutation({
      actor: incidentInput.actor,
      componentId: "cmp-webhooks",
      idempotencyKey: "alert-ack-cmp-webhooks",
      reason: "Platform alert reviewed",
      repository,
      traceId: "trc_platform_alert_outbox"
    });

    assert.ok(result.outbox);
    assert.equal(result.outbox?.queue, "status-page-sync");
    assert.equal(result.outbox?.type, "platform.alert.status_page.requested");
  });

  it("defines platform outbox contracts for rollout changes", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformRolloutMutation({
      actor: incidentInput.actor,
      flagKey: "ff-ai-replies",
      idempotencyKey: "rollout-ff-ai-replies",
      reason: "QA rollout preview",
      repository,
      rollout: 100,
      status: "on",
      traceId: "trc_platform_rollout_outbox"
    });

    assert.ok(result.outbox);
    assert.equal(result.outbox?.queue, "feature-flag-rollout");
    assert.equal(result.outbox?.type, "platform.feature_flag.rollout.requested");
  });

  it("replays incident audit rows idempotently", () => {
    const repository = PlatformRepository.inMemory();
    const first = persistPlatformIncidentMutation({ ...incidentInput, repository });
    const replay = persistPlatformIncidentMutation({ ...incidentInput, repository });

    assert.equal(first.audit.id, replay.audit.id);
    assert.equal(repository.listPlatformAuditRows({ mutationKind: "incident" }).length, 1);
  });

  it("replays incident outbox rows idempotently", () => {
    const repository = PlatformRepository.inMemory();
    const first = persistPlatformIncidentMutation({ ...incidentInput, repository });
    const replay = persistPlatformIncidentMutation({ ...incidentInput, repository });

    assert.equal(first.outbox?.id, replay.outbox?.id);
    assert.equal(repository.listPlatformOutboxRows({ mutationKind: "incident" }).length, 1);
  });

  it("replays alert audit rows idempotently", () => {
    const repository = PlatformRepository.inMemory();
    const input = {
      actor: incidentInput.actor,
      componentId: "cmp-auth",
      idempotencyKey: "alert-ack-cmp-auth",
      reason: "Platform alert reviewed",
      repository: PlatformRepository.inMemory(),
      traceId: "trc_alert_audit_replay"
    };
    const first = persistPlatformAlertMutation(input);
    const replay = persistPlatformAlertMutation({ ...input, repository: input.repository });

    assert.equal(first.audit.id, replay.audit.id);
    assert.equal(input.repository.listPlatformAuditRows({ mutationKind: "alert" }).length, 1);
  });

  it("replays alert outbox rows idempotently", () => {
    const repository = PlatformRepository.inMemory();
    const input = {
      actor: incidentInput.actor,
      componentId: "cmp-auth",
      idempotencyKey: "alert-ack-cmp-auth-outbox",
      reason: "Platform alert reviewed",
      repository,
      traceId: "trc_alert_outbox_replay"
    };
    const first = persistPlatformAlertMutation(input);
    const replay = persistPlatformAlertMutation(input);

    assert.equal(first.outbox?.id, replay.outbox?.id);
    assert.equal(repository.listPlatformOutboxRows({ mutationKind: "alert" }).length, 1);
  });

  it("replays rollout audit rows idempotently", () => {
    const repository = PlatformRepository.inMemory();
    const input = {
      actor: incidentInput.actor,
      flagKey: "ff-billing-v2",
      idempotencyKey: "rollout-ff-billing-v2",
      reason: "QA rollout preview",
      repository,
      rollout: 55,
      status: "gradual" as const,
      traceId: "trc_rollout_audit_replay"
    };
    const first = persistPlatformRolloutMutation(input);
    const replay = persistPlatformRolloutMutation(input);

    assert.equal(first.audit.id, replay.audit.id);
    assert.equal(repository.listPlatformAuditRows({ mutationKind: "rollout" }).length, 1);
  });

  it("replays rollout outbox rows idempotently", () => {
    const repository = PlatformRepository.inMemory();
    const input = {
      actor: incidentInput.actor,
      flagKey: "ff-billing-v2",
      idempotencyKey: "rollout-ff-billing-v2-outbox",
      reason: "QA rollout preview",
      repository,
      rollout: 55,
      status: "gradual" as const,
      traceId: "trc_rollout_outbox_replay"
    };
    const first = persistPlatformRolloutMutation(input);
    const replay = persistPlatformRolloutMutation(input);

    assert.equal(first.outbox?.id, replay.outbox?.id);
    assert.equal(repository.listPlatformOutboxRows({ mutationKind: "rollout" }).length, 1);
  });

  it("keeps incident audit rows immutable across replay paths", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformIncidentMutation({ ...incidentInput, repository });
    result.audit.reason = "mutated";
    const listed = repository.listPlatformAuditRows({ idempotencyKey: result.audit.idempotencyKey });

    assert.equal(listed[0].reason, "QA incident action");
    assert.throws(
      () => repository.savePlatformAuditRow({
        ...listed[0],
        reason: "tampered"
      }),
      /platform_audit_immutable/
    );
  });

  it("keeps alert audit rows immutable across replay paths", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformAlertMutation({
      actor: incidentInput.actor,
      componentId: "cmp-webhooks",
      idempotencyKey: "alert-immutable",
      reason: "Platform alert reviewed",
      repository,
      traceId: "trc_alert_immutable"
    });
    const listed = repository.listPlatformAuditRows({ idempotencyKey: result.audit.idempotencyKey });

    assert.throws(
      () => repository.savePlatformAuditRow({ ...listed[0], reason: "tampered" }),
      /platform_audit_immutable/
    );
  });

  it("keeps rollout audit rows immutable across replay paths", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformRolloutMutation({
      actor: incidentInput.actor,
      flagKey: "ff-ai-replies",
      idempotencyKey: "rollout-immutable",
      reason: "QA rollout preview",
      repository,
      rollout: 100,
      status: "on",
      traceId: "trc_rollout_immutable"
    });
    const listed = repository.listPlatformAuditRows({ idempotencyKey: result.audit.idempotencyKey });

    assert.throws(
      () => repository.savePlatformAuditRow({ ...listed[0], reason: "tampered" }),
      /platform_audit_immutable/
    );
  });

  it("rejects incident audit idempotency conflicts", () => {
    const repository = PlatformRepository.inMemory();
    persistPlatformIncidentMutation({ ...incidentInput, repository });

    assert.throws(
      () => persistPlatformIncidentMutation({
        ...incidentInput,
        message: "Different incident update payload.",
        repository
      }),
      /platform_audit_idempotency_conflict/
    );
  });

  it("rejects incident outbox idempotency conflicts", () => {
    const repository = PlatformRepository.inMemory();
    persistPlatformIncidentMutation({ ...incidentInput, repository });

    assert.throws(
      () => persistPlatformIncidentMutation({
        ...incidentInput,
        status: "resolved",
        repository
      }),
      /platform_outbox_idempotency_conflict/
    );
  });

  it("rejects alert audit idempotency conflicts", () => {
    const repository = PlatformRepository.inMemory();
    persistPlatformAlertMutation({
      actor: incidentInput.actor,
      componentId: "cmp-webhooks",
      idempotencyKey: "alert-conflict",
      reason: "Platform alert reviewed",
      repository,
      traceId: "trc_alert_conflict"
    });

    assert.throws(
      () => persistPlatformAlertMutation({
        actor: incidentInput.actor,
        componentId: "cmp-webhooks",
        idempotencyKey: "alert-conflict",
        reason: "Different alert reason text.",
        repository,
        traceId: "trc_alert_conflict"
      }),
      /platform_audit_idempotency_conflict/
    );
  });

  it("rejects alert outbox idempotency conflicts", () => {
    const repository = PlatformRepository.inMemory();
    persistPlatformAlertMutation({
      actor: incidentInput.actor,
      componentId: "cmp-webhooks",
      idempotencyKey: "alert-outbox-conflict",
      reason: "Platform alert reviewed",
      repository,
      traceId: "trc_alert_outbox_conflict"
    });

    assert.throws(
      () => persistPlatformAlertMutation({
        actor: incidentInput.actor,
        componentId: "cmp-auth",
        idempotencyKey: "alert-outbox-conflict",
        reason: "Platform alert reviewed",
        repository,
        traceId: "trc_alert_outbox_conflict"
      }),
      /platform_outbox_idempotency_conflict/
    );
  });

  it("rejects rollout audit idempotency conflicts", () => {
    const repository = PlatformRepository.inMemory();
    persistPlatformRolloutMutation({
      actor: incidentInput.actor,
      flagKey: "ff-ai-replies",
      idempotencyKey: "rollout-conflict",
      reason: "QA rollout preview",
      repository,
      rollout: 100,
      status: "on",
      traceId: "trc_rollout_conflict"
    });

    assert.throws(
      () => persistPlatformRolloutMutation({
        actor: incidentInput.actor,
        flagKey: "ff-ai-replies",
        idempotencyKey: "rollout-conflict",
        reason: "Different rollout reason.",
        repository,
        rollout: 100,
        status: "on",
        traceId: "trc_rollout_conflict"
      }),
      /platform_audit_idempotency_conflict/
    );
  });

  it("rejects rollout outbox idempotency conflicts", () => {
    const repository = PlatformRepository.inMemory();
    persistPlatformRolloutMutation({
      actor: incidentInput.actor,
      flagKey: "ff-ai-replies",
      idempotencyKey: "rollout-outbox-conflict",
      reason: "QA rollout preview",
      repository,
      rollout: 100,
      status: "on",
      traceId: "trc_rollout_outbox_conflict"
    });

    assert.throws(
      () => persistPlatformRolloutMutation({
        actor: incidentInput.actor,
        flagKey: "ff-billing-v2",
        idempotencyKey: "rollout-outbox-conflict",
        reason: "QA rollout preview",
        repository,
        rollout: 100,
        status: "on",
        traceId: "trc_rollout_outbox_conflict"
      }),
      /platform_outbox_idempotency_conflict/
    );
  });

  it("writes internal-only incident outbox rows to platform-notification", () => {
    const repository = PlatformRepository.inMemory();
    const result = persistPlatformIncidentMutation({
      ...incidentInput,
      customerVisible: false,
      repository
    });

    assert.equal(result.outbox?.queue, "platform-notification");
    assert.equal(result.outbox?.type, "platform.incident.internal_notification.requested");
  });
});
