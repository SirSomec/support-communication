import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  rescueReportSeedRows,
  routingConversationFixtures,
  routingOperatorFixtures,
  routingQueueFixtures
} from "../apps/api-gateway/src/routing/seed-catalog.ts";
import { bootstrapRoutingState } from "../apps/api-gateway/src/routing/seed.ts";
import { RoutingRepository, type RoutingLifecycleEvent } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { RoutingService } from "../apps/api-gateway/src/routing/routing.service.ts";

const VOLGA_CONTEXT = { tenantId: "tenant-volga" };

function cloneWithVolgaTenant<T extends { tenantId?: string }>(records: T[]): T[] {
  return JSON.parse(JSON.stringify(records)).map((record: T) => ({
    ...record,
    tenantId: record.tenantId ?? VOLGA_CONTEXT.tenantId
  }));
}

describe("phase 4 routing, SLA and rescue backend contracts", () => {
  beforeEach(() => {
    RoutingRepository.useDefault(RoutingRepository.inMemory(bootstrapRoutingState()));
  });

  afterEach(() => {
    RoutingRepository.clearDefault();
  });

  it("requires explicit tenant context for tenant-scoped routing service operations", async () => {
    const cases: Array<[string, () => Promise<Record<string, unknown>>]> = [
      ["fetchWorkload", () => new RoutingService().fetchWorkload({ channel: "VK" })],
      ["createAssignment", () => new RoutingService().createAssignment({
        action: "assign",
        conversationId: "alexey",
        reason: "Tenant context gate",
        targetOperatorId: "operator-anna"
      })],
      ["simulateAssignment", () => new RoutingService().simulateAssignment({ conversationId: "alexey" })],
      ["previewRedistribution", () => new RoutingService().previewRedistribution({
        idempotencyKey: "tenant_context_preview",
        reason: "Tenant context gate",
        selectedQueues: ["VK"],
        targetRule: "least_loaded"
      })],
      ["commitRedistribution", () => new RoutingService().commitRedistribution({
        idempotencyKey: "tenant_context_commit",
        reason: "Tenant context gate",
        selectedQueues: ["VK"],
        targetRule: "least_loaded"
      })],
      ["pauseSla", () => new RoutingService().pauseSla({
        conversationId: "alexey",
        reason: "Tenant context gate"
      })],
      ["startRescue", () => new RoutingService().startRescue({
        conversationId: "vladimir",
        reason: "Tenant context gate"
      })],
      ["resolveRescue", () => new RoutingService().resolveRescue({
        conversationId: "vladimir",
        outcome: "saved",
        reason: "Tenant context gate"
      })],
      ["fetchRescueReport", () => new RoutingService().fetchRescueReport({ period: "today" })]
    ];

    for (const [operation, callOperation] of cases) {
      const envelope = await callOperation();
      assert.equal(envelope.operation, operation);
      assert.equal(envelope.status, "invalid");
      assert.equal(envelope.error?.code, "tenant_context_required");
    }
  });

  it("derives routing tenant context from tenant operator and service-admin requests", () => {
    const controllerSource = readFileSync(new URL("../apps/api-gateway/src/routing/routing.controller.ts", import.meta.url), "utf8");

    assert.match(controllerSource, /request\.tenantOperatorContext\?\.tenantId/);
    assert.match(controllerSource, /request\.serviceAdminContext\?\.currentTenantId/);
  });

  it("lists operator workload and queue health with frontend-compatible fields", async () => {
    const routing = new RoutingService();

    const workload = await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);

    assert.equal(workload.service, "routingService");
    assert.equal(workload.status, "ok");
    assert.equal(workload.partial, true);
    assert.equal(workload.meta.source, "api");
    assert.equal(workload.data.routingPolicy.limitMode, "operator_channel_limit");
    assert.equal(workload.data.routingPolicy.waitThresholdSeconds, 180);
    assert.ok(workload.data.operators.length > 0);
    assert.ok(workload.data.operators.every((operator) => operator.channels.includes("VK")));
    assert.ok(workload.data.operators.every((operator) => typeof operator.availableCapacity === "number"));
    assert.ok(workload.data.operators.every((operator) => typeof operator.avg === "string"));
    assert.ok(workload.data.operators.every((operator) => typeof operator.sla === "number"));
    assert.deepEqual(workload.data.queues.map((queue) => queue.channel), ["VK"]);
    assert.deepEqual(workload.data.queues.map((queue) => queue.name), ["VK"]);
    assert.equal(typeof workload.data.totals.activeChats, "number");
    assert.equal(typeof workload.data.totals.overdueChats, "number");
  });

  it("keeps workload reads side-effect free in durable routing repositories", async () => {
    const repository = RoutingRepository.inMemory();
    const routing = new RoutingService(repository);

    await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);
    await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);

    assert.deepEqual(repository.listJobs(), []);
  });

  it("exposes tenant-scoped routing analytics aggregates in workload reads", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics_workload_assignment",
      occurredAt: "2026-06-29T14:00:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "rescue",
      fromOperatorId: null,
      id: "analytics_workload_rescue",
      occurredAt: "2026-06-29T14:01:00.000Z",
      source: "manual",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });
    await repository.saveRoutingAnalyticsRow({
      channel: "VK",
      conversationId: "alexey",
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics_workload_other_channel",
      occurredAt: "2026-06-29T14:02:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-anna"
    });
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "foreign",
      eventKind: "auto_return",
      fromOperatorId: "operator-kirill",
      id: "analytics_workload_foreign_tenant",
      occurredAt: "2026-06-29T14:03:00.000Z",
      source: "rescue-return-worker",
      tenantId: "tenant-ladoga",
      toOperatorId: null
    });
    const routing = new RoutingService(repository);

    const workload = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);

    assert.deepEqual(workload.data.routingAnalytics, {
      byEventKind: {
        assignment: 1,
        auto_return: 0,
        rescue: 1,
        transfer: 0
      },
      channel: "Telegram",
      tenantId: "tenant-volga",
      totalEvents: 2
    });
  });

  it("uses persisted routing rules and operator capacities for workload and assignment limits", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveRoutingRule({
      channel: "VK",
      enabled: true,
      id: "rule_vk_runtime",
      limitMode: "queue_round_robin",
      priorityStrategy: "round_robin",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z",
      waitThresholdSeconds: 45
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 0,
      id: "capacity_vk_anna_runtime",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    const routing = new RoutingService(repository);

    const workload = await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);
    const anna = workload.data.operators.find((operator) => operator.id === "operator-anna");
    assert.equal(workload.data.routingPolicy.limitMode, "queue_round_robin");
    assert.equal(workload.data.routingPolicy.priorityStrategy, "round_robin");
    assert.equal(workload.data.routingPolicy.waitThresholdSeconds, 45);
    assert.equal(anna.limit, 0);
    assert.equal(anna.availableCapacity, 0);
    assert.equal(anna.canReceive, false);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Persisted capacity gate",
      targetOperatorId: "operator-anna"
    }, VOLGA_CONTEXT);
    assert.equal(assignment.status, "denied");
    assert.equal(assignment.error?.code, "operator_limit_exceeded");
    assert.equal(assignment.data.limit, 0);
  });

  it("uses active queue memberships as channel access grants", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveQueueMembership({
      active: true,
      id: "membership_vk_ivan_runtime",
      operatorId: "operator-ivan",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    const routing = new RoutingService(repository);

    const workload = await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);
    const ivan = workload.data.operators.find((operator) => operator.id === "operator-ivan");
    assert.ok(ivan);
    assert.ok(ivan.channels.includes("VK"));
    assert.equal(ivan.canReceive, true);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Persisted queue membership",
      targetOperatorId: "operator-ivan"
    }, VOLGA_CONTEXT);
    assert.equal(assignment.status, "ok");
    assert.equal(assignment.data.assignment.targetOperatorId, "operator-ivan");
  });

  it("simulates assignment candidates with validated workload, access and capacity inputs", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveQueueMembership({
      active: true,
      id: "membership_vk_ivan_simulation",
      operatorId: "operator-ivan",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:30:00.000Z"
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 4,
      id: "capacity_vk_ivan_simulation",
      operatorId: "operator-ivan",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:30:00.000Z"
    });
    const routing = new RoutingService(repository);

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    assert.equal(simulation.operation, "simulateAssignment");
    assert.equal(simulation.data.conversationId, "alexey");
    assert.equal(simulation.data.channel, "VK");
    assert.equal(simulation.data.candidateInputsValidated, true);
    const candidates = simulation.data.candidates as Array<Record<string, unknown>>;
    const ivan = candidates.find((candidate) => candidate.operatorId === "operator-ivan");
    const full = candidates.find((candidate) => candidate.operatorId === "operator-full");
    assert.ok(ivan);
    assert.equal(ivan.channelAccess, true);
    assert.equal(ivan.chatLimit, 4);
    assert.equal(ivan.availableCapacity, 0);
    assert.equal(ivan.status, "online");
    assert.ok(full);
    assert.equal(full.channelAccess, false);
    assert.equal(full.availableCapacity, 0);
  });

  it("simulates assignment candidates with explainable ranking decisions", async () => {
    const routing = new RoutingService();

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    assert.equal(simulation.data.rankingStrategy, "least_loaded");
    const candidates = simulation.data.candidates as Array<Record<string, unknown>>;
    const anna = candidates.find((candidate) => candidate.operatorId === "operator-anna");
    const full = candidates.find((candidate) => candidate.operatorId === "operator-full");
    assert.ok(anna);
    assert.ok(full);
    assert.equal(anna.recommendation, "eligible");
    assert.ok(Array.isArray(anna.explain));
    assert.ok((anna.explain as string[]).includes("channel_access:granted"));
    assert.ok((anna.explain as string[]).includes("status:online"));
    assert.ok((anna.explain as string[]).includes("capacity:available"));
    assert.equal(full.recommendation, "blocked");
    assert.ok((full.explain as string[]).includes("capacity:full"));
  });

  it("ranks assignment candidates by eligible least-loaded workload first", async () => {
    const routing = new RoutingService();

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    const candidates = simulation.data.candidates as Array<Record<string, unknown>>;
    assert.equal(candidates[0].operatorId, "operator-anna");
    assert.equal(candidates[0].recommendation, "eligible");
    assert.equal(candidates[0].loadRatio, 0.83);
    const firstBlockedIndex = candidates.findIndex((candidate) => candidate.recommendation === "blocked");
    assert.ok(firstBlockedIndex > 0);
    assert.ok(candidates.slice(0, firstBlockedIndex).every((candidate) => candidate.recommendation === "eligible"));
    assert.ok(candidates.slice(firstBlockedIndex).every((candidate) => candidate.recommendation === "blocked"));
  });

  it("ranks blocked assignment candidates with channel access before access-denied candidates", async () => {
    const routing = new RoutingService();

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    const candidates = simulation.data.candidates as Array<Record<string, unknown>>;
    const fullIndex = candidates.findIndex((candidate) => candidate.operatorId === "operator-full");
    const ivanIndex = candidates.findIndex((candidate) => candidate.operatorId === "operator-ivan");
    assert.ok(fullIndex >= 0);
    assert.ok(ivanIndex >= 0);
    assert.equal(candidates[fullIndex].channelAccess, true);
    assert.equal(candidates[ivanIndex].channelAccess, false);
    assert.ok(fullIndex < ivanIndex);
  });

  it("ranks assignment candidates with primary queue membership before backup membership", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveQueueMembership({
      active: true,
      id: "membership_vk_ivan_ranking",
      operatorId: "operator-ivan",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:45:00.000Z"
    });
    await repository.saveQueueMembership({
      active: true,
      id: "membership_vk_anna_ranking",
      operatorId: "operator-anna",
      queueId: "VK",
      role: "backup",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:45:00.000Z"
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 8,
      id: "capacity_vk_ivan_ranking",
      operatorId: "operator-ivan",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:45:00.000Z"
    });
    const routing = new RoutingService(repository);

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    const candidates = simulation.data.candidates as Array<Record<string, unknown>>;
    assert.equal(candidates[0].operatorId, "operator-ivan");
    assert.equal(candidates[0].queueMembership, true);
    assert.equal(candidates[0].queueMembershipRole, "primary");
    assert.equal(candidates[0].loadRatio, 0.88);
    assert.equal(candidates[1].operatorId, "operator-anna");
    assert.equal(candidates[1].queueMembership, true);
    assert.equal(candidates[1].queueMembershipRole, "backup");
    assert.equal(candidates[1].loadRatio, 0.83);
  });

  it("ranks assignment candidates with equal load by greater available chat capacity", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveQueueMembership({
      active: true,
      id: "membership_vk_ivan_capacity_ranking",
      operatorId: "operator-ivan",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:00:00.000Z"
    });
    await repository.saveQueueMembership({
      active: true,
      id: "membership_vk_elena_capacity_ranking",
      operatorId: "operator-elena",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:00:00.000Z"
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 14,
      id: "capacity_vk_ivan_capacity_ranking",
      operatorId: "operator-ivan",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:00:00.000Z"
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 10,
      id: "capacity_vk_elena_capacity_ranking",
      operatorId: "operator-elena",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:00:00.000Z"
    });
    const routing = new RoutingService(repository);

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    const candidates = simulation.data.candidates as Array<Record<string, unknown>>;
    assert.equal(candidates[0].operatorId, "operator-ivan");
    assert.equal(candidates[0].loadRatio, 0.5);
    assert.equal(candidates[0].availableCapacity, 7);
    assert.equal(candidates[1].operatorId, "operator-elena");
    assert.equal(candidates[1].loadRatio, 0.5);
    assert.equal(candidates[1].availableCapacity, 5);
  });

  it("exposes assignment simulation through the routing controller route", async () => {
    const routing = new RoutingService();
    const controllerSource = readFileSync(new URL("../apps/api-gateway/src/routing/routing.controller.ts", import.meta.url), "utf8");

    assert.match(controllerSource, /@Post\("assignments\/simulate"\)[\s\S]*simulateAssignment\(@Body\(\) payload:/);
    assert.match(controllerSource, /return this\.routingService\.simulateAssignment\(payload, routingContextFromRequest\(request\)\);/);

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);

    assert.equal(simulation.status, "ok");
    assert.equal(simulation.operation, "simulateAssignment");
    assert.equal(simulation.data.conversationId, "alexey");
    assert.ok(Array.isArray(simulation.data.candidates));
  });

  it("keeps assignment simulation from mutating live assignment state or queue jobs", async () => {
    const repository = RoutingRepository.inMemory({
      conversations: cloneWithVolgaTenant(routingConversationFixtures),
      jobs: [],
      operatorCapacities: [],
      operators: cloneWithVolgaTenant(routingOperatorFixtures),
      queueMemberships: [],
      queues: cloneWithVolgaTenant(routingQueueFixtures),
      rescueReportRows: cloneWithVolgaTenant(rescueReportSeedRows),
      routingRules: []
    });
    const routing = new RoutingService(repository);
    const before = repository.readState();

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" }, VOLGA_CONTEXT);
    const after = repository.readState();

    assert.equal(simulation.status, "ok");
    assert.deepEqual(after, before);
    assert.deepEqual(repository.listJobs(), []);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Simulation did not mutate state",
      targetOperatorId: "operator-anna"
    }, VOLGA_CONTEXT);
    assert.equal(assignment.status, "ok");
    assert.equal(assignment.data.assignment.targetOperatorId, "operator-anna");
    assert.equal(assignment.data.conversation.status, "assigned");
  });

  it("previews batch redistribution without mutating live routing state", async () => {
    const repository = RoutingRepository.inMemory({
      conversations: cloneWithVolgaTenant(routingConversationFixtures),
      jobs: [],
      operatorCapacities: [],
      operators: cloneWithVolgaTenant(routingOperatorFixtures),
      queueMemberships: [],
      queues: cloneWithVolgaTenant(routingQueueFixtures),
      rescueReportRows: cloneWithVolgaTenant(rescueReportSeedRows),
      routingRules: []
    });
    const routing = new RoutingService(repository);
    const before = repository.readState();

    const preview = await routing.previewRedistribution({
      idempotencyKey: "preview-vk-redistribution",
      reason: "Preview SLA risk redistribution",
      selectedQueues: ["VK"],
      targetRule: "least_loaded"
    }, VOLGA_CONTEXT);
    const after = repository.readState();

    assert.equal(preview.status, "ok");
    assert.equal(preview.operation, "previewRedistribution");
    assert.equal(preview.data.mode, "preview");
    assert.equal(preview.data.redistributionId, "routing_redist_preview-vk-redistribution");
    assert.equal(preview.data.plan.length, 1);
    assert.equal(preview.data.plan[0].conversationId, "alexey");
    assert.equal(preview.data.plan[0].targetOperatorId, "operator-anna");
    assert.equal(preview.data.capacityConflicts.length, 0);
    assert.deepEqual(after, before);
    assert.deepEqual(repository.listJobs(), []);
  });

  it("commits batch redistribution atomically with audit, job and analytics evidence", async () => {
    const repository = RoutingRepository.inMemory({
      conversations: cloneWithVolgaTenant(routingConversationFixtures),
      jobs: [],
      operatorCapacities: [],
      operators: cloneWithVolgaTenant(routingOperatorFixtures),
      queueMemberships: [],
      queues: cloneWithVolgaTenant(routingQueueFixtures),
      rescueReportRows: cloneWithVolgaTenant(rescueReportSeedRows),
      routingRules: []
    });
    const routing = new RoutingService(repository);

    const commit = await routing.commitRedistribution({
      idempotencyKey: "commit-vk-redistribution",
      reason: "Commit SLA risk redistribution",
      selectedQueues: ["VK"],
      targetRule: "least_loaded"
    }, VOLGA_CONTEXT);

    assert.equal(commit.status, "ok");
    assert.equal(commit.operation, "commitRedistribution");
    assert.equal(commit.data.mode, "commit");
    assert.equal(commit.data.redistributionId, "routing_redist_commit-vk-redistribution");
    assert.equal(commit.data.auditEvent.immutable, true);
    assert.equal(commit.data.queueJob.kind, "redistribution.commit");
    assert.equal(commit.data.appliedAssignments.length, 1);
    assert.equal(commit.data.appliedAssignments[0].conversationId, "alexey");
    assert.equal(commit.data.appliedAssignments[0].targetOperatorId, "operator-anna");
    assert.equal(commit.data.realtimeEvent.eventName, "routing.redistribution.committed");

    const after = repository.readState();
    const alexey = after.conversations.find((conversation) => conversation.id === "alexey");
    const anna = after.operators.find((operator) => operator.id === "operator-anna");
    const vkQueue = after.queues.find((queue) => queue.channel === "VK");
    assert.equal(alexey?.operatorId, "operator-anna");
    assert.equal(alexey?.status, "assigned");
    assert.equal(anna?.chats, 11);
    assert.equal(vkQueue?.waiting, 8);
    assert.equal(vkQueue?.active, 26);
    assert.equal(repository.listJobs().length, 1);
    assert.equal(repository.listRoutingAnalyticsRows({ eventKind: "assignment", tenantId: "tenant-volga" }).length, 1);
  });

  it("treats repeated batch redistribution commits with the same idempotency key as already committed", async () => {
    const repository = RoutingRepository.inMemory({
      conversations: cloneWithVolgaTenant(routingConversationFixtures),
      jobs: [],
      operatorCapacities: [],
      operators: cloneWithVolgaTenant(routingOperatorFixtures),
      queueMemberships: [],
      queues: cloneWithVolgaTenant(routingQueueFixtures),
      rescueReportRows: cloneWithVolgaTenant(rescueReportSeedRows),
      routingRules: []
    });
    const routing = new RoutingService(repository);
    const request = {
      idempotencyKey: "idempotent-vk-redistribution",
      reason: "Commit SLA risk redistribution once",
      selectedQueues: ["VK"],
      targetRule: "least_loaded"
    };

    const first = await routing.commitRedistribution(request, VOLGA_CONTEXT);
    const afterFirst = repository.readState();
    const second = await routing.commitRedistribution(request, VOLGA_CONTEXT);

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(second.data.idempotent, true);
    assert.deepEqual(repository.readState(), afterFirst);
    assert.equal(repository.listJobs().length, 1);
    assert.equal(repository.listRoutingAnalyticsRows({ eventKind: "assignment", tenantId: "tenant-volga" }).length, 1);
  });

  it("rejects batch redistribution when any selected queue has no eligible capacity", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 10,
      id: "capacity_vk_anna_no_redist",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:10:00.000Z"
    });
    const routing = new RoutingService(repository);
    const before = repository.readState();

    const commit = await routing.commitRedistribution({
      idempotencyKey: "conflict-vk-redistribution",
      reason: "Commit blocked SLA risk redistribution",
      selectedQueues: ["VK"],
      targetRule: "least_loaded"
    }, VOLGA_CONTEXT);

    assert.equal(commit.status, "conflict");
    assert.equal(commit.error?.code, "redistribution_capacity_conflict");
    assert.equal(commit.data.capacityConflicts.length, 1);
    assert.equal(commit.data.capacityConflicts[0].conversationId, "alexey");
    assert.deepEqual(repository.readState(), before);
    assert.deepEqual(repository.listJobs(), []);
  });

  it("writes assignment routing analytics rows when assigning a conversation", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    const routing = new RoutingService(repository);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Analytics assignment runtime",
      targetOperatorId: "operator-anna"
    }, VOLGA_CONTEXT);
    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "assignment",
      tenantId: "tenant-volga"
    });

    assert.equal(assignment.status, "ok");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conversationId, "alexey");
    assert.equal(rows[0].channel, "VK");
    assert.equal(rows[0].eventKind, "assignment");
    assert.equal(rows[0].fromOperatorId, null);
    assert.equal(rows[0].toOperatorId, "operator-anna");
    assert.equal(rows[0].source, "api");
  });

  it("writes transfer routing analytics rows when transferring a conversation", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    const routing = new RoutingService(repository);

    const transfer = await routing.createAssignment({
      action: "transfer",
      conversationId: "vladimir",
      reason: "Analytics transfer runtime",
      targetOperatorId: "operator-ivan"
    }, VOLGA_CONTEXT);
    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "transfer",
      tenantId: "tenant-volga"
    });

    assert.equal(transfer.status, "ok");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conversationId, "vladimir");
    assert.equal(rows[0].channel, "Telegram");
    assert.equal(rows[0].eventKind, "transfer");
    assert.equal(rows[0].fromOperatorId, "operator-kirill");
    assert.equal(rows[0].toOperatorId, "operator-ivan");
    assert.equal(rows[0].source, "api");
  });

  it("writes rescue routing analytics rows when starting rescue", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    const routing = new RoutingService(repository);

    const rescue = await routing.startRescue({
      conversationId: "vladimir",
      reason: "Analytics rescue runtime",
      source: "manual"
    }, VOLGA_CONTEXT);
    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "rescue",
      tenantId: "tenant-volga"
    });

    assert.equal(rescue.status, "ok");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conversationId, "vladimir");
    assert.equal(rows[0].channel, "Telegram");
    assert.equal(rows[0].eventKind, "rescue");
    assert.equal(rows[0].fromOperatorId, null);
    assert.equal(rows[0].toOperatorId, "operator-kirill");
    assert.equal(rows[0].source, "manual");
  });

  it("enforces operator channel access and chat limits for assignments", async () => {
    const routing = new RoutingService();

    const channelDenied = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Senior redistribution",
      targetOperatorId: "operator-ivan"
    }, VOLGA_CONTEXT);
    assert.equal(channelDenied.status, "denied");
    assert.equal(channelDenied.error?.code, "operator_channel_denied");
    assert.equal(channelDenied.data.guard, "operator_channel_limit");
    assert.equal(channelDenied.data.conversationChannel, "VK");
    assert.equal(channelDenied.data.operatorId, "operator-ivan");

    const limitDenied = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Senior redistribution",
      targetOperatorId: "operator-full"
    }, VOLGA_CONTEXT);
    assert.equal(limitDenied.status, "denied");
    assert.equal(limitDenied.error?.code, "operator_limit_exceeded");
    assert.equal(limitDenied.data.availableCapacity, 0);

    const clientOverrideDenied = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      overrideLimit: true,
      reason: "Senior redistribution",
      targetOperatorId: "operator-full"
    }, VOLGA_CONTEXT);
    assert.equal(clientOverrideDenied.status, "denied");
    assert.equal(clientOverrideDenied.error?.code, "operator_limit_exceeded");
    assert.equal(clientOverrideDenied.data.overrideRequested, true);
    assert.equal(clientOverrideDenied.data.overrideSupported, false);

    const unsupportedAction = await routing.createAssignment({
      action: "rotate",
      conversationId: "alexey",
      reason: "Senior redistribution",
      targetOperatorId: "operator-anna"
    }, VOLGA_CONTEXT);
    assert.equal(unsupportedAction.status, "invalid");
    assert.equal(unsupportedAction.error?.code, "assignment_action_unsupported");

    const assigned = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Senior redistribution",
      targetOperatorId: "operator-anna"
    }, VOLGA_CONTEXT);
    assert.equal(assigned.status, "ok");
    assert.equal(assigned.data.assignment.action, "assign");
    assert.equal(assigned.data.assignment.targetOperatorId, "operator-anna");
    assert.equal(assigned.data.conversation.status, "assigned");
    assert.equal(assigned.data.auditEvent.immutable, true);
    assert.equal(assigned.data.queueJob.kind, "assignment.commit");
  });

  it("applies an explicit chat-limit override only when operator capacity allows it", async () => {
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 8,
      id: "capacity-operator-full-vk-override",
      operatorId: "operator-full",
      overrideAllowed: true,
      tenantId: "tenant-volga",
      updatedAt: "2026-07-16T10:00:00.000Z"
    });
    const routing = new RoutingService(repository);

    const assigned = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      overrideLimit: true,
      reason: "Approved capacity exception",
      targetOperatorId: "operator-full"
    }, VOLGA_CONTEXT);

    assert.equal(assigned.status, "ok");
    assert.equal(assigned.data.overrideApplied, true);
    assert.equal(assigned.data.assignment.targetOperatorId, "operator-full");
  });

  it("keeps operator and queue counters consistent across transfer and return-to-queue", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const beforeIvan = before.data.operators.find((operator) => operator.id === "operator-ivan");
    const beforeKirill = before.data.operators.find((operator) => operator.id === "operator-kirill");
    const beforeQueue = before.data.queues[0];

    const transferred = await routing.createAssignment({
      action: "transfer",
      conversationId: "vladimir",
      reason: "Senior transfer",
      targetOperatorId: "operator-ivan"
    }, VOLGA_CONTEXT);
    assert.equal(transferred.status, "ok");
    assert.equal(transferred.data.assignment.fromOperatorId, "operator-kirill");
    assert.equal(transferred.data.assignment.targetOperatorId, "operator-ivan");
    assert.equal(transferred.data.conversation.status, "transferred");

    const afterTransfer = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const transferIvan = afterTransfer.data.operators.find((operator) => operator.id === "operator-ivan");
    const transferKirill = afterTransfer.data.operators.find((operator) => operator.id === "operator-kirill");
    const transferQueue = afterTransfer.data.queues[0];

    assert.equal(transferIvan.chats, beforeIvan.chats + 1);
    assert.equal(transferKirill.chats, beforeKirill.chats - 1);
    assert.equal(transferQueue.active, beforeQueue.active);
    assert.equal(transferQueue.waiting, beforeQueue.waiting);

    const returned = await routing.createAssignment({
      action: "return_queue",
      conversationId: "vladimir",
      reason: "No operator answer"
    }, VOLGA_CONTEXT);
    assert.equal(returned.status, "ok");
    assert.equal(returned.data.assignment.fromOperatorId, "operator-ivan");
    assert.equal(returned.data.assignment.targetOperatorId, null);

    const afterReturn = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const returnIvan = afterReturn.data.operators.find((operator) => operator.id === "operator-ivan");
    const returnQueue = afterReturn.data.queues[0];

    assert.equal(returnIvan.chats, beforeIvan.chats);
    assert.equal(returnQueue.active, beforeQueue.active - 1);
    assert.equal(returnQueue.waiting, beforeQueue.waiting + 1);
  });

  it("requires an explicit SLA pause reason and creates a resume job", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    const routing = new RoutingService(repository);

    const missingReason = await routing.pauseSla({
      conversationId: "maria",
      durationMinutes: 15,
      reason: ""
    }, VOLGA_CONTEXT);
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "sla_pause_reason_required");

    const paused = await routing.pauseSla({
      conversationId: "maria",
      durationMinutes: 15,
      reason: "Customer requested a short hold"
    }, VOLGA_CONTEXT);
    assert.equal(paused.status, "ok");
    assert.equal(paused.data.conversation.status, "paused");
    assert.equal(paused.data.sla.state, "paused");
    assert.equal(paused.data.sla.durationMinutes, 15);
    assert.equal(paused.data.schedulerJob.queue, "sla-timers");
    assert.equal(paused.data.auditEvent.action, "sla.pause");

    const [resumeJob] = repository.listJobs();
    assert.equal(resumeJob.action, "resume_sla");
    assert.equal(resumeJob.conversationId, "maria");
    assert.equal(resumeJob.tenantId, "tenant-volga");
    assert.equal(resumeJob.status, "pending");
    assert.equal(typeof resumeJob.runAt, "string");

    const transition = worker.planSlaTimerTransition({
      conversation: repository.readState().conversations.find((conversation) => conversation.id === "maria")!,
      job: resumeJob,
      now: new Date(new Date(resumeJob.runAt!).getTime() + 1)
    });
    assert.equal(transition.status, "ready");
    assert.equal(transition.conversationId, "maria");
  });

  it("appends tenant-scoped lifecycle events with routing state changes", async () => {
    const captured: RoutingLifecycleEvent[] = [];
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    const saveWithEvents = repository.saveStateWithLifecycleEvents.bind(repository);
    repository.saveStateWithLifecycleEvents = (state, events) => {
      captured.push(...events);
      return saveWithEvents(state, events);
    };
    const routing = new RoutingService(repository);
    const context = { actorId: "operator-anna", actorType: "operator" as const, tenantId: "tenant-volga" };

    await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Lifecycle assignment",
      targetOperatorId: "operator-anna"
    }, context);
    await routing.createAssignment({
      action: "return_queue",
      conversationId: "alexey",
      reason: "Lifecycle queue return"
    }, context);
    await routing.pauseSla({
      conversationId: "maria",
      durationMinutes: 10,
      reason: "Lifecycle SLA pause"
    }, context);
    await routing.startRescue({
      conversationId: "vladimir",
      reason: "Lifecycle rescue start"
    }, context);
    await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "saved",
      reason: "Lifecycle rescue resolved"
    }, context);

    assert.deepEqual(captured.map((event) => event.eventType), [
      "assignment.changed",
      "queue.entered",
      "sla.paused",
      "rescue.started",
      "rescue.resolved"
    ]);
    assert.equal(captured.every((event) => event.tenantId === "tenant-volga"), true);
    assert.equal(captured.every((event) => event.actorId === "operator-anna"), true);
    assert.equal(captured.every((event) => event.schemaVersion === "conversation-lifecycle/v1"), true);
  });

  it("plans a paused SLA timer transition without mutating the conversation", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const conversation = {
      client: "Alexey T.",
      channel: "VK",
      id: "alexey",
      slaTone: "hold",
      status: "paused",
      topic: "Authorization / Code"
    };
    const before = JSON.parse(JSON.stringify(conversation));

    const transition = worker.planSlaTimerTransition({
      conversation,
      job: {
        action: "resume_sla",
        id: "job_sla_resume_due",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z"
      },
      now: new Date("2026-06-29T13:16:00.000Z")
    });

    assert.equal(transition.status, "ready");
    assert.equal(transition.action, "resume_sla");
    assert.equal(transition.conversationId, "alexey");
    assert.equal(transition.fromStatus, "paused");
    assert.equal(transition.toStatus, "active");
    assert.equal(transition.jobId, "job_sla_resume_due");
    assert.deepEqual(conversation, before);
  });

  it("skips SLA resume timer transitions for conversations that are no longer paused", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");

    const transition = worker.planSlaTimerTransition({
      conversation: {
        client: "Maria K.",
        channel: "SDK",
        id: "maria",
        operatorId: "operator-ivan",
        slaTone: "ok",
        status: "assigned",
        topic: "Delivery / Status"
      },
      job: {
        action: "resume_sla",
        id: "job_sla_resume_stale",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z"
      },
      now: new Date("2026-06-29T13:16:00.000Z")
    });

    assert.equal(transition.status, "skipped");
    assert.equal(transition.reason, "not_paused");
    assert.equal(transition.action, "resume_sla");
    assert.equal(transition.conversationId, "maria");
    assert.equal(transition.jobId, "job_sla_resume_stale");
  });

  it("plans an overdue SLA timer transition for due active conversations", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");

    const transition = worker.planSlaTimerTransition({
      conversation: {
        client: "Vladimir B.",
        channel: "Telegram",
        id: "vladimir",
        operatorId: "operator-kirill",
        slaTone: "warn",
        status: "assigned",
        topic: "Delivery / Status"
      },
      job: {
        action: "mark_sla_overdue",
        id: "job_sla_overdue_due",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z"
      },
      now: new Date("2026-06-29T13:16:00.000Z")
    });

    assert.equal(transition.status, "ready");
    assert.equal(transition.action, "mark_sla_overdue");
    assert.equal(transition.conversationId, "vladimir");
    assert.equal(transition.fromStatus, "assigned");
    assert.equal(transition.toStatus, "assigned");
    assert.equal(transition.toSlaTone, "danger");
    assert.equal(transition.jobId, "job_sla_overdue_due");
  });

  it("claims due SLA timer jobs without touching future or foreign-queue jobs", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [],
      jobs: [
        {
          action: "resume_sla",
          id: "job_sla_due",
          queue: "sla-timers",
          runAt: "2026-06-29T13:15:00.000Z",
          status: "pending"
        },
        {
          action: "resume_sla",
          id: "job_sla_future",
          queue: "sla-timers",
          runAt: "2026-06-29T13:20:00.000Z",
          status: "pending"
        },
        {
          action: "return_rescue",
          id: "job_rescue_due",
          queue: "rescue-return",
          runAt: "2026-06-29T13:15:00.000Z",
          status: "pending"
        }
      ],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const result = await worker.claimDueSlaTimerJobs({
      limit: 1,
      now: new Date("2026-06-29T13:16:00.000Z"),
      routingRepository: repository
    });

    assert.deepEqual(result.claimed.map((job: { id: string }) => job.id), ["job_sla_due"]);
    const jobs = repository.listJobs();
    const due = jobs.find((job) => job.id === "job_sla_due") as Record<string, unknown>;
    const future = jobs.find((job) => job.id === "job_sla_future") as Record<string, unknown>;
    const rescue = jobs.find((job) => job.id === "job_rescue_due") as Record<string, unknown>;
    assert.equal(due.status, "claimed");
    assert.equal(due.claimedAt, "2026-06-29T13:16:00.000Z");
    assert.equal(future.status, "pending");
    assert.equal(rescue.status, "pending");
  });

  it("claims due SLA timer jobs through the repository atomic claim hook", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const pendingJob = {
      action: "resume_sla",
      id: "job_sla_atomic_claim",
      queue: "sla-timers",
      runAt: "2026-06-29T13:15:00.000Z",
      status: "pending"
    };
    const claimCalls: Array<Record<string, unknown>> = [];
    const repository = {
      listJobs(): Array<Record<string, unknown>> {
        return [pendingJob];
      },
      claimJob(input: Record<string, unknown>): Record<string, unknown> {
        claimCalls.push(input);
        return {
          ...pendingJob,
          claimedAt: input.claimedAt,
          status: "claimed"
        };
      },
      saveJob(): Record<string, unknown> {
        throw new Error("saveJob must not be used for claim");
      }
    };

    const result = await worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:16:00.000Z"),
      routingRepository: repository
    });

    assert.deepEqual(result.claimed.map((job: { id: string }) => job.id), ["job_sla_atomic_claim"]);
    assert.deepEqual(claimCalls, [{
      claimedAt: "2026-06-29T13:16:00.000Z",
      expectedLeaseExpiresAt: null,
      expectedLeaseOwner: null,
      expectedStatus: "pending",
      jobId: "job_sla_atomic_claim",
      queue: "sla-timers"
    }]);
  });

  it("applies a claimed SLA resume transition to durable conversation state", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        client: "Maria K.",
        channel: "SDK",
        id: "maria",
        operatorId: "operator-ivan",
        slaTone: "hold",
        status: "paused",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "resume_sla",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_resume_claimed",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const transition = worker.planSlaTimerTransition({
      conversation: repository.readState().conversations[0],
      job: repository.listJobs()[0],
      now: new Date("2026-06-29T13:16:30.000Z")
    });
    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: repository,
      transition
    });

    assert.equal(applied.status, "applied");
    assert.equal(applied.conversationId, "maria");
    const state = repository.readState();
    assert.equal(state.conversations[0].status, "active");
    assert.equal(state.conversations[0].slaTone, "ok");
    assert.equal(state.jobs[0].status, "completed");
    assert.equal(state.jobs[0].completedAt, "2026-06-29T13:16:30.000Z");
  });

  it("applies ready SLA timer transitions through the repository-owned apply hook", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const applyCalls: Array<Record<string, unknown>> = [];
    const repository = {
      applySlaTimerTransition(input: Record<string, unknown>): Record<string, unknown> {
        applyCalls.push(input);
        return {
          conversationId: "maria",
          jobId: "job_sla_repository_apply",
          status: "applied"
        };
      },
      listJobs(): never {
        throw new Error("listJobs must not be used for SLA apply");
      },
      readState(): never {
        throw new Error("readState must not be used for SLA apply");
      },
      saveState(): never {
        throw new Error("saveState must not be used for SLA apply");
      }
    };

    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: repository,
      transition: {
        action: "resume_sla",
        conversationId: "maria",
        fromStatus: "paused",
        jobId: "job_sla_repository_apply",
        status: "ready",
        toStatus: "active"
      }
    });

    assert.equal(applied.status, "applied");
    assert.deepEqual(applyCalls, [{
      action: "resume_sla",
      completedAt: "2026-06-29T13:16:30.000Z",
      conversationId: "maria",
      jobId: "job_sla_repository_apply",
      toStatus: "active"
    }]);
  });

  it("skips SLA timer transitions when the repository-current job is not claimed", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        client: "Maria K.",
        channel: "SDK",
        id: "maria",
        operatorId: "operator-ivan",
        slaTone: "hold",
        status: "paused",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "resume_sla",
        id: "job_sla_resume_pending",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "pending"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });
    const transition = worker.planSlaTimerTransition({
      conversation: repository.readState().conversations[0],
      job: {
        ...repository.listJobs()[0],
        claimedAt: "2026-06-29T13:16:00.000Z",
        status: "claimed"
      },
      now: new Date("2026-06-29T13:16:30.000Z")
    });

    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: repository,
      transition
    });

    assert.equal(applied.status, "skipped");
    const state = repository.readState();
    assert.equal(state.conversations[0].status, "paused");
    assert.equal(state.conversations[0].slaTone, "hold");
    assert.equal(state.jobs[0].status, "pending");
    assert.equal(state.jobs[0].completedAt, undefined);
  });

  it("applies a claimed SLA overdue transition to durable conversation state", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        client: "Vladimir B.",
        channel: "Telegram",
        id: "vladimir",
        operatorId: "operator-kirill",
        slaTone: "warn",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "mark_sla_overdue",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_overdue_claimed",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const transition = worker.planSlaTimerTransition({
      conversation: repository.readState().conversations[0],
      job: repository.listJobs()[0],
      now: new Date("2026-06-29T13:16:30.000Z")
    });
    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: repository,
      transition
    });

    assert.equal(applied.status, "applied");
    assert.equal(applied.conversationId, "vladimir");
    const state = repository.readState();
    assert.equal(state.conversations[0].status, "assigned");
    assert.equal(state.conversations[0].slaTone, "danger");
    assert.equal(state.jobs[0].status, "completed");
    assert.equal(state.jobs[0].completedAt, "2026-06-29T13:16:30.000Z");
  });

  it("emits an overdue descriptor when applying an SLA overdue transition", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        client: "Vladimir B.",
        channel: "Telegram",
        id: "vladimir",
        operatorId: "operator-kirill",
        slaTone: "warn",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "mark_sla_overdue",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_overdue_descriptor",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });
    const transition = worker.planSlaTimerTransition({
      conversation: repository.readState().conversations[0],
      job: repository.listJobs()[0],
      now: new Date("2026-06-29T13:16:30.000Z")
    });

    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: repository,
      transition
    });

    assert.equal(applied.overdueDescriptor.kind, "sla.timer.overdue");
    assert.equal(applied.overdueDescriptor.queue, "sla-timers");
    assert.equal(applied.overdueDescriptor.conversationId, "vladimir");
    assert.equal(applied.overdueDescriptor.jobId, "job_sla_overdue_descriptor");
    assert.equal(applied.overdueDescriptor.occurredAt, "2026-06-29T13:16:30.000Z");
  });

  it("emits a realtime event when applying an SLA overdue transition", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        client: "Vladimir B.",
        channel: "Telegram",
        id: "vladimir",
        operatorId: "operator-kirill",
        slaTone: "warn",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "mark_sla_overdue",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_overdue_realtime",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });
    const transition = worker.planSlaTimerTransition({
      conversation: repository.readState().conversations[0],
      job: repository.listJobs()[0],
      now: new Date("2026-06-29T13:16:30.000Z")
    });

    const applied = await worker.applySlaTimerTransition({
      completedAt: new Date("2026-06-29T13:16:30.000Z"),
      routingRepository: repository,
      transition
    });

    assert.equal(applied.realtimeEvent.type, "sla.timer.updated");
    assert.equal(applied.realtimeEvent.resourceType, "conversation");
    assert.equal(applied.realtimeEvent.resourceId, "vladimir");
    assert.equal(applied.realtimeEvent.occurredAt, "2026-06-29T13:16:30.000Z");
    assert.equal(applied.realtimeEvent.data.state, "overdue");
    assert.equal(applied.realtimeEvent.data.jobId, "job_sla_overdue_realtime");
  });

  it("delays retryable SLA timer failures until their backoff window expires", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const failedAt = new Date("2026-06-29T13:20:00.000Z");
    const repository = RoutingRepository.inMemory({
      conversations: [],
      jobs: [{
        action: "resume_sla",
        claimedAt: "2026-06-29T13:19:30.000Z",
        id: "job_sla_retryable",
        queue: "sla-timers",
        runAt: "2026-06-29T13:19:00.000Z",
        status: "claimed"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const failed = await worker.recordSlaTimerJobFailure({
      error: new Error("routing store unavailable"),
      failedAt,
      maxAttempts: 3,
      retryBackoffMs: 60_000,
      routingRepository: repository,
      jobId: "job_sla_retryable"
    });
    const earlyRetry = await worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:20:30.000Z"),
      routingRepository: repository
    });
    const readyRetry = await worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:21:00.000Z"),
      routingRepository: repository
    });

    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
    assert.equal(failed.claimedAt, undefined);
    assert.equal(failed.nextAttemptAt, "2026-06-29T13:21:00.000Z");
    assert.equal(failed.deadLetteredAt, undefined);
    assert.equal(failed.lastError, "routing store unavailable");
    assert.deepEqual(earlyRetry.claimed, []);
    assert.deepEqual(readyRetry.claimed.map((job: { id: string }) => job.id), ["job_sla_retryable"]);
  });

  it("dead-letters SLA timer failures after the attempt budget is exhausted", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const failedAt = new Date("2026-06-29T13:25:00.000Z");
    const repository = RoutingRepository.inMemory({
      conversations: [],
      jobs: [{
        action: "mark_sla_overdue",
        attempts: 2,
        claimedAt: "2026-06-29T13:24:30.000Z",
        id: "job_sla_dead_letter",
        queue: "sla-timers",
        runAt: "2026-06-29T13:24:00.000Z",
        status: "claimed"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const failed = await worker.recordSlaTimerJobFailure({
      error: "routing store unavailable",
      failedAt,
      maxAttempts: 3,
      retryBackoffMs: 60_000,
      routingRepository: repository,
      jobId: "job_sla_dead_letter"
    });
    const retry = await worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:26:00.000Z"),
      routingRepository: repository
    });

    assert.equal(failed.status, "dead_lettered");
    assert.equal(failed.attempts, 3);
    assert.equal(failed.claimedAt, undefined);
    assert.equal(failed.deadLetteredAt, "2026-06-29T13:25:00.000Z");
    assert.equal(failed.nextAttemptAt, null);
    assert.equal(failed.lastError, "routing store unavailable");
    assert.deepEqual(retry.claimed, []);
  });

  it("skips SLA timer jobs that are failed without a retry time or already in terminal and claimed states", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [],
      jobs: [
        {
          action: "resume_sla",
          id: "job_failed_without_retry_time",
          nextAttemptAt: null,
          queue: "sla-timers",
          runAt: "2026-06-29T13:24:00.000Z",
          status: "failed"
        },
        {
          action: "resume_sla",
          claimedAt: "2026-06-29T13:24:30.000Z",
          id: "job_already_claimed",
          leaseExpiresAt: "2026-06-29T13:26:00.000Z",
          leaseOwner: "sla-worker-current",
          queue: "sla-timers",
          runAt: "2026-06-29T13:24:00.000Z",
          status: "claimed"
        },
        {
          action: "resume_sla",
          completedAt: "2026-06-29T13:24:40.000Z",
          id: "job_already_completed",
          queue: "sla-timers",
          runAt: "2026-06-29T13:24:00.000Z",
          status: "completed"
        },
        {
          action: "resume_sla",
          deadLetteredAt: "2026-06-29T13:24:50.000Z",
          id: "job_already_dead_lettered",
          queue: "sla-timers",
          runAt: "2026-06-29T13:24:00.000Z",
          status: "dead_lettered"
        },
        {
          action: "resume_sla",
          id: "job_retry_ready",
          nextAttemptAt: "2026-06-29T13:25:00.000Z",
          queue: "sla-timers",
          runAt: "2026-06-29T13:24:00.000Z",
          status: "failed"
        }
      ],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const result = await worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:25:00.000Z"),
      routingRepository: repository
    });

    assert.deepEqual(result.claimed.map((job: { id: string }) => job.id), ["job_retry_ready"]);
  });

  it("does not overwrite a stale SLA timer job snapshot that was completed before claim save", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const pendingJob = {
      action: "resume_sla",
      id: "job_sla_stale_claim",
      queue: "sla-timers",
      runAt: "2026-06-29T13:24:00.000Z",
      status: "pending"
    };
    const completedJob = {
      ...pendingJob,
      completedAt: "2026-06-29T13:24:30.000Z",
      status: "completed"
    };
    let listCalls = 0;
    let savedJob: Record<string, unknown> | null = null;
    const repository = {
      listJobs(): Array<Record<string, unknown>> {
        listCalls += 1;
        return [listCalls === 1 ? pendingJob : completedJob];
      },
      claimJob(): undefined {
        listCalls += 1;
        return undefined;
      },
      saveJob(job: Record<string, unknown>): Record<string, unknown> {
        savedJob = job;
        return job;
      }
    };

    const result = await worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:25:00.000Z"),
      routingRepository: repository
    });

    assert.deepEqual(result.claimed, []);
    assert.equal(savedJob, null);
  });

  it("claims expired rescue-return jobs without touching future or foreign jobs", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [],
      jobs: [
        {
          action: "return_to_sla_queue",
          id: "job_rescue_return_due",
          queue: "rescue-return",
          runAt: "2026-06-29T13:29:00.000Z",
          status: "pending"
        },
        {
          action: "return_to_sla_queue",
          id: "job_rescue_return_future",
          queue: "rescue-return",
          runAt: "2026-06-29T13:31:00.000Z",
          status: "pending"
        },
        {
          action: "noop",
          id: "job_rescue_return_wrong_action",
          queue: "rescue-return",
          runAt: "2026-06-29T13:29:00.000Z",
          status: "pending"
        },
        {
          action: "return_to_sla_queue",
          id: "job_sla_wrong_queue",
          queue: "sla-timers",
          runAt: "2026-06-29T13:29:00.000Z",
          status: "pending"
        }
      ],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const result = await worker.claimExpiredRescueReturnJobs({
      limit: 2,
      now: new Date("2026-06-29T13:30:00.000Z"),
      routingRepository: repository
    });
    const jobs = repository.listJobs();
    const due = jobs.find((job) => job.id === "job_rescue_return_due") as Record<string, unknown>;
    const future = jobs.find((job) => job.id === "job_rescue_return_future") as Record<string, unknown>;
    const wrongAction = jobs.find((job) => job.id === "job_rescue_return_wrong_action") as Record<string, unknown>;
    const wrongQueue = jobs.find((job) => job.id === "job_sla_wrong_queue") as Record<string, unknown>;

    assert.deepEqual(result.claimed.map((job: { id: string }) => job.id), ["job_rescue_return_due"]);
    assert.equal(due.status, "claimed");
    assert.equal(due.claimedAt, "2026-06-29T13:30:00.000Z");
    assert.equal(future.status, "pending");
    assert.equal(wrongAction.status, "pending");
    assert.equal(wrongQueue.status, "pending");
  });

  it("does not overwrite a stale rescue-return job snapshot that was completed before claim save", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const pendingJob = {
      action: "return_to_sla_queue",
      id: "job_rescue_return_stale_claim",
      queue: "rescue-return",
      runAt: "2026-06-29T13:29:00.000Z",
      status: "pending"
    };
    const completedJob = {
      ...pendingJob,
      completedAt: "2026-06-29T13:29:30.000Z",
      status: "completed"
    };
    let listCalls = 0;
    let savedJob: Record<string, unknown> | null = null;
    const repository = {
      listJobs(): Array<Record<string, unknown>> {
        listCalls += 1;
        return [listCalls === 1 ? pendingJob : completedJob];
      },
      claimJob(): undefined {
        listCalls += 1;
        return undefined;
      },
      saveJob(job: Record<string, unknown>): Record<string, unknown> {
        savedJob = job;
        return job;
      }
    };

    const result = await worker.claimExpiredRescueReturnJobs({
      now: new Date("2026-06-29T13:30:00.000Z"),
      routingRepository: repository
    });

    assert.deepEqual(result.claimed, []);
    assert.equal(savedJob, null);
  });

  it("applies a claimed rescue-return job to move one assigned rescue conversation back to queue", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_claimed",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 131,
        channels: ["Telegram"],
        chats: 3,
        id: "operator-kirill",
        limit: 8,
        name: "Kirill M.",
        rescueActive: 1,
        slaPercent: 88,
        status: "break",
        tenantId: "tenant-volga"
      }],
      queueMemberships: [],
      queues: [{
        active: 35,
        channel: "Telegram",
        health: 74,
        limit: 8,
        overdue: 3,
        tenantId: "tenant-volga",
        waiting: 11
      }],
      rescueReportRows: [],
      routingRules: []
    });

    const applied = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: repository.listJobs()[0],
      routingRepository: repository
    });
    const state = repository.readState();
    const conversation = state.conversations[0];
    const operator = state.operators[0];
    const queue = state.queues[0];
    const job = state.jobs[0];

    assert.equal(applied.status, "applied");
    assert.equal(applied.conversationId, "vladimir");
    assert.equal(conversation.status, "queued");
    assert.equal(conversation.operatorId, undefined);
    assert.equal(conversation.slaTone, "hold");
    assert.equal(conversation.rescue?.state, "returned_to_queue");
    assert.equal(operator.chats, 2);
    assert.equal(operator.rescueActive, 0);
    assert.equal(queue.active, 34);
    assert.equal(queue.waiting, 12);
    assert.equal(job.status, "completed");
    assert.equal(job.completedAt, "2026-06-29T13:35:00.000Z");
  });

  it("applies rescue-return transitions through the repository-owned apply hook", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const applyCalls: Array<Record<string, unknown>> = [];
    const repository = {
      applyRescueReturnTransition(input: Record<string, unknown>): Record<string, unknown> {
        applyCalls.push(input);
        return {
          conversationId: "vladimir",
          jobId: "job_rescue_repository_apply",
          status: "applied"
        };
      },
      listJobs(): never {
        throw new Error("listJobs must not be used for rescue apply");
      },
      readState(): never {
        throw new Error("readState must not be used for rescue apply");
      },
      saveState(): never {
        throw new Error("saveState must not be used for rescue apply");
      }
    };

    const applied = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: {
        action: "return_to_sla_queue",
        conversationId: "vladimir",
        id: "job_rescue_repository_apply",
        queue: "rescue-return",
        tenantId: "tenant-volga",
        status: "claimed"
      },
      routingRepository: repository
    });

    assert.equal(applied.status, "applied");
    assert.deepEqual(applyCalls, [{
      completedAt: "2026-06-29T13:35:00.000Z",
      fallbackConversationId: "vladimir",
      jobId: "job_rescue_repository_apply",
      tenantId: "tenant-volga"
    }]);
  });

  it("skips rescue-return transitions when the repository-current job is not claimed", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        conversationId: "vladimir",
        id: "job_rescue_return_pending",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "pending"
      }],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 131,
        channels: ["Telegram"],
        chats: 3,
        id: "operator-kirill",
        limit: 8,
        name: "Kirill M.",
        rescueActive: 1,
        slaPercent: 88,
        status: "break"
      }],
      queueMemberships: [],
      queues: [{
        active: 35,
        channel: "Telegram",
        health: 74,
        limit: 8,
        overdue: 3,
        waiting: 11
      }],
      rescueReportRows: [],
      routingRules: []
    });

    const skipped = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: repository.listJobs()[0],
      routingRepository: repository
    });
    const state = repository.readState();

    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.reason, "job_not_claimed");
    assert.equal(state.conversations[0].status, "assigned");
    assert.equal(state.conversations[0].operatorId, "operator-kirill");
    assert.equal(state.jobs[0].status, "pending");
    assert.deepEqual(state.rescueReportRows, []);
  });

  it("uses the repository-current rescue-return job identity before applying a claimed transition", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const staleClaimedJob = {
      action: "return_to_sla_queue",
      claimedAt: "2026-06-29T13:34:00.000Z",
      conversationId: "vladimir",
      id: "job_rescue_return_claimed_stale_identity",
      queue: "rescue-return",
      runAt: "2026-06-29T13:34:00.000Z",
      status: "claimed"
    };
    const repository = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        ...staleClaimedJob,
        conversationId: "alexey"
      }],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 131,
        channels: ["Telegram"],
        chats: 3,
        id: "operator-kirill",
        limit: 8,
        name: "Kirill M.",
        rescueActive: 1,
        slaPercent: 88,
        status: "break"
      }],
      queueMemberships: [],
      queues: [{
        active: 35,
        channel: "Telegram",
        health: 74,
        limit: 8,
        overdue: 3,
        waiting: 11
      }],
      rescueReportRows: [],
      routingRules: []
    });

    const skipped = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: staleClaimedJob,
      routingRepository: repository
    });
    const state = repository.readState();

    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.reason, "conversation_not_found");
    assert.equal(skipped.conversationId, "alexey");
    assert.equal(state.conversations[0].status, "assigned");
    assert.equal(state.jobs[0].status, "claimed");
    assert.deepEqual(state.rescueReportRows, []);
  });

  it("skips rescue-return transitions for jobs outside the rescue-return queue or action", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const seedState = {
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active" as const
        },
        slaTone: "danger" as const,
        status: "assigned" as const,
        topic: "Delivery / Status"
      }],
      jobs: [],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 131,
        channels: ["Telegram"],
        chats: 3,
        id: "operator-kirill",
        limit: 8,
        name: "Kirill M.",
        rescueActive: 1,
        slaPercent: 88,
        status: "break" as const
      }],
      queueMemberships: [],
      queues: [{
        active: 35,
        channel: "Telegram",
        health: 74,
        limit: 8,
        overdue: 3,
        waiting: 11
      }],
      rescueReportRows: [],
      routingRules: []
    };
    const wrongQueueRepository = RoutingRepository.inMemory({
      ...seedState,
      jobs: [{
        action: "return_to_sla_queue",
        conversationId: "vladimir",
        id: "job_wrong_queue",
        queue: "sla-timers",
        status: "claimed"
      }]
    });
    const wrongActionRepository = RoutingRepository.inMemory({
      ...seedState,
      jobs: [{
        action: "noop",
        conversationId: "vladimir",
        id: "job_wrong_action",
        queue: "rescue-return",
        status: "claimed"
      }]
    });

    const wrongQueue = await worker.applyRescueReturnTransition({
      job: wrongQueueRepository.listJobs()[0],
      routingRepository: wrongQueueRepository
    });
    const wrongAction = await worker.applyRescueReturnTransition({
      job: wrongActionRepository.listJobs()[0],
      routingRepository: wrongActionRepository
    });

    assert.equal(wrongQueue.status, "skipped");
    assert.equal(wrongQueue.reason, "unsupported_queue");
    assert.equal(wrongAction.status, "skipped");
    assert.equal(wrongAction.reason, "unsupported_action");
    assert.equal(wrongQueueRepository.readState().conversations[0].status, "assigned");
    assert.equal(wrongActionRepository.readState().conversations[0].status, "assigned");
  });

  it("persists rescue auto-return outcome rows after applying a rescue-return job", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-ladoga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_outcome",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed",
        tenantId: "tenant-ladoga"
      }],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 131,
        channels: ["Telegram"],
        chats: 3,
        id: "operator-kirill",
        limit: 8,
        name: "Kirill M.",
        rescueActive: 1,
        slaPercent: 88,
        status: "break",
        tenantId: "tenant-ladoga"
      }],
      queueMemberships: [],
      queues: [{
        active: 35,
        channel: "Telegram",
        health: 74,
        limit: 8,
        overdue: 3,
        tenantId: "tenant-ladoga",
        waiting: 11
      }],
      rescueReportRows: [],
      routingRules: []
    });

    await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: repository.listJobs()[0],
      routingRepository: repository
    });

    const [outcome] = repository.readState().rescueReportRows;
    assert.equal(outcome.conversationId, "vladimir");
    assert.equal(outcome.channel, "Telegram");
    assert.equal(outcome.operatorId, "operator-kirill");
    assert.equal(outcome.outcome, "returned_to_queue");
    assert.equal(outcome.reason, "No operator reply during rescue");
    assert.equal(outcome.resolution, "Auto-returned to SLA queue after rescue timer expired");
    assert.equal(outcome.timerSeconds, 240);
    assert.equal(outcome.digest, "daily_rescue");

    const [analyticsRow] = repository.listRoutingAnalyticsRows({
      eventKind: "auto_return",
      tenantId: "tenant-ladoga"
    });
    assert.equal(Boolean(analyticsRow), true);
    assert.equal(analyticsRow.conversationId, "vladimir");
    assert.equal(analyticsRow.channel, "Telegram");
    assert.equal(analyticsRow.fromOperatorId, "operator-kirill");
    assert.equal(analyticsRow.tenantId, "tenant-ladoga");
    assert.equal(analyticsRow.toOperatorId, null);
    assert.equal(analyticsRow.source, "rescue-return-worker");
    assert.equal(repository.listRoutingAnalyticsRows({ eventKind: "auto_return", tenantId: "tenant-volga" }).length, 0);
  });

  it("emits realtime descriptors for rescue auto-return outcomes", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        tenantId: "tenant-volga",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_realtime",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const applied = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: repository.listJobs()[0],
      routingRepository: repository
    });

    assert.equal(applied.realtimeEvent.type, "rescue.countdown.updated");
    assert.equal(applied.realtimeEvent.resourceType, "conversation");
    assert.equal(applied.realtimeEvent.resourceId, "vladimir");
    assert.equal(applied.realtimeEvent.occurredAt, "2026-06-29T13:35:00.000Z");
    assert.equal(applied.realtimeEvent.data.state, "returned_to_queue");
    assert.equal(applied.realtimeEvent.data.jobId, "job_rescue_return_realtime");
  });

  it("emits analytics descriptors for rescue auto-return outcomes", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory({
      conversations: [{
        channel: "Telegram",
        client: "Vladimir B.",
        id: "vladimir",
        operatorId: "operator-kirill",
        rescue: {
          deadlineAt: 1782740040000,
          durationSeconds: 240,
          nextAction: "reply_or_return_to_sla_queue",
          reason: "No operator reply during rescue",
          source: "manual",
          startedAt: 1782739800000,
          state: "active"
        },
        slaTone: "danger",
        status: "assigned",
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_analytics",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }],
      operatorCapacities: [],
      operators: [{
        avgFirstResponseSeconds: 131,
        channels: ["Telegram"],
        chats: 3,
        id: "operator-kirill",
        limit: 8,
        name: "Kirill M.",
        rescueActive: 1,
        slaPercent: 88,
        status: "break",
        tenantId: "tenant-volga"
      }],
      queueMemberships: [],
      queues: [{
        active: 35,
        channel: "Telegram",
        health: 74,
        limit: 8,
        overdue: 3,
        tenantId: "tenant-volga",
        waiting: 11
      }],
      rescueReportRows: [],
      routingRules: []
    });

    const applied = await worker.applyRescueReturnTransition({
      completedAt: new Date("2026-06-29T13:35:00.000Z"),
      job: repository.listJobs()[0],
      routingRepository: repository
    });

    assert.equal(applied.analyticsDescriptor.kind, "routing.rescue.auto_returned");
    assert.equal(applied.analyticsDescriptor.conversationId, "vladimir");
    assert.equal(applied.analyticsDescriptor.operatorId, "operator-kirill");
    assert.equal(applied.analyticsDescriptor.jobId, "job_rescue_return_analytics");
    assert.equal(applied.analyticsDescriptor.channel, "Telegram");
    assert.equal(applied.analyticsDescriptor.occurredAt, "2026-06-29T13:35:00.000Z");
  });

  it("persists tenant-scoped assignment routing analytics rows through the routing repository", () => {
    const repository = RoutingRepository.inMemory();

    const saved = repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics_assignment_vladimir",
      occurredAt: "2026-06-29T13:40:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });
    repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "foreign",
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics_assignment_foreign",
      occurredAt: "2026-06-29T13:42:00.000Z",
      source: "api",
      tenantId: "tenant-ladoga",
      toOperatorId: "operator-kirill"
    });

    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "assignment",
      tenantId: "tenant-volga"
    });
    rows[0].toOperatorId = "mutated";

    assert.equal(saved.eventKind, "assignment");
    assert.equal(saved.toOperatorId, "operator-kirill");
    assert.deepEqual(repository.listRoutingAnalyticsRows({
      eventKind: "assignment",
      tenantId: "tenant-volga"
    }).map((row) => row.id), ["analytics_assignment_vladimir"]);
    assert.equal(repository.listRoutingAnalyticsRows({
      eventKind: "assignment",
      tenantId: "tenant-volga"
    })[0].toOperatorId, "operator-kirill");
  });

  it("persists tenant-scoped transfer routing analytics rows through the routing repository", () => {
    const repository = RoutingRepository.inMemory();

    const saved = repository.saveRoutingAnalyticsRow({
      channel: "VK",
      conversationId: "alexey",
      eventKind: "transfer",
      fromOperatorId: "operator-oleg",
      id: "analytics_transfer_alexey",
      occurredAt: "2026-06-29T13:45:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-anna"
    });
    repository.saveRoutingAnalyticsRow({
      channel: "VK",
      conversationId: "alexey-assignment",
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics_assignment_alexey",
      occurredAt: "2026-06-29T13:46:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-anna"
    });

    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "transfer",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.eventKind, "transfer");
    assert.equal(saved.fromOperatorId, "operator-oleg");
    assert.equal(saved.toOperatorId, "operator-anna");
    assert.deepEqual(rows.map((row) => row.id), ["analytics_transfer_alexey"]);
  });

  it("persists tenant-scoped rescue routing analytics rows through the routing repository", () => {
    const repository = RoutingRepository.inMemory();

    const saved = repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "rescue",
      fromOperatorId: null,
      id: "analytics_rescue_vladimir",
      occurredAt: "2026-06-29T13:50:00.000Z",
      source: "worker",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });
    repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir-transfer",
      eventKind: "transfer",
      fromOperatorId: "operator-oleg",
      id: "analytics_transfer_vladimir",
      occurredAt: "2026-06-29T13:51:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });

    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "rescue",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.eventKind, "rescue");
    assert.equal(saved.source, "worker");
    assert.equal(saved.toOperatorId, "operator-kirill");
    assert.deepEqual(rows.map((row) => row.id), ["analytics_rescue_vladimir"]);
  });

  it("persists tenant-scoped auto-return routing analytics rows through the routing repository", () => {
    const repository = RoutingRepository.inMemory();

    const saved = repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "auto_return",
      fromOperatorId: "operator-kirill",
      id: "analytics_auto_return_vladimir",
      occurredAt: "2026-06-29T13:55:00.000Z",
      source: "rescue-return-worker",
      tenantId: "tenant-volga",
      toOperatorId: null
    });
    repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir-rescue",
      eventKind: "rescue",
      fromOperatorId: null,
      id: "analytics_rescue_vladimir_again",
      occurredAt: "2026-06-29T13:54:00.000Z",
      source: "worker",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });

    const rows = repository.listRoutingAnalyticsRows({
      eventKind: "auto_return",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.eventKind, "auto_return");
    assert.equal(saved.fromOperatorId, "operator-kirill");
    assert.equal(saved.toOperatorId, null);
    assert.deepEqual(rows.map((row) => row.id), ["analytics_auto_return_vladimir"]);
  });

  it("persists tenant-scoped routing analytics rows through the Prisma routing repository", async () => {
    const findManyCalls: unknown[] = [];
    const upsertCalls: unknown[] = [];
    const client = {
      operatorCapacity: {},
      queueMembership: {},
      routingAnalyticsRow: {
        findMany: async (input: unknown) => {
          findManyCalls.push(input);
          return [{
            channel: "Telegram",
            conversationId: "vladimir",
            createdAt: new Date("2026-06-29T14:00:01.000Z"),
            eventKind: "rescue",
            fromOperatorId: null,
            id: "analytics_prisma_rescue_vladimir",
            occurredAt: new Date("2026-06-29T14:00:00.000Z"),
            source: "api",
            tenantId: "tenant-volga",
            toOperatorId: "operator-kirill"
          }];
        },
        upsert: async (input: { create: Record<string, unknown> }) => {
          upsertCalls.push(input);
          return {
            ...input.create,
            createdAt: new Date("2026-06-29T14:05:01.000Z")
          };
        }
      },
      routingRule: {}
    } as any;
    const fallback = RoutingRepository.inMemory();
    const repository = RoutingRepository.prisma({ client, fallback });

    const listed = await repository.listRoutingAnalyticsRows({
      eventKind: "rescue",
      tenantId: "tenant-volga"
    });
    const saved = await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "auto_return",
      fromOperatorId: "operator-kirill",
      id: "analytics_prisma_auto_return_vladimir",
      occurredAt: "2026-06-29T14:05:00.000Z",
      source: "rescue-return-worker",
      tenantId: "tenant-volga",
      toOperatorId: null
    });

    assert.deepEqual(listed.map((row) => row.id), ["analytics_prisma_rescue_vladimir"]);
    assert.equal(saved.id, "analytics_prisma_auto_return_vladimir");
    assert.equal(saved.occurredAt, "2026-06-29T14:05:00.000Z");
    assert.equal(findManyCalls.length, 1);
    assert.equal(upsertCalls.length, 1);
    assert.deepEqual(fallback.listRoutingAnalyticsRows({ tenantId: "tenant-volga" }), []);
  });

  it("starts rescue with a server-owned timer and blocks closed dialogs", async () => {
    const worker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const repository = RoutingRepository.inMemory(bootstrapRoutingState());
    const routing = new RoutingService(repository);

    const closed = await routing.startRescue({
      conversationId: "closed-dialog",
      reason: "Manual escalation"
    }, VOLGA_CONTEXT);
    assert.equal(closed.status, "denied");
    assert.equal(closed.error?.code, "conversation_closed");

    const rescue = await routing.startRescue({
      conversationId: "vladimir",
      durationSeconds: 1,
      reason: "No operator answer after accept",
      source: "manual"
    }, VOLGA_CONTEXT);
    assert.equal(rescue.status, "ok");
    assert.equal(rescue.data.conversation.status, "assigned");
    assert.equal(rescue.data.conversation.slaTone, "danger");
    assert.equal(rescue.data.rescue.state, "active");
    assert.equal(rescue.data.rescue.durationSeconds, 240);
    assert.equal(typeof rescue.data.rescue.startedAt, "number");
    assert.equal(typeof rescue.data.rescue.deadlineAt, "number");
    assert.equal(rescue.data.rescue.deadlineAt - rescue.data.rescue.startedAt, 240_000);
    assert.equal(rescue.data.schedulerJob.action, "return_to_sla_queue");
    assert.equal(rescue.data.schedulerJob.conversationId, "vladimir");
    assert.equal(rescue.data.schedulerJob.queue, "rescue-return");
    assert.equal(rescue.data.schedulerJob.status, "pending");
    assert.equal(rescue.data.schedulerJob.tenantId, "tenant-volga");
    assert.equal(typeof rescue.data.schedulerJob.runAt, "number");
    assert.equal(rescue.data.realtimeEvent.eventName, "rescue.started");

    const duplicateStart = await routing.startRescue({
      conversationId: "vladimir",
      reason: "Repeated start"
    }, VOLGA_CONTEXT);
    assert.equal(duplicateStart.status, "conflict");
    assert.equal(duplicateStart.error?.code, "rescue_already_active");
    assert.equal(duplicateStart.data.rescue.deadlineAt, rescue.data.rescue.deadlineAt);

    const claimed = await worker.claimExpiredRescueReturnJobs({
      now: new Date(rescue.data.schedulerJob.runAt + 1),
      routingRepository: repository
    });
    assert.deepEqual(claimed.claimed.map((job) => job.id), [rescue.data.schedulerJob.id]);
    assert.equal(claimed.claimed[0].conversationId, "vladimir");
    assert.equal(claimed.claimed[0].tenantId, "tenant-volga");
  });

  it("reclaims an expired SLA claim after a worker crash but not before lease expiry", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      ...bootstrapRoutingState(),
      jobs: [{
        action: "resume_sla",
        conversationId: "maria",
        id: "job_sla_crash_reclaim",
        queue: "sla-timers",
        runAt: "2026-07-11T09:00:00.000Z",
        status: "pending",
        tenantId: "tenant-volga"
      }]
    });
    const first = await worker.claimDueSlaTimerJobs({
      leaseDurationMs: 30_000,
      now: new Date("2026-07-11T09:01:00.000Z"),
      routingRepository: repository,
      workerId: "sla-worker-crashed"
    });
    const early = await worker.claimDueSlaTimerJobs({
      leaseDurationMs: 30_000,
      now: new Date("2026-07-11T09:01:29.999Z"),
      routingRepository: repository,
      workerId: "sla-worker-recovery"
    });
    const recovered = await worker.claimDueSlaTimerJobs({
      leaseDurationMs: 30_000,
      now: new Date("2026-07-11T09:01:30.000Z"),
      routingRepository: repository,
      workerId: "sla-worker-recovery"
    });

    assert.equal(first.claimed[0]?.leaseOwner, "sla-worker-crashed");
    assert.deepEqual(early.claimed, []);
    assert.equal(recovered.claimed[0]?.leaseOwner, "sla-worker-recovery");
  });

  it("allows only one of two workers to reclaim the same expired job", async () => {
    const worker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const repository = RoutingRepository.inMemory({
      ...bootstrapRoutingState(),
      jobs: [{
        action: "resume_sla",
        claimedAt: "2026-07-11T09:00:00.000Z",
        conversationId: "maria",
        id: "job_sla_reclaim_race",
        leaseExpiresAt: "2026-07-11T09:00:30.000Z",
        leaseOwner: "sla-worker-crashed",
        queue: "sla-timers",
        runAt: "2026-07-11T09:00:00.000Z",
        status: "claimed",
        tenantId: "tenant-volga"
      }]
    });
    const now = new Date("2026-07-11T09:01:00.000Z");
    const [left, right] = await Promise.all([
      worker.claimDueSlaTimerJobs({ leaseDurationMs: 30_000, now, routingRepository: repository, workerId: "sla-worker-left" }),
      worker.claimDueSlaTimerJobs({ leaseDurationMs: 30_000, now, routingRepository: repository, workerId: "sla-worker-right" })
    ]);

    assert.equal(left.claimed.length + right.claimed.length, 1);
    assert.equal(["sla-worker-left", "sla-worker-right"].includes(repository.listJobs()[0]?.leaseOwner ?? ""), true);
  });

  it("fences stale SLA and rescue workers after another worker reclaims their jobs", async () => {
    const slaWorker = await import("../apps/api-gateway/src/routing/sla-timer.worker.ts");
    const rescueWorker = await import("../apps/api-gateway/src/routing/rescue-return.worker.ts");
    const state = bootstrapRoutingState();
    state.conversations = state.conversations.map((conversation) => conversation.id === "maria"
      ? { ...conversation, slaTone: "hold" as const, status: "paused" as const }
      : conversation.id === "vladimir"
        ? {
            ...conversation,
            rescue: {
              deadlineAt: new Date("2026-07-11T09:00:00.000Z").getTime(),
              durationSeconds: 240,
              nextAction: "reply_or_return_to_sla_queue",
              reason: "Lease fencing rescue",
              source: "manual",
              startedAt: new Date("2026-07-11T08:56:00.000Z").getTime(),
              state: "active" as const
            },
            status: "assigned" as const
          }
        : conversation);
    state.jobs = [{
      action: "resume_sla",
      claimedAt: "2026-07-11T09:00:00.000Z",
      conversationId: "maria",
      id: "job_sla_fenced",
      leaseExpiresAt: "2026-07-11T09:00:30.000Z",
      leaseOwner: "old-sla-worker",
      queue: "sla-timers",
      status: "claimed",
      tenantId: "tenant-volga"
    }, {
      action: "return_to_sla_queue",
      claimedAt: "2026-07-11T09:00:00.000Z",
      conversationId: "vladimir",
      id: "job_rescue_fenced",
      leaseExpiresAt: "2026-07-11T09:00:30.000Z",
      leaseOwner: "old-rescue-worker",
      queue: "rescue-return",
      status: "claimed",
      tenantId: "tenant-volga"
    }];
    const repository = RoutingRepository.inMemory(state);
    const oldSlaJob = repository.listJobs().find((job) => job.id === "job_sla_fenced")!;
    const oldRescueJob = repository.listJobs().find((job) => job.id === "job_rescue_fenced")!;
    const now = new Date("2026-07-11T09:01:00.000Z");
    await slaWorker.claimDueSlaTimerJobs({ now, routingRepository: repository, workerId: "new-sla-worker" });
    await rescueWorker.claimExpiredRescueReturnJobs({ now, routingRepository: repository, workerId: "new-rescue-worker" });

    const oldSlaTransition = slaWorker.planSlaTimerTransition({ conversation: state.conversations.find((item) => item.id === "maria")!, job: oldSlaJob, now });
    const staleSla = await slaWorker.applySlaTimerTransition({ completedAt: now, routingRepository: repository, transition: oldSlaTransition });
    const staleRescue = await rescueWorker.applyRescueReturnTransition({ completedAt: now, job: oldRescueJob, routingRepository: repository });

    assert.equal(staleSla.status, "skipped");
    assert.equal(staleSla.reason, "lease_lost");
    assert.equal(staleRescue.status, "skipped");
    assert.equal(staleRescue.reason, "lease_lost");
    assert.equal(repository.readState().conversations.find((item) => item.id === "maria")?.status, "paused");
    assert.equal(repository.readState().conversations.find((item) => item.id === "vladimir")?.rescue?.state, "active");
  });

  it("cancels the original pending or claimed rescue timer on manual resolution", async () => {
    for (const initialStatus of ["pending", "claimed"] as const) {
      const repository = RoutingRepository.inMemory(bootstrapRoutingState());
      const routing = new RoutingService(repository);
      const started = await routing.startRescue({
        conversationId: "vladimir",
        reason: "No operator answer after accept"
      }, VOLGA_CONTEXT);
      const originalJob = started.data.schedulerJob;

      if (initialStatus === "claimed") {
        await repository.claimJob({
          claimedAt: new Date().toISOString(),
          expectedStatus: "pending",
          jobId: originalJob.id,
          queue: "rescue-return"
        });
      }

      const resolved = await routing.resolveRescue({
        conversationId: "vladimir",
        outcome: "saved",
        reason: "Operator answered manually"
      }, VOLGA_CONTEXT);
      const jobs = repository.listJobs();

      assert.equal(resolved.status, "ok");
      assert.equal(resolved.data.queueJob.id, originalJob.id);
      assert.equal(resolved.data.queueJob.status, "canceled");
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].id, originalJob.id);
      assert.equal(jobs[0].status, "canceled");
      assert.equal(typeof jobs[0].completedAt, "string");
    }
  });

  it("updates rescue workload counters and validates rescue outcomes", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const beforeKirill = before.data.operators.find((operator) => operator.id === "operator-kirill");
    const beforeTotalRescue = before.data.totals.rescueActive;

    await routing.startRescue({
      conversationId: "vladimir",
      reason: "No operator answer after accept"
    }, VOLGA_CONTEXT);

    const afterStart = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const startKirill = afterStart.data.operators.find((operator) => operator.id === "operator-kirill");
    assert.equal(startKirill.rescueActive, beforeKirill.rescueActive + 1);
    assert.equal(afterStart.data.totals.rescueActive, beforeTotalRescue + 1);

    const unsupportedOutcome = await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "bogus",
      reason: "Invalid runtime payload"
    }, VOLGA_CONTEXT);
    assert.equal(unsupportedOutcome.status, "invalid");
    assert.equal(unsupportedOutcome.error?.code, "rescue_outcome_unsupported");

    await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "saved",
      reason: "Operator answered"
    }, VOLGA_CONTEXT);

    const afterResolve = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const resolveKirill = afterResolve.data.operators.find((operator) => operator.id === "operator-kirill");
    assert.equal(resolveKirill.rescueActive, beforeKirill.rescueActive);
    assert.equal(afterResolve.data.totals.rescueActive, beforeTotalRescue);
  });

  it("resolves rescue into queue and exposes a report-ready descriptor", async () => {
    const routing = new RoutingService();

    const started = await routing.startRescue({
      conversationId: "vladimir",
      reason: "No operator answer after accept"
    }, VOLGA_CONTEXT);
    const resolved = await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "returned_to_queue",
      reason: "Timer expired"
    }, VOLGA_CONTEXT);

    assert.equal(resolved.status, "ok");
    assert.equal(resolved.data.rescue.state, "returned_to_queue");
    assert.equal(resolved.data.conversation.status, "queued");
    assert.equal(resolved.data.queueJob.action, "return_to_sla_queue");
    assert.equal(resolved.data.queueJob.conversationId, "vladimir");
    assert.equal(resolved.data.queueJob.queue, "rescue-return");
    assert.equal(resolved.data.queueJob.id, started.data.schedulerJob.id);
    assert.equal(resolved.data.queueJob.status, "canceled");
    assert.equal(resolved.data.reportEvent.eventName, "rescue.report.ready");
    assert.equal(resolved.data.reportEvent.digest, "daily_rescue");

    const report = await routing.fetchRescueReport({ period: "today" }, VOLGA_CONTEXT);
    assert.equal(report.status, "ok");
    assert.ok(report.data.outcomeSummary.some((item) => item.label === "returned_to_queue"));
    assert.ok(report.data.rows.some((row) => row.conversationId === "vladimir" && row.operatorId === "operator-kirill"));
    assert.equal(report.data.exportDescriptor.metricDefinitionVersion, "routing-rescue-v1");
  });

  it("exposes tenant-scoped rescue analytics aggregates in rescue reports", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "rescue",
      fromOperatorId: null,
      id: "analytics_report_rescue",
      occurredAt: "2026-06-29T15:00:00.000Z",
      source: "manual",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "auto_return",
      fromOperatorId: "operator-kirill",
      id: "analytics_report_auto_return",
      occurredAt: "2026-06-29T15:04:00.000Z",
      source: "rescue-return-worker",
      tenantId: "tenant-volga",
      toOperatorId: null
    });
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "vladimir",
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics_report_assignment",
      occurredAt: "2026-06-29T14:59:00.000Z",
      source: "api",
      tenantId: "tenant-volga",
      toOperatorId: "operator-kirill"
    });
    await repository.saveRoutingAnalyticsRow({
      channel: "Telegram",
      conversationId: "foreign",
      eventKind: "auto_return",
      fromOperatorId: "operator-ivan",
      id: "analytics_report_foreign_tenant",
      occurredAt: "2026-06-29T15:05:00.000Z",
      source: "rescue-return-worker",
      tenantId: "tenant-ladoga",
      toOperatorId: null
    });
    const routing = new RoutingService(repository);

    const report = await routing.fetchRescueReport({ period: "today" }, VOLGA_CONTEXT);

    assert.deepEqual(report.data.routingAnalytics, {
      byEventKind: {
        assignment: 0,
        auto_return: 1,
        rescue: 1,
        transfer: 0
      },
      channel: "all",
      tenantId: "tenant-volga",
      totalEvents: 2
    });
  });

  it("updates workload counters when rescue auto-returns an assigned dialog", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const beforeKirill = before.data.operators.find((operator) => operator.id === "operator-kirill");
    const beforeQueue = before.data.queues[0];

    await routing.startRescue({
      conversationId: "vladimir",
      reason: "No operator answer after accept"
    }, VOLGA_CONTEXT);
    await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "returned_to_queue",
      reason: "Timer expired"
    }, VOLGA_CONTEXT);

    const after = await routing.fetchWorkload({ channel: "Telegram" }, VOLGA_CONTEXT);
    const afterKirill = after.data.operators.find((operator) => operator.id === "operator-kirill");
    const afterQueue = after.data.queues[0];

    assert.equal(afterKirill.chats, beforeKirill.chats - 1);
    assert.equal(afterQueue.active, beforeQueue.active - 1);
    assert.equal(afterQueue.waiting, beforeQueue.waiting + 1);
  });

  it("balances queue counters when rescue starts from a queued dialog", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);
    const beforeQueue = before.data.queues[0];
    const beforeRescueTotal = before.data.totals.rescueActive;

    await routing.startRescue({
      conversationId: "alexey",
      reason: "Queue SLA risk"
    }, VOLGA_CONTEXT);

    const afterStart = await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);
    const startQueue = afterStart.data.queues[0];
    assert.equal(startQueue.active, beforeQueue.active + 1);
    assert.equal(startQueue.waiting, beforeQueue.waiting - 1);
    assert.equal(afterStart.data.totals.rescueActive, beforeRescueTotal);

    await routing.resolveRescue({
      conversationId: "alexey",
      outcome: "returned_to_queue",
      reason: "Timer expired"
    }, VOLGA_CONTEXT);

    const afterResolve = await routing.fetchWorkload({ channel: "VK" }, VOLGA_CONTEXT);
    const resolveQueue = afterResolve.data.queues[0];
    assert.equal(resolveQueue.active, beforeQueue.active);
    assert.equal(resolveQueue.waiting, beforeQueue.waiting);
    assert.equal(afterResolve.data.totals.rescueActive, beforeRescueTotal);
  });
});
