import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { configureRoutingRepository } from "../apps/api-gateway/src/routing/bootstrap.ts";
import {
  RoutingRepository,
  type OperatorCapacityRecord,
  type QueueMembershipRecord,
  type RoutingJobDescriptor,
  type RoutingState,
  type RoutingRuleRecord
} from "../apps/api-gateway/src/routing/routing.repository.ts";

describe("Prisma-backed routing repository contracts", () => {
  afterEach(() => {
    RoutingRepository.clearDefault();
  });

  it("persists routing rules through Prisma delegates", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const repository = RoutingRepository.prisma({ client });
    const rule: RoutingRuleRecord = {
      channel: "VK",
      enabled: true,
      id: "rule_prisma_vk",
      limitMode: "operator_channel_limit",
      priorityStrategy: "least_loaded",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z",
      waitThresholdSeconds: 180
    };

    const saved = await repository.saveRoutingRule(rule);
    const refetched = await repository.findRoutingRule("rule_prisma_vk", { tenantId: "tenant-volga" });
    const byChannel = await repository.findRoutingRuleByChannel("tenant-volga", "VK");
    const crossTenant = await repository.findRoutingRule("rule_prisma_vk", { tenantId: "tenant-lumen" });
    const rules = await repository.listRoutingRules({ tenantId: "tenant-volga" });

    assert.equal(saved.limitMode, "operator_channel_limit");
    assert.equal(refetched?.waitThresholdSeconds, 180);
    assert.equal(byChannel?.id, "rule_prisma_vk");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rules.map((item) => item.id), ["rule_prisma_vk"]);
    assert.deepEqual(calls.routingRuleUpserts[0], {
      create: {
        channel: "VK",
        enabled: true,
        id: "rule_prisma_vk",
        limitMode: "operator_channel_limit",
        priorityStrategy: "least_loaded",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-29T12:00:00.000Z"),
        waitThresholdSeconds: 180
      },
      update: {
        channel: "VK",
        enabled: true,
        limitMode: "operator_channel_limit",
        priorityStrategy: "least_loaded",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-29T12:00:00.000Z"),
        waitThresholdSeconds: 180
      },
      where: { id: "rule_prisma_vk" }
    });
  });

  it("persists queue membership rows through Prisma delegates", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const repository = RoutingRepository.prisma({ client });
    const membership: QueueMembershipRecord = {
      active: true,
      id: "membership_prisma_vk_anna",
      operatorId: "operator-anna",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:05:00.000Z"
    };

    const saved = await repository.saveQueueMembership(membership);
    const refetched = await repository.findQueueMembership("membership_prisma_vk_anna", { tenantId: "tenant-volga" });
    const memberships = await repository.listQueueMemberships({ queueId: "VK", tenantId: "tenant-volga" });

    assert.equal(saved.role, "primary");
    assert.equal(refetched?.operatorId, "operator-anna");
    assert.deepEqual(memberships.map((item) => item.id), ["membership_prisma_vk_anna"]);
    assert.deepEqual(calls.queueMembershipUpserts[0]?.where, { id: "membership_prisma_vk_anna" });
  });

  it("persists operator capacity rows through Prisma delegates", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const repository = RoutingRepository.prisma({ client });
    const capacity: OperatorCapacityRecord = {
      channel: "VK",
      chatLimit: 12,
      id: "capacity_prisma_vk_anna",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:10:00.000Z"
    };

    const saved = await repository.saveOperatorCapacity(capacity);
    const refetched = await repository.findOperatorCapacity("capacity_prisma_vk_anna", { tenantId: "tenant-volga" });
    const byOperatorChannel = await repository.findOperatorCapacityByOperatorChannel("tenant-volga", "operator-anna", "VK");
    const capacities = await repository.listOperatorCapacities({ tenantId: "tenant-volga" });

    assert.equal(saved.chatLimit, 12);
    assert.equal(refetched?.overrideAllowed, false);
    assert.equal(byOperatorChannel?.id, "capacity_prisma_vk_anna");
    assert.deepEqual(capacities.map((item) => item.id), ["capacity_prisma_vk_anna"]);
    assert.deepEqual(calls.operatorCapacityUpserts[0]?.where, { id: "capacity_prisma_vk_anna" });
  });

  it("persists routing runtime job descriptors through Prisma delegates without fallback", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const fallback = RoutingRepository.inMemory();
    fallback.saveJob = () => {
      throw new Error("fallback saveJob called");
    };
    fallback.listJobs = () => {
      throw new Error("fallback listJobs called");
    };
    const repository = RoutingRepository.prisma({ client, fallback });
    const job: RoutingJobDescriptor = {
      action: "return_to_sla_queue",
      attempts: 1,
      auditEvent: {
        action: "rescue.resolve",
        immutable: true,
        reason: "Operator missed rescue timer"
      },
      claimedAt: "2026-06-29T12:20:00.000Z",
      conversationId: "dialog-prisma-rescue",
      id: "job_prisma_rescue_return",
      kind: "rescue.return_queue",
      nextAttemptAt: null,
      queue: "rescue-return",
      runAt: 1793276400000,
      selectedQueues: ["VK", "Telegram"],
      status: "claimed"
    };

    const saved = await repository.saveJob(job);
    const listed = await repository.listJobs();

    assert.deepEqual(saved, job);
    assert.deepEqual(listed, [job]);
    assert.deepEqual(calls.routingJobUpserts, [{
      create: {
        action: "return_to_sla_queue",
        claimedAt: new Date("2026-06-29T12:20:00.000Z"),
        conversationId: "dialog-prisma-rescue",
        id: "job_prisma_rescue_return",
        kind: "rescue.return_queue",
        leaseExpiresAt: null,
        leaseOwner: null,
        payload: job,
        queue: "rescue-return",
        redistributionId: null,
        runAt: 1793276400000,
        status: "claimed"
      },
      update: {
        action: "return_to_sla_queue",
        claimedAt: new Date("2026-06-29T12:20:00.000Z"),
        conversationId: "dialog-prisma-rescue",
        kind: "rescue.return_queue",
        leaseExpiresAt: null,
        leaseOwner: null,
        payload: job,
        queue: "rescue-return",
        redistributionId: null,
        runAt: 1793276400000,
        status: "claimed"
      },
      where: { id: "job_prisma_rescue_return" }
    }]);
    assert.deepEqual(calls.routingJobFindMany, [
      { orderBy: { updatedAt: "desc" } }
    ]);
  });

  it("uses Prisma DB null for routing job runAt when the descriptor has no due time", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const repository = RoutingRepository.prisma({ client });

    await repository.saveJob({
      action: "manual_review",
      id: "job_prisma_no_run_at",
      queue: "manual-routing",
      status: "pending"
    });

    assert.equal(calls.routingJobUpserts[0]?.create.runAt, Prisma.DbNull);
    assert.equal((await repository.listJobs())[0]?.runAt, undefined);
  });

  it("claims routing jobs with a compare-and-set Prisma update", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const repository = RoutingRepository.prisma({ client });
    const job: RoutingJobDescriptor = {
      action: "resume_sla",
      id: "job_prisma_sla_claim",
      queue: "sla-timers",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "pending"
    };
    await repository.saveJob(job);

    const claimed = await repository.claimJob({
      claimedAt: "2026-06-29T13:16:00.000Z",
      expectedStatus: "pending",
      jobId: "job_prisma_sla_claim",
      leaseDurationMs: 30_000,
      queue: "sla-timers",
      workerId: "sla-worker-a"
    });
    const duplicate = await repository.claimJob({
      claimedAt: "2026-06-29T13:16:01.000Z",
      expectedStatus: "pending",
      jobId: "job_prisma_sla_claim",
      queue: "sla-timers"
    });

    assert.equal(claimed?.id, "job_prisma_sla_claim");
    assert.equal(claimed?.status, "claimed");
    assert.equal(claimed?.claimedAt, "2026-06-29T13:16:00.000Z");
    assert.equal(claimed?.leaseExpiresAt, "2026-06-29T13:16:30.000Z");
    assert.equal(claimed?.leaseOwner, "sla-worker-a");
    assert.equal(duplicate, undefined);
    assert.deepEqual(calls.routingJobUpdateMany, [{
      data: {
        action: "resume_sla",
        claimedAt: new Date("2026-06-29T13:16:00.000Z"),
        conversationId: null,
        kind: null,
        leaseExpiresAt: new Date("2026-06-29T13:16:30.000Z"),
        leaseOwner: "sla-worker-a",
        payload: {
          ...job,
          claimedAt: "2026-06-29T13:16:00.000Z",
          leaseExpiresAt: "2026-06-29T13:16:30.000Z",
          leaseOwner: "sla-worker-a",
          status: "claimed"
        },
        queue: "sla-timers",
        redistributionId: null,
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed"
      },
      where: {
        id: "job_prisma_sla_claim",
        leaseExpiresAt: null,
        leaseOwner: null,
        queue: "sla-timers",
        status: "pending"
      }
    }]);
  });

  it("hydrates and persists routing runtime state snapshots through Prisma delegates without fallback", async () => {
    const { client, calls, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    const persistedState: RoutingState = {
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-persisted",
        operatorId: "operator-anna",
        slaTone: "warn",
        status: "assigned",
        topic: "Persistence"
      }],
      jobs: [],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 42,
        channels: ["VK"],
        chats: 3,
        id: "operator-anna",
        limit: 12,
        name: "Anna",
        rescueActive: 1,
        slaPercent: 98,
        status: "online",
        tenantId: "tenant-volga"
      }],
      queueMemberships: [],
      queues: [{
        active: 3,
        channel: "VK",
        health: 94,
        limit: 50,
        overdue: 1,
        tenantId: "tenant-volga",
        waiting: 7
      }],
      rescueReportRows: [{
        channel: "VK",
        conversationId: "dialog-prisma-persisted",
        digest: "daily_rescue",
        operatorId: "operator-anna",
        outcome: "saved",
        reason: "Persisted rescue",
        resolution: "Handled before timeout",
        timerSeconds: 240
      }],
      routingAnalyticsRows: [],
      routingRules: []
    };
    seedRoutingStateSnapshot(persistedState);
    const fallback = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Fallback client",
        id: "dialog-fallback",
        slaTone: "ok",
        status: "queued"
      }],
      rescueReportRows: []
    });
    const repository = RoutingRepository.prisma({ client, fallback });
    fallback.readState = () => {
      throw new Error("fallback readState called");
    };
    fallback.saveState = () => {
      throw new Error("fallback saveState called");
    };

    const hydrated = await repository.hydrateStateSnapshot();
    const cached = repository.readState();
    const nextState: RoutingState = {
      ...hydrated,
      conversations: hydrated.conversations.map((conversation) => conversation.id === "dialog-prisma-persisted"
        ? {
            channel: conversation.channel,
            client: conversation.client,
            id: conversation.id,
            slaTone: "hold",
            status: "queued",
            topic: conversation.topic
          }
        : conversation),
      queues: hydrated.queues.map((queue) => queue.channel === "VK"
        ? { ...queue, active: 2, waiting: 8 }
        : queue)
    };
    const saved = await repository.saveState(nextState);

    assert.equal(hydrated.conversations[0]?.id, "dialog-prisma-persisted");
    assert.equal(cached.conversations[0]?.id, "dialog-prisma-persisted");
    assert.equal(saved.conversations[0]?.status, "queued");
    assert.equal(repository.readState().queues[0]?.waiting, 8);
    assert.deepEqual(calls.routingStateSnapshotFindUnique, [
      { where: { id: "default" } }
    ]);
    assert.deepEqual(calls.routingStateSnapshotUpdateMany.at(-1), {
      data: {
        conversations: nextState.conversations,
        operators: nextState.operators,
        queues: nextState.queues,
        rescueReportRows: nextState.rescueReportRows,
        version: 2
      },
      where: { id: "default", version: 1 }
    });
  });

  it("creates a PostgreSQL-owned empty routing state snapshot when no snapshot row exists", async () => {
    const { client, calls } = createFakePrismaRoutingClient();
    const fallback = RoutingRepository.inMemory({
      conversations: [{
        channel: "VK",
        client: "Fallback client",
        id: "dialog-json-fallback",
        slaTone: "ok",
        status: "queued"
      }],
      operators: [{
        avgFirstResponseSeconds: 20,
        channels: ["VK"],
        chats: 1,
        id: "operator-json-fallback",
        limit: 4,
        name: "Fallback Operator",
        rescueActive: 0,
        slaPercent: 99,
        status: "online"
      }],
      queues: [{
        active: 1,
        channel: "VK",
        health: 100,
        limit: 10,
        overdue: 0,
        waiting: 2
      }],
      rescueReportRows: [{
        channel: "VK",
        conversationId: "dialog-json-fallback",
        digest: "daily_rescue",
        operatorId: "operator-json-fallback",
        outcome: "saved",
        reason: "Fallback rescue row",
        resolution: "Fallback resolution",
        timerSeconds: 60
      }]
    });
    fallback.readState = () => {
      throw new Error("fallback readState called");
    };
    fallback.saveState = () => {
      throw new Error("fallback saveState called");
    };
    const repository = RoutingRepository.prisma({ client, fallback });

    const hydrated = await repository.hydrateStateSnapshot();

    assert.deepEqual(hydrated.conversations, []);
    assert.deepEqual(hydrated.operators, []);
    assert.deepEqual(hydrated.queues, []);
    assert.deepEqual(hydrated.rescueReportRows, []);
    assert.deepEqual(calls.routingStateSnapshotFindUnique, [
      { where: { id: "default" } }
    ]);
    assert.deepEqual(calls.routingStateSnapshotCreate, [{
      data: {
        conversations: [],
        id: "default",
        operators: [],
        queues: [],
        rescueReportRows: [],
        version: 1
      }
    }]);
    assert.equal(repository.readState().conversations.some((conversation) => conversation.id === "dialog-json-fallback"), false);
  });

  it("fails closed when a routing state snapshot save races a newer snapshot version", async () => {
    const { client, calls, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    const initialState = emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-versioned",
        slaTone: "ok",
        status: "queued"
      }]
    });
    seedRoutingStateSnapshot(initialState);
    const first = RoutingRepository.prisma({ client });
    const second = RoutingRepository.prisma({ client });
    await first.hydrateStateSnapshot();
    await second.hydrateStateSnapshot();
    await second.saveState({
      ...second.readState(),
      queues: [{
        active: 0,
        channel: "VK",
        health: 100,
        limit: 10,
        overdue: 0,
        waiting: 1
      }]
    });
    const routingJobUpsertsBeforeConflict = calls.routingJobUpserts.length;
    const routingAnalyticsUpsertsBeforeConflict = calls.routingAnalyticsRowUpserts.length;

    await assert.rejects(
      () => first.saveState({
        ...first.readState(),
        conversations: [],
        jobs: [{
          action: "resume_sla",
          id: "job_prisma_conflict_should_not_commit",
          queue: "sla-timers",
          runAt: "2026-06-29T13:15:00.000Z",
          status: "completed"
        }],
        routingAnalyticsRows: [{
          channel: "VK",
          conversationId: "dialog-prisma-versioned",
          eventKind: "auto_return",
          fromOperatorId: "operator-anna",
          id: "analytics_conflict_should_not_commit",
          occurredAt: "2026-06-29T13:16:00.000Z",
          source: "conflict-test",
          tenantId: "tenant-volga",
          toOperatorId: null
        }]
      }),
      /routing_state_snapshot_conflict/
    );
    assert.equal(calls.routingJobUpserts.length, routingJobUpsertsBeforeConflict);
    assert.equal(calls.routingAnalyticsRowUpserts.length, routingAnalyticsUpsertsBeforeConflict);
    assert.equal((await first.listJobs()).some((job) => job.id === "job_prisma_conflict_should_not_commit"), false);
    assert.equal((await first.listRoutingAnalyticsRows()).some((row) => row.id === "analytics_conflict_should_not_commit"), false);
  });

  it("rolls back routing state when a lifecycle event identity is duplicated", async () => {
    const { client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Atomic client",
        id: "dialog-prisma-lifecycle-atomic",
        slaTone: "ok",
        status: "queued",
        tenantId: "tenant-volga"
      }],
      queues: [{
        active: 0,
        channel: "VK",
        health: 100,
        limit: 10,
        overdue: 0,
        tenantId: "tenant-volga",
        waiting: 1
      }]
    }));
    const repository = RoutingRepository.prisma({ client });
    const state = await repository.hydrateStateSnapshot();
    const event = {
      actorId: "operator-anna",
      actorName: null,
      actorType: "operator" as const,
      conversationId: "dialog-prisma-lifecycle-atomic",
      data: { toStatus: "assigned" },
      eventType: "assignment.changed",
      id: "lifecycle-routing-atomic",
      ingestedAt: "2026-06-29T13:16:30.000Z",
      occurredAt: "2026-06-29T13:16:30.000Z",
      reason: "Atomic routing change",
      schemaVersion: "conversation-lifecycle/v1" as const,
      source: "routing-api",
      sourceEventId: "routing-atomic-source",
      tenantId: "tenant-volga",
      traceId: "trace-routing-atomic"
    };
    await repository.saveStateWithLifecycleEvents(state, [event]);

    await assert.rejects(
      () => repository.saveStateWithLifecycleEvents({
        ...repository.readState(),
        queues: repository.readState().queues.map((queue) => ({ ...queue, waiting: 99 }))
      }, [event]),
      /conversation_lifecycle_events_source_key/
    );

    const persisted = await repository.hydrateStateSnapshot();
    assert.equal(persisted.queues[0]?.waiting, 1);
  });

  it("skips SLA apply when the Prisma-current job was completed after local state hydration", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const { client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-stale-apply",
        operatorId: "operator-anna",
        slaTone: "hold",
        status: "paused",
        tenantId: "tenant-ladoga"
      }]
    }));
    const writer = RoutingRepository.prisma({ client });
    await writer.saveJob({
      action: "resume_sla",
      conversationId: "dialog-prisma-stale-apply",
      id: "job_prisma_stale_apply",
      queue: "sla-timers",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "claimed",
      tenantId: "tenant-ladoga"
    });
    const staleWorkerRepository = RoutingRepository.prisma({ client });
    await staleWorkerRepository.hydrateStateSnapshot();
    const staleState = staleWorkerRepository.readState();
    const transition = worker.planSlaTimerTransition({
      conversation: staleState.conversations[0],
      job: staleState.jobs[0],
      now: new Date("2026-06-29T13:16:30.000Z")
    });
    await writer.saveJob({
      ...((await writer.listJobs()).find((job) => job.id === "job_prisma_stale_apply")!),
      completedAt: "2026-06-29T13:16:15.000Z",
      status: "completed"
    });

    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: staleWorkerRepository,
      transition
    });

    const jobs = await writer.listJobs();
    assert.equal(applied.status, "skipped");
    assert.equal(applied.reason, "job_not_claimed");
    assert.equal(jobs.find((job) => job.id === "job_prisma_stale_apply")?.status, "completed");
    assert.equal(staleWorkerRepository.readState().conversations[0]?.status, "paused");
  });

  it("skips rescue-return apply when the Prisma-current job was completed after local state hydration", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const { client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-stale-rescue",
        operatorId: "operator-anna",
        rescue: {
          durationSeconds: 240,
          reason: "Operator response risk",
          startedAt: "2026-06-29T13:00:00.000Z",
          state: "active"
        },
        slaTone: "danger",
        status: "assigned"
      }],
      operators: [{
        avgFirstResponseSeconds: 30,
        channels: ["VK"],
        chats: 1,
        id: "operator-anna",
        limit: 5,
        name: "Anna",
        rescueActive: 1,
        slaPercent: 95,
        status: "online",
        tenantId: "tenant-ladoga"
      }],
      queues: [{
        active: 1,
        channel: "VK",
        health: 90,
        limit: 10,
        overdue: 0,
        tenantId: "tenant-ladoga",
        waiting: 0
      }]
    }));
    const writer = RoutingRepository.prisma({ client });
    await writer.saveJob({
      action: "return_to_sla_queue",
      conversationId: "dialog-prisma-stale-rescue",
      id: "job_prisma_stale_rescue_apply",
      queue: "rescue-return",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "claimed"
    });
    const staleWorkerRepository = RoutingRepository.prisma({ client });
    await staleWorkerRepository.hydrateStateSnapshot();
    await writer.saveJob({
      ...((await writer.listJobs()).find((job) => job.id === "job_prisma_stale_rescue_apply")!),
      completedAt: "2026-06-29T13:16:15.000Z",
      status: "completed"
    });

    const applied = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      job: staleWorkerRepository.readState().jobs[0],
      routingRepository: staleWorkerRepository
    });

    const jobs = await writer.listJobs();
    assert.equal(applied.status, "skipped");
    assert.equal(applied.reason, "job_not_claimed");
    assert.equal(jobs.find((job) => job.id === "job_prisma_stale_rescue_apply")?.status, "completed");
    assert.equal(staleWorkerRepository.readState().conversations[0]?.status, "assigned");
    assert.deepEqual(staleWorkerRepository.readState().rescueReportRows, []);
  });

  it("applies SLA timer transitions through the Prisma routing repository transaction boundary", async () => {
    const { calls, client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-sla-direct",
        operatorId: "operator-anna",
        slaTone: "hold",
        status: "paused",
        tenantId: "tenant-ladoga"
      }]
    }));
    const repository = RoutingRepository.prisma({ client });
    await repository.saveJob({
      action: "resume_sla",
      conversationId: "dialog-prisma-sla-direct",
      id: "job_prisma_sla_direct",
      queue: "sla-timers",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "claimed",
      tenantId: "tenant-ladoga"
    });

    const applied = await repository.applySlaTimerTransition({
      action: "resume_sla",
      completedAt: "2026-06-29T13:16:30.000Z",
      conversationId: "dialog-prisma-sla-direct",
      jobId: "job_prisma_sla_direct",
      tenantId: "tenant-ladoga",
      toStatus: "active"
    });

    const [job] = await repository.listJobs();
    assert.equal(applied.status, "applied");
    assert.equal(job.status, "completed");
    assert.equal(job.completedAt, "2026-06-29T13:16:30.000Z");
    assert.equal(repository.readState().conversations[0]?.status, "active");
    assert.equal(repository.readState().conversations[0]?.slaTone, "ok");
    assert.equal(calls.routingTransactions, 1);
    assert.equal(calls.conversationLifecycleEventCreates.length, 1);
    assert.equal(calls.conversationLifecycleEventCreates[0]?.data.eventType, "sla.resumed");
    assert.equal(calls.conversationLifecycleEventCreates[0]?.data.tenantId, "tenant-ladoga");
  });

  it("skips Prisma SLA apply when the current job is bound to a different conversation", async () => {
    const { client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Current client",
        id: "dialog-prisma-sla-current",
        operatorId: "operator-anna",
        slaTone: "hold",
        status: "paused"
      }, {
        channel: "VK",
        client: "Stale client",
        id: "dialog-prisma-sla-stale",
        operatorId: "operator-anna",
        slaTone: "hold",
        status: "paused"
      }]
    }));
    const repository = RoutingRepository.prisma({ client });
    await repository.saveJob({
      action: "resume_sla",
      conversationId: "dialog-prisma-sla-current",
      id: "job_prisma_sla_conversation_mismatch",
      queue: "sla-timers",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "claimed"
    });

    const applied = await repository.applySlaTimerTransition({
      action: "resume_sla",
      completedAt: "2026-06-29T13:16:30.000Z",
      conversationId: "dialog-prisma-sla-stale",
      jobId: "job_prisma_sla_conversation_mismatch",
      toStatus: "active"
    });

    const [job] = await repository.listJobs();
    const state = await repository.hydrateStateSnapshot();
    assert.equal(applied.status, "skipped");
    assert.equal(applied.reason, "conversation_mismatch");
    assert.equal(job.status, "claimed");
    assert.equal(job.completedAt, undefined);
    assert.equal(state.conversations.find((conversation) => conversation.id === "dialog-prisma-sla-current")?.status, "paused");
    assert.equal(state.conversations.find((conversation) => conversation.id === "dialog-prisma-sla-stale")?.status, "paused");
  });

  it("appends one tenant-scoped overdue lifecycle event for a claimed SLA job", async () => {
    const { calls, client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "Telegram",
        client: "Overdue client",
        id: "dialog-prisma-sla-overdue",
        operatorId: "operator-anna",
        slaTone: "warn",
        status: "assigned",
        tenantId: "tenant-ladoga"
      }]
    }));
    const repository = RoutingRepository.prisma({ client });
    await repository.saveJob({
      action: "mark_sla_overdue",
      conversationId: "dialog-prisma-sla-overdue",
      id: "job_prisma_sla_overdue",
      queue: "sla-timers",
      status: "claimed",
      tenantId: "tenant-ladoga"
    });

    const input = {
      action: "mark_sla_overdue" as const,
      completedAt: "2026-06-29T13:16:30.000Z",
      conversationId: "dialog-prisma-sla-overdue",
      jobId: "job_prisma_sla_overdue",
      tenantId: "tenant-ladoga",
      toSlaTone: "danger" as const,
      toStatus: "assigned" as const
    };
    const applied = await repository.applySlaTimerTransition(input);
    const duplicate = await repository.applySlaTimerTransition(input);

    assert.equal(applied.status, "applied");
    assert.equal(duplicate.status, "skipped");
    assert.equal(calls.conversationLifecycleEventCreates.length, 1);
    assert.equal(calls.conversationLifecycleEventCreates[0]?.data.eventType, "sla.overdue");
    assert.equal(calls.conversationLifecycleEventCreates[0]?.data.sourceEventId, "job_prisma_sla_overdue:mark_sla_overdue");
  });

  it("applies rescue-return transitions through the Prisma routing repository transaction boundary", async () => {
    const { calls, client, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-rescue-direct",
        operatorId: "operator-anna",
        rescue: {
          durationSeconds: 240,
          reason: "Operator response risk",
          startedAt: "2026-06-29T13:00:00.000Z",
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-ladoga"
      }],
      operators: [{
        avgFirstResponseSeconds: 30,
        channels: ["VK"],
        chats: 1,
        id: "operator-anna",
        limit: 5,
        name: "Anna",
        rescueActive: 1,
        slaPercent: 95,
        status: "online",
        tenantId: "tenant-ladoga"
      }],
      queues: [{
        active: 1,
        channel: "VK",
        health: 90,
        limit: 10,
        overdue: 0,
        tenantId: "tenant-ladoga",
        waiting: 0
      }]
    }));
    const repository = RoutingRepository.prisma({ client });
    await repository.saveJob({
      action: "return_to_sla_queue",
      conversationId: "dialog-prisma-rescue-direct",
      id: "job_prisma_rescue_direct",
      queue: "rescue-return",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "claimed",
      tenantId: "tenant-ladoga"
    });

    const applied = await repository.applyRescueReturnTransition({
      completedAt: "2026-06-29T13:16:30.000Z",
      fallbackConversationId: "dialog-prisma-rescue-direct",
      jobId: "job_prisma_rescue_direct"
    });

    const [job] = await repository.listJobs();
    const [analyticsRow] = await repository.listRoutingAnalyticsRows({ eventKind: "auto_return", tenantId: "tenant-ladoga" });
    const state = repository.readState();
    assert.equal(applied.status, "applied");
    assert.equal(applied.analyticsDescriptor?.conversationId, "dialog-prisma-rescue-direct");
    assert.equal(job.status, "completed");
    assert.equal(state.conversations[0]?.status, "queued");
    assert.equal(state.conversations[0]?.operatorId, undefined);
    assert.equal(state.operators[0]?.chats, 0);
    assert.equal(state.queues[0]?.waiting, 1);
    assert.equal(state.rescueReportRows[0]?.outcome, "returned_to_queue");
    assert.equal(analyticsRow.conversationId, "dialog-prisma-rescue-direct");
    assert.equal(analyticsRow.tenantId, "tenant-ladoga");
    assert.equal((await repository.listRoutingAnalyticsRows({ eventKind: "auto_return", tenantId: "tenant-volga" })).length, 0);
    assert.equal(calls.routingTransactions, 1);
    assert.equal(calls.conversationLifecycleEventCreates.length, 1);
    assert.equal(calls.conversationLifecycleEventCreates[0]?.data.eventType, "rescue.auto_returned");
    const duplicate = await repository.applyRescueReturnTransition({
      completedAt: "2026-06-29T13:17:30.000Z",
      fallbackConversationId: "dialog-prisma-rescue-direct",
      jobId: "job_prisma_rescue_direct",
      tenantId: "tenant-ladoga"
    });
    assert.equal(duplicate.status, "skipped");
    assert.equal(calls.conversationLifecycleEventCreates.length, 1);
  });

  it("rolls back Prisma rescue-return apply side effects when the snapshot version conflicts", async () => {
    const { client, forceNextRoutingStateSnapshotConflict, seedRoutingStateSnapshot } = createFakePrismaRoutingClient();
    seedRoutingStateSnapshot(emptyRoutingState({
      conversations: [{
        channel: "VK",
        client: "Persisted client",
        id: "dialog-prisma-rescue-conflict",
        operatorId: "operator-anna",
        rescue: {
          durationSeconds: 240,
          reason: "Operator response risk",
          startedAt: "2026-06-29T13:00:00.000Z",
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-volga"
      }]
    }));
    const repository = RoutingRepository.prisma({ client });
    await repository.saveJob({
      action: "return_to_sla_queue",
      conversationId: "dialog-prisma-rescue-conflict",
      id: "job_prisma_rescue_conflict",
      queue: "rescue-return",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "claimed",
      tenantId: "tenant-volga"
    });
    forceNextRoutingStateSnapshotConflict();

    await assert.rejects(
      () => repository.applyRescueReturnTransition({
        completedAt: "2026-06-29T13:16:30.000Z",
        fallbackConversationId: "dialog-prisma-rescue-conflict",
        jobId: "job_prisma_rescue_conflict"
      }),
      /routing_state_snapshot_conflict/
    );

    const [job] = await repository.listJobs();
    const analyticsRows = await repository.listRoutingAnalyticsRows({ eventKind: "auto_return", tenantId: "tenant-volga" });
    assert.equal(job.status, "claimed");
    assert.equal(job.completedAt, undefined);
    assert.equal(analyticsRows.some((row) => row.id === "analytics_auto_return_job_prisma_rescue_conflict"), false);
    assert.deepEqual(repository.readState().rescueReportRows, []);
  });

  it("fails closed before Prisma natural unique key conflicts", async () => {
    const { client } = createFakePrismaRoutingClient();
    const repository = RoutingRepository.prisma({ client });

    await repository.saveRoutingRule({
      channel: "VK",
      enabled: true,
      id: "rule_prisma_vk_primary",
      limitMode: "operator_channel_limit",
      priorityStrategy: "least_loaded",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z",
      waitThresholdSeconds: 180
    });
    await assert.rejects(
      () => repository.saveRoutingRule({
        channel: "VK",
        enabled: true,
        id: "rule_prisma_vk_duplicate",
        limitMode: "queue_round_robin",
        priorityStrategy: "round_robin",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-29T12:01:00.000Z",
        waitThresholdSeconds: 120
      }),
      /routing_rule_natural_key_conflict/
    );

    await repository.saveQueueMembership({
      active: true,
      id: "membership_prisma_vk_anna_primary",
      operatorId: "operator-anna",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    await assert.rejects(
      () => repository.saveQueueMembership({
        active: true,
        id: "membership_prisma_vk_anna_duplicate",
        operatorId: "operator-anna",
        queueId: "VK",
        role: "backup",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-29T12:01:00.000Z"
      }),
      /queue_membership_natural_key_conflict/
    );

    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 12,
      id: "capacity_prisma_vk_anna_primary",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    await assert.rejects(
      () => repository.saveOperatorCapacity({
        channel: "VK",
        chatLimit: 10,
        id: "capacity_prisma_vk_anna_duplicate",
        operatorId: "operator-anna",
        overrideAllowed: true,
        tenantId: "tenant-volga",
        updatedAt: "2026-06-29T12:01:00.000Z"
      }),
      /operator_capacity_natural_key_conflict/
    );
  });

  it("bootstraps the default routing repository from a Prisma client factory", async () => {
    const { client } = createFakePrismaRoutingClient();
    const factoryCalls: unknown[] = [];

    const repository = configureRoutingRepository({
      DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
      NODE_ENV: "test",
      PORT: "4192",
      ROUTING_REPOSITORY: "prisma",
      SERVICE_NAME: "api-gateway"
    }, {
      prismaClientFactory: (options) => {
        factoryCalls.push(options);
        return client;
      }
    });

    assert.equal(RoutingRepository.default(), repository);
    assert.deepEqual(factoryCalls, [{
      datasourceUrl: "postgresql://support:support@127.0.0.1:5432/support_communication"
    }]);

    await RoutingRepository.default().saveRoutingRule({
      channel: "SDK",
      enabled: true,
      id: "rule_bootstrap",
      limitMode: "operator_channel_limit",
      priorityStrategy: "round_robin",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:15:00.000Z",
      waitThresholdSeconds: 120
    });
    const refetched = await RoutingRepository.default().findRoutingRule("rule_bootstrap", { tenantId: "tenant-volga" });
    assert.equal(refetched?.priorityStrategy, "round_robin");
  });
});

function createFakePrismaRoutingClient() {
  const conversationLifecycleEvents = new Map<string, Record<string, unknown>>();
  const routingRules = new Map<string, FakeRoutingRuleCreateInput>();
  const queueMemberships = new Map<string, FakeQueueMembershipCreateInput>();
  const operatorCapacities = new Map<string, FakeOperatorCapacityCreateInput>();
  const routingAnalyticsRows = new Map<string, FakeRoutingAnalyticsCreateInput>();
  const routingJobs = new Map<string, FakeRoutingJobCreateInput>();
  const routingStateSnapshots = new Map<string, FakeRoutingStateSnapshotCreateInput>();
  let forceSnapshotConflict = false;
  const calls = {
    conversationLifecycleEventCreates: [] as Array<{ data: Record<string, unknown> }>,
    operatorCapacityFindFirst: [] as Array<{ where: { channel?: string; operatorId?: string; tenantId?: string } }>,
    operatorCapacityFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    operatorCapacityFindUnique: [] as Array<{ where: { id: string } }>,
    operatorCapacityUpserts: [] as Array<{
      create: FakeOperatorCapacityCreateInput;
      update: Omit<FakeOperatorCapacityCreateInput, "id">;
      where: { id: string };
    }>,
    queueMembershipFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    queueMembershipFindUnique: [] as Array<{ where: { id: string } }>,
    queueMembershipUpserts: [] as Array<{
      create: FakeQueueMembershipCreateInput;
      update: Omit<FakeQueueMembershipCreateInput, "id">;
      where: { id: string };
    }>,
    routingRuleFindFirst: [] as Array<{ where: { channel?: string; enabled?: boolean; tenantId?: string } }>,
    routingRuleFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    routingRuleFindUnique: [] as Array<{ where: { id: string } }>,
    routingRuleUpserts: [] as Array<{
      create: FakeRoutingRuleCreateInput;
      update: Omit<FakeRoutingRuleCreateInput, "id">;
      where: { id: string };
    }>,
    routingAnalyticsRowFindMany: [] as Array<{ orderBy: { occurredAt: "desc" }; where?: Record<string, unknown> }>,
    routingAnalyticsRowUpserts: [] as Array<{
      create: FakeRoutingAnalyticsCreateInput;
      update: Omit<FakeRoutingAnalyticsCreateInput, "id">;
      where: { id: string };
    }>,
    routingJobFindMany: [] as Array<{ orderBy: { updatedAt: "desc" } }>,
    routingJobFindUnique: [] as Array<{ where: { id: string } }>,
    routingJobUpserts: [] as Array<{
      create: FakeRoutingJobCreateInput;
      update: Omit<FakeRoutingJobCreateInput, "id">;
      where: { id: string };
    }>,
    routingJobUpdateMany: [] as Array<{
      data: Omit<FakeRoutingJobCreateInput, "id">;
      where: { id: string; leaseExpiresAt?: Date | null; leaseOwner?: string | null; queue: string; status: string | null };
    }>,
    routingStateSnapshotCreate: [] as Array<{
      data: FakeRoutingStateSnapshotCreateInput;
    }>,
    routingStateSnapshotFindUnique: [] as Array<{ where: { id: string } }>,
    routingStateSnapshotUpdateMany: [] as Array<{
      data: Omit<FakeRoutingStateSnapshotCreateInput, "id">;
      where: { id: string; version: number };
    }>,
    routingTransactions: 0
  };

  const client = {
    async $transaction<T>(callback: (client: typeof client) => Promise<T>): Promise<T> {
      calls.routingTransactions += 1;
      const routingRulesBefore = new Map(routingRules);
      const conversationLifecycleEventsBefore = new Map(conversationLifecycleEvents);
      const queueMembershipsBefore = new Map(queueMemberships);
      const operatorCapacitiesBefore = new Map(operatorCapacities);
      const routingAnalyticsRowsBefore = new Map(routingAnalyticsRows);
      const routingJobsBefore = new Map(routingJobs);
      const routingStateSnapshotsBefore = new Map(routingStateSnapshots);
      try {
        return await callback(client);
      } catch (error) {
        conversationLifecycleEvents.clear();
        for (const [key, value] of conversationLifecycleEventsBefore) conversationLifecycleEvents.set(key, value);
        routingRules.clear();
        for (const [key, value] of routingRulesBefore) routingRules.set(key, value);
        queueMemberships.clear();
        for (const [key, value] of queueMembershipsBefore) queueMemberships.set(key, value);
        operatorCapacities.clear();
        for (const [key, value] of operatorCapacitiesBefore) operatorCapacities.set(key, value);
        routingAnalyticsRows.clear();
        for (const [key, value] of routingAnalyticsRowsBefore) routingAnalyticsRows.set(key, value);
        routingJobs.clear();
        for (const [key, value] of routingJobsBefore) routingJobs.set(key, value);
        routingStateSnapshots.clear();
        for (const [key, value] of routingStateSnapshotsBefore) routingStateSnapshots.set(key, value);
        throw error;
      }
    },
    conversationLifecycleEvent: {
      create(input: { data: Record<string, unknown> }) {
        calls.conversationLifecycleEventCreates.push(input);
        const key = `${input.data.tenantId}:${input.data.source}:${input.data.sourceEventId}`;
        if (conversationLifecycleEvents.has(key)) {
          return Promise.reject(new Error("conversation_lifecycle_events_source_key"));
        }
        conversationLifecycleEvents.set(key, input.data);
        return Promise.resolve(input.data);
      }
    },
    operatorCapacity: {
      findFirst(input: { where: { channel?: string; operatorId?: string; tenantId?: string } }) {
        calls.operatorCapacityFindFirst.push(input);
        return Promise.resolve(Array.from(operatorCapacities.values()).find((row) =>
          row.tenantId === input.where.tenantId
          && row.operatorId === input.where.operatorId
          && row.channel === input.where.channel
        ) ?? null);
      },
      findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
        calls.operatorCapacityFindMany.push(input);
        return Promise.resolve(Array.from(operatorCapacities.values())
          .filter((row) => matchesWhere(row, input.where))
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
      },
      findUnique(input: { where: { id: string } }) {
        calls.operatorCapacityFindUnique.push(input);
        return Promise.resolve(operatorCapacities.get(input.where.id) ?? null);
      },
      upsert(input: {
        create: FakeOperatorCapacityCreateInput;
        update: Omit<FakeOperatorCapacityCreateInput, "id">;
        where: { id: string };
      }) {
        calls.operatorCapacityUpserts.push(input);
        const next = {
          ...(operatorCapacities.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update
        };
        operatorCapacities.set(input.where.id, next);
        return Promise.resolve(next);
      }
    },
    queueMembership: {
      findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
        calls.queueMembershipFindMany.push(input);
        return Promise.resolve(Array.from(queueMemberships.values())
          .filter((row) => matchesWhere(row, input.where))
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
      },
      findUnique(input: { where: { id: string } }) {
        calls.queueMembershipFindUnique.push(input);
        return Promise.resolve(queueMemberships.get(input.where.id) ?? null);
      },
      upsert(input: {
        create: FakeQueueMembershipCreateInput;
        update: Omit<FakeQueueMembershipCreateInput, "id">;
        where: { id: string };
      }) {
        calls.queueMembershipUpserts.push(input);
        const next = {
          ...(queueMemberships.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update
        };
        queueMemberships.set(input.where.id, next);
        return Promise.resolve(next);
      }
    },
    routingRule: {
      findFirst(input: { where: { channel?: string; enabled?: boolean; tenantId?: string } }) {
        calls.routingRuleFindFirst.push(input);
        return Promise.resolve(Array.from(routingRules.values()).find((row) => matchesWhere(row, input.where)) ?? null);
      },
      findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
        calls.routingRuleFindMany.push(input);
        return Promise.resolve(Array.from(routingRules.values())
          .filter((row) => matchesWhere(row, input.where))
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
      },
      findUnique(input: { where: { id: string } }) {
        calls.routingRuleFindUnique.push(input);
        return Promise.resolve(routingRules.get(input.where.id) ?? null);
      },
      upsert(input: {
        create: FakeRoutingRuleCreateInput;
        update: Omit<FakeRoutingRuleCreateInput, "id">;
        where: { id: string };
      }) {
        calls.routingRuleUpserts.push(input);
        const next = {
          ...(routingRules.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update
        };
        routingRules.set(input.where.id, next);
        return Promise.resolve(next);
      }
    },
    routingAnalyticsRow: {
      findMany(input: { orderBy: { occurredAt: "desc" }; where?: Record<string, unknown> }) {
        calls.routingAnalyticsRowFindMany.push(input);
        return Promise.resolve(Array.from(routingAnalyticsRows.values())
          .filter((row) => matchesWhere(row, input.where))
          .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()));
      },
      upsert(input: {
        create: FakeRoutingAnalyticsCreateInput;
        update: Omit<FakeRoutingAnalyticsCreateInput, "id">;
        where: { id: string };
      }) {
        calls.routingAnalyticsRowUpserts.push(input);
        const next = {
          ...(routingAnalyticsRows.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update
        };
        routingAnalyticsRows.set(input.where.id, next);
        return Promise.resolve(next);
      }
    },
    routingJob: {
      findUnique(input: { where: { id: string } }) {
        calls.routingJobFindUnique.push(input);
        return Promise.resolve(routingJobs.get(input.where.id) ?? null);
      },
      findMany(input: { orderBy: { updatedAt: "desc" } }) {
        calls.routingJobFindMany.push(input);
        return Promise.resolve(Array.from(routingJobs.values())
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
      },
      upsert(input: {
        create: FakeRoutingJobCreateInput;
        update: Omit<FakeRoutingJobCreateInput, "id">;
        where: { id: string };
      }) {
        calls.routingJobUpserts.push(input);
        const now = new Date("2026-06-29T12:30:00.000Z");
        const next = {
          ...(routingJobs.get(input.where.id) ?? { createdAt: now, updatedAt: now }),
          ...input.create,
          ...input.update,
          id: input.where.id,
          runAt: normalizeFakeJsonRunAt(input.update.runAt ?? input.create.runAt),
          updatedAt: now
        };
        routingJobs.set(input.where.id, next);
        return Promise.resolve(next);
      },
      updateMany(input: {
        data: Omit<FakeRoutingJobCreateInput, "id">;
        where: { id: string; leaseExpiresAt?: Date | null; leaseOwner?: string | null; queue: string; status: string | null };
      }) {
        calls.routingJobUpdateMany.push(input);
        const current = routingJobs.get(input.where.id);
        if (!current
          || current.queue !== input.where.queue
          || (current.status ?? null) !== input.where.status
          || (input.where.leaseOwner !== undefined && (current.leaseOwner ?? null) !== input.where.leaseOwner)
          || (input.where.leaseExpiresAt !== undefined && !sameNullableDate(current.leaseExpiresAt, input.where.leaseExpiresAt))) {
          return Promise.resolve({ count: 0 });
        }
        routingJobs.set(input.where.id, {
          ...current,
          ...input.data,
          id: input.where.id,
          runAt: normalizeFakeJsonRunAt(input.data.runAt),
          updatedAt: new Date("2026-06-29T12:31:00.000Z")
        });
        return Promise.resolve({ count: 1 });
      }
    },
    routingStateSnapshot: {
      create(input: { data: FakeRoutingStateSnapshotCreateInput }) {
        calls.routingStateSnapshotCreate.push(input);
        const now = new Date("2026-06-29T12:35:00.000Z");
        const next = {
          createdAt: now,
          updatedAt: now,
          ...input.data
        };
        routingStateSnapshots.set(input.data.id, next);
        return Promise.resolve(next);
      },
      findUnique(input: { where: { id: string } }) {
        calls.routingStateSnapshotFindUnique.push(input);
        return Promise.resolve(routingStateSnapshots.get(input.where.id) ?? null);
      },
      updateMany(input: {
        data: Omit<FakeRoutingStateSnapshotCreateInput, "id">;
        where: { id: string; version: number };
      }) {
        calls.routingStateSnapshotUpdateMany.push(input);
        if (forceSnapshotConflict) {
          forceSnapshotConflict = false;
          return Promise.resolve({ count: 0 });
        }
        const now = new Date("2026-06-29T12:35:00.000Z");
        const current = routingStateSnapshots.get(input.where.id);
        if (!current || current.version !== input.where.version) {
          return Promise.resolve({ count: 0 });
        }
        routingStateSnapshots.set(input.where.id, {
          ...current,
          ...input.data,
          updatedAt: now
        });
        return Promise.resolve({ count: 1 });
      }
    }
  };

  return {
    calls,
    client,
    forceNextRoutingStateSnapshotConflict() {
      forceSnapshotConflict = true;
    },
    seedRoutingStateSnapshot(state: RoutingState) {
      routingStateSnapshots.set("default", {
        conversations: state.conversations,
        id: "default",
        operators: state.operators,
        queues: state.queues,
        rescueReportRows: state.rescueReportRows,
        version: 1,
        updatedAt: new Date("2026-06-29T12:34:00.000Z")
      });
    }
  };
}

function emptyRoutingState(overrides: Partial<RoutingState> = {}): RoutingState {
  return {
    conversations: [],
    jobs: [],
    operatorCapacities: [],
    operators: [],
    queueMemberships: [],
    queues: [],
    rescueReportRows: [],
    routingAnalyticsRows: [],
    routingRules: [],
    ...overrides
  };
}

function normalizeFakeJsonRunAt(value: FakeRoutingJobCreateInput["runAt"]): number | string | null {
  return value === Prisma.DbNull ? null : value;
}

interface FakeRoutingRuleCreateInput {
  channel: string;
  enabled: boolean;
  id: string;
  limitMode: string;
  priorityStrategy: string;
  tenantId: string;
  updatedAt: Date;
  waitThresholdSeconds: number;
}

interface FakeQueueMembershipCreateInput {
  active: boolean;
  id: string;
  operatorId: string;
  queueId: string;
  role: string;
  tenantId: string;
  updatedAt: Date;
}

interface FakeOperatorCapacityCreateInput {
  channel: string;
  chatLimit: number;
  id: string;
  operatorId: string;
  overrideAllowed: boolean;
  tenantId: string;
  updatedAt: Date;
}

interface FakeRoutingAnalyticsCreateInput {
  channel: string;
  conversationId: string;
  eventKind: string;
  fromOperatorId: string | null;
  id: string;
  occurredAt: Date;
  source: string;
  tenantId: string;
  toOperatorId: string | null;
}

interface FakeRoutingJobCreateInput {
  action: string | null;
  claimedAt: Date | null;
  conversationId: string | null;
  createdAt?: Date;
  id: string;
  kind: string | null;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  payload: RoutingJobDescriptor;
  queue: string;
  redistributionId: string | null;
  runAt: number | string | typeof Prisma.DbNull | null;
  status: string | null;
  updatedAt?: Date;
}

function sameNullableDate(left: Date | null | undefined, right: Date | null): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }
  return left.getTime() === right.getTime();
}

interface FakeRoutingStateSnapshotCreateInput {
  conversations: RoutingState["conversations"];
  createdAt?: Date;
  id: string;
  operators: RoutingState["operators"];
  queues: RoutingState["queues"];
  rescueReportRows: RoutingState["rescueReportRows"];
  updatedAt?: Date;
  version: number;
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => row[key] === value);
}
