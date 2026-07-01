import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolveRoutingStoreFile } from "../apps/api-gateway/src/routing/bootstrap.ts";
import {
  rescueReportSeedRows,
  routingConversationFixtures,
  routingOperatorFixtures,
  routingQueueFixtures
} from "../apps/api-gateway/src/routing/routing.fixtures.ts";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { RoutingService } from "../apps/api-gateway/src/routing/routing.service.ts";

describe("phase 4 routing, SLA and rescue backend contracts", () => {
  beforeEach(() => {
    RoutingRepository.useDefault(RoutingRepository.inMemory());
  });

  afterEach(() => {
    RoutingRepository.clearDefault();
  });

  it("lists operator workload and queue health with frontend-compatible fields", async () => {
    const routing = new RoutingService();

    const workload = await routing.fetchWorkload({ channel: "VK" });

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

    await routing.fetchWorkload({ channel: "VK" });
    await routing.fetchWorkload({ channel: "Telegram" });

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

    const workload = await routing.fetchWorkload({ channel: "Telegram" });

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
    const repository = RoutingRepository.inMemory();
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

    const workload = await routing.fetchWorkload({ channel: "VK" });
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
    });
    assert.equal(assignment.status, "denied");
    assert.equal(assignment.error?.code, "operator_limit_exceeded");
    assert.equal(assignment.data.limit, 0);
  });

  it("uses active queue memberships as channel access grants", async () => {
    const repository = RoutingRepository.inMemory();
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

    const workload = await routing.fetchWorkload({ channel: "VK" });
    const ivan = workload.data.operators.find((operator) => operator.id === "operator-ivan");
    assert.ok(ivan);
    assert.ok(ivan.channels.includes("VK"));
    assert.equal(ivan.canReceive, true);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Persisted queue membership",
      targetOperatorId: "operator-ivan"
    });
    assert.equal(assignment.status, "ok");
    assert.equal(assignment.data.assignment.targetOperatorId, "operator-ivan");
  });

  it("simulates assignment candidates with validated workload, access and capacity inputs", async () => {
    const repository = RoutingRepository.inMemory();
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

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

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

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

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

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

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

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

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
    const repository = RoutingRepository.inMemory();
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

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

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
    const repository = RoutingRepository.inMemory();
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

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

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
    assert.match(controllerSource, /return this\.routingService\.simulateAssignment\(payload\);/);

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });

    assert.equal(simulation.status, "ok");
    assert.equal(simulation.operation, "simulateAssignment");
    assert.equal(simulation.data.conversationId, "alexey");
    assert.ok(Array.isArray(simulation.data.candidates));
  });

  it("keeps assignment simulation from mutating live assignment state or queue jobs", async () => {
    const repository = RoutingRepository.inMemory({
      conversations: JSON.parse(JSON.stringify(routingConversationFixtures)),
      jobs: [],
      operatorCapacities: [],
      operators: JSON.parse(JSON.stringify(routingOperatorFixtures)),
      queueMemberships: [],
      queues: JSON.parse(JSON.stringify(routingQueueFixtures)),
      rescueReportRows: JSON.parse(JSON.stringify(rescueReportSeedRows)),
      routingRules: []
    });
    const routing = new RoutingService(repository);
    const before = repository.readState();

    const simulation = await routing.simulateAssignment({ conversationId: "alexey" });
    const after = repository.readState();

    assert.equal(simulation.status, "ok");
    assert.deepEqual(after, before);
    assert.deepEqual(repository.listJobs(), []);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Simulation did not mutate state",
      targetOperatorId: "operator-anna"
    });
    assert.equal(assignment.status, "ok");
    assert.equal(assignment.data.assignment.targetOperatorId, "operator-anna");
    assert.equal(assignment.data.conversation.status, "assigned");
  });

  it("writes assignment routing analytics rows when assigning a conversation", async () => {
    const repository = RoutingRepository.inMemory();
    const routing = new RoutingService(repository);

    const assignment = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Analytics assignment runtime",
      targetOperatorId: "operator-anna"
    });
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
    const repository = RoutingRepository.inMemory();
    const routing = new RoutingService(repository);

    const transfer = await routing.createAssignment({
      action: "transfer",
      conversationId: "vladimir",
      reason: "Analytics transfer runtime",
      targetOperatorId: "operator-ivan"
    });
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
    const repository = RoutingRepository.inMemory();
    const routing = new RoutingService(repository);

    const rescue = await routing.startRescue({
      conversationId: "vladimir",
      reason: "Analytics rescue runtime",
      source: "manual"
    });
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
    });
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
    });
    assert.equal(limitDenied.status, "denied");
    assert.equal(limitDenied.error?.code, "operator_limit_exceeded");
    assert.equal(limitDenied.data.availableCapacity, 0);

    const clientOverrideDenied = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      overrideLimit: true,
      reason: "Senior redistribution",
      targetOperatorId: "operator-full"
    });
    assert.equal(clientOverrideDenied.status, "denied");
    assert.equal(clientOverrideDenied.error?.code, "operator_limit_exceeded");
    assert.equal(clientOverrideDenied.data.overrideRequested, true);
    assert.equal(clientOverrideDenied.data.overrideSupported, false);

    const unsupportedAction = await routing.createAssignment({
      action: "rotate",
      conversationId: "alexey",
      reason: "Senior redistribution",
      targetOperatorId: "operator-anna"
    });
    assert.equal(unsupportedAction.status, "invalid");
    assert.equal(unsupportedAction.error?.code, "assignment_action_unsupported");

    const assigned = await routing.createAssignment({
      action: "assign",
      conversationId: "alexey",
      reason: "Senior redistribution",
      targetOperatorId: "operator-anna"
    });
    assert.equal(assigned.status, "ok");
    assert.equal(assigned.data.assignment.action, "assign");
    assert.equal(assigned.data.assignment.targetOperatorId, "operator-anna");
    assert.equal(assigned.data.conversation.status, "assigned");
    assert.equal(assigned.data.auditEvent.immutable, true);
    assert.equal(assigned.data.queueJob.kind, "assignment.commit");
  });

  it("keeps operator and queue counters consistent across transfer and return-to-queue", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "Telegram" });
    const beforeIvan = before.data.operators.find((operator) => operator.id === "operator-ivan");
    const beforeKirill = before.data.operators.find((operator) => operator.id === "operator-kirill");
    const beforeQueue = before.data.queues[0];

    const transferred = await routing.createAssignment({
      action: "transfer",
      conversationId: "vladimir",
      reason: "Senior transfer",
      targetOperatorId: "operator-ivan"
    });
    assert.equal(transferred.status, "ok");
    assert.equal(transferred.data.assignment.fromOperatorId, "operator-kirill");
    assert.equal(transferred.data.assignment.targetOperatorId, "operator-ivan");
    assert.equal(transferred.data.conversation.status, "transferred");

    const afterTransfer = await routing.fetchWorkload({ channel: "Telegram" });
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
    });
    assert.equal(returned.status, "ok");
    assert.equal(returned.data.assignment.fromOperatorId, "operator-ivan");
    assert.equal(returned.data.assignment.targetOperatorId, null);

    const afterReturn = await routing.fetchWorkload({ channel: "Telegram" });
    const returnIvan = afterReturn.data.operators.find((operator) => operator.id === "operator-ivan");
    const returnQueue = afterReturn.data.queues[0];

    assert.equal(returnIvan.chats, beforeIvan.chats);
    assert.equal(returnQueue.active, beforeQueue.active - 1);
    assert.equal(returnQueue.waiting, beforeQueue.waiting + 1);
  });

  it("requires an explicit SLA pause reason and creates a resume job", async () => {
    const routing = new RoutingService();

    const missingReason = await routing.pauseSla({
      conversationId: "maria",
      durationMinutes: 15,
      reason: ""
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "sla_pause_reason_required");

    const paused = await routing.pauseSla({
      conversationId: "maria",
      durationMinutes: 15,
      reason: "Customer requested a short hold"
    });
    assert.equal(paused.status, "ok");
    assert.equal(paused.data.conversation.status, "paused");
    assert.equal(paused.data.sla.state, "paused");
    assert.equal(paused.data.sla.durationMinutes, 15);
    assert.equal(paused.data.schedulerJob.queue, "sla-timers");
    assert.equal(paused.data.auditEvent.action, "sla.pause");
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

    const result = worker.claimDueSlaTimerJobs({
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "resume_sla",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_resume_claimed",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed"
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
    const applied = worker.applySlaTimerTransition({
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "mark_sla_overdue",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_overdue_claimed",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed"
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
    const applied = worker.applySlaTimerTransition({
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "mark_sla_overdue",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_overdue_descriptor",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed"
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

    const applied = worker.applySlaTimerTransition({
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "mark_sla_overdue",
        claimedAt: "2026-06-29T13:16:00.000Z",
        id: "job_sla_overdue_realtime",
        queue: "sla-timers",
        runAt: "2026-06-29T13:15:00.000Z",
        status: "claimed"
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

    const applied = worker.applySlaTimerTransition({
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

    const failed = worker.recordSlaTimerJobFailure({
      error: new Error("routing store unavailable"),
      failedAt,
      maxAttempts: 3,
      retryBackoffMs: 60_000,
      routingRepository: repository,
      jobId: "job_sla_retryable"
    });
    const earlyRetry = worker.claimDueSlaTimerJobs({
      now: new Date("2026-06-29T13:20:30.000Z"),
      routingRepository: repository
    });
    const readyRetry = worker.claimDueSlaTimerJobs({
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

    const failed = worker.recordSlaTimerJobFailure({
      error: "routing store unavailable",
      failedAt,
      maxAttempts: 3,
      retryBackoffMs: 60_000,
      routingRepository: repository,
      jobId: "job_sla_dead_letter"
    });
    const retry = worker.claimDueSlaTimerJobs({
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

    const result = worker.claimDueSlaTimerJobs({
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
      saveJob(job: Record<string, unknown>): Record<string, unknown> {
        savedJob = job;
        return job;
      }
    };

    const result = worker.claimDueSlaTimerJobs({
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

    const result = worker.claimExpiredRescueReturnJobs({
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
      saveJob(job: Record<string, unknown>): Record<string, unknown> {
        savedJob = job;
        return job;
      }
    };

    const result = worker.claimExpiredRescueReturnJobs({
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_claimed",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed"
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

    const applied = worker.applyRescueReturnTransition({
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

    const skipped = worker.applyRescueReturnTransition({
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

    const skipped = worker.applyRescueReturnTransition({
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

    const wrongQueue = worker.applyRescueReturnTransition({
      job: wrongQueueRepository.listJobs()[0],
      routingRepository: wrongQueueRepository
    });
    const wrongAction = worker.applyRescueReturnTransition({
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_outcome",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed"
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

    worker.applyRescueReturnTransition({
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
      tenantId: "tenant-volga"
    });
    assert.equal(Boolean(analyticsRow), true);
    assert.equal(analyticsRow.conversationId, "vladimir");
    assert.equal(analyticsRow.channel, "Telegram");
    assert.equal(analyticsRow.fromOperatorId, "operator-kirill");
    assert.equal(analyticsRow.toOperatorId, null);
    assert.equal(analyticsRow.source, "rescue-return-worker");
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
        topic: "Delivery / Status"
      }],
      jobs: [{
        action: "return_to_sla_queue",
        claimedAt: "2026-06-29T13:34:00.000Z",
        conversationId: "vladimir",
        id: "job_rescue_return_realtime",
        queue: "rescue-return",
        runAt: "2026-06-29T13:34:00.000Z",
        status: "claimed"
      }],
      operatorCapacities: [],
      operators: [],
      queueMemberships: [],
      queues: [],
      rescueReportRows: [],
      routingRules: []
    });

    const applied = worker.applyRescueReturnTransition({
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
        status: "claimed"
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

    const applied = worker.applyRescueReturnTransition({
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
    const routing = new RoutingService();

    const closed = await routing.startRescue({
      conversationId: "closed-dialog",
      reason: "Manual escalation"
    });
    assert.equal(closed.status, "denied");
    assert.equal(closed.error?.code, "conversation_closed");

    const rescue = await routing.startRescue({
      conversationId: "vladimir",
      durationSeconds: 1,
      reason: "No operator answer after accept",
      source: "manual"
    });
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
    assert.equal(rescue.data.realtimeEvent.eventName, "rescue.started");

    const duplicateStart = await routing.startRescue({
      conversationId: "vladimir",
      reason: "Repeated start"
    });
    assert.equal(duplicateStart.status, "conflict");
    assert.equal(duplicateStart.error?.code, "rescue_already_active");
    assert.equal(duplicateStart.data.rescue.deadlineAt, rescue.data.rescue.deadlineAt);
  });

  it("updates rescue workload counters and validates rescue outcomes", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "Telegram" });
    const beforeKirill = before.data.operators.find((operator) => operator.id === "operator-kirill");
    const beforeTotalRescue = before.data.totals.rescueActive;

    await routing.startRescue({
      conversationId: "vladimir",
      reason: "No operator answer after accept"
    });

    const afterStart = await routing.fetchWorkload({ channel: "Telegram" });
    const startKirill = afterStart.data.operators.find((operator) => operator.id === "operator-kirill");
    assert.equal(startKirill.rescueActive, beforeKirill.rescueActive + 1);
    assert.equal(afterStart.data.totals.rescueActive, beforeTotalRescue + 1);

    const unsupportedOutcome = await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "bogus",
      reason: "Invalid runtime payload"
    });
    assert.equal(unsupportedOutcome.status, "invalid");
    assert.equal(unsupportedOutcome.error?.code, "rescue_outcome_unsupported");

    await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "saved",
      reason: "Operator answered"
    });

    const afterResolve = await routing.fetchWorkload({ channel: "Telegram" });
    const resolveKirill = afterResolve.data.operators.find((operator) => operator.id === "operator-kirill");
    assert.equal(resolveKirill.rescueActive, beforeKirill.rescueActive);
    assert.equal(afterResolve.data.totals.rescueActive, beforeTotalRescue);
  });

  it("resolves rescue into queue and exposes a report-ready descriptor", async () => {
    const routing = new RoutingService();

    await routing.startRescue({
      conversationId: "vladimir",
      reason: "No operator answer after accept"
    });
    const resolved = await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "returned_to_queue",
      reason: "Timer expired"
    });

    assert.equal(resolved.status, "ok");
    assert.equal(resolved.data.rescue.state, "returned_to_queue");
    assert.equal(resolved.data.conversation.status, "queued");
    assert.equal(resolved.data.queueJob.action, "return_to_sla_queue");
    assert.equal(resolved.data.queueJob.conversationId, "vladimir");
    assert.equal(resolved.data.queueJob.queue, "rescue-return");
    assert.equal(resolved.data.queueJob.status, "pending");
    assert.equal(resolved.data.reportEvent.eventName, "rescue.report.ready");
    assert.equal(resolved.data.reportEvent.digest, "daily_rescue");

    const report = await routing.fetchRescueReport({ period: "today" });
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

    const report = await routing.fetchRescueReport({ period: "today" });

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

  it("isolates default routing store files by service, environment and port", () => {
    const first = resolveRoutingStoreFile({
      NODE_ENV: "test",
      PORT: "4101",
      SERVICE_NAME: "api-gateway"
    });
    const second = resolveRoutingStoreFile({
      NODE_ENV: "test",
      PORT: "4102",
      SERVICE_NAME: "api-gateway"
    });

    assert.notEqual(first, second);
    assert.match(first, /api-gateway-test-4101-routing\.json$/);
    assert.match(second, /api-gateway-test-4102-routing\.json$/);
  });

  it("updates workload counters when rescue auto-returns an assigned dialog", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "Telegram" });
    const beforeKirill = before.data.operators.find((operator) => operator.id === "operator-kirill");
    const beforeQueue = before.data.queues[0];

    await routing.startRescue({
      conversationId: "vladimir",
      reason: "No operator answer after accept"
    });
    await routing.resolveRescue({
      conversationId: "vladimir",
      outcome: "returned_to_queue",
      reason: "Timer expired"
    });

    const after = await routing.fetchWorkload({ channel: "Telegram" });
    const afterKirill = after.data.operators.find((operator) => operator.id === "operator-kirill");
    const afterQueue = after.data.queues[0];

    assert.equal(afterKirill.chats, beforeKirill.chats - 1);
    assert.equal(afterQueue.active, beforeQueue.active - 1);
    assert.equal(afterQueue.waiting, beforeQueue.waiting + 1);
  });

  it("balances queue counters when rescue starts from a queued dialog", async () => {
    const routing = new RoutingService();

    const before = await routing.fetchWorkload({ channel: "VK" });
    const beforeQueue = before.data.queues[0];
    const beforeRescueTotal = before.data.totals.rescueActive;

    await routing.startRescue({
      conversationId: "alexey",
      reason: "Queue SLA risk"
    });

    const afterStart = await routing.fetchWorkload({ channel: "VK" });
    const startQueue = afterStart.data.queues[0];
    assert.equal(startQueue.active, beforeQueue.active + 1);
    assert.equal(startQueue.waiting, beforeQueue.waiting - 1);
    assert.equal(afterStart.data.totals.rescueActive, beforeRescueTotal);

    await routing.resolveRescue({
      conversationId: "alexey",
      outcome: "returned_to_queue",
      reason: "Timer expired"
    });

    const afterResolve = await routing.fetchWorkload({ channel: "VK" });
    const resolveQueue = afterResolve.data.queues[0];
    assert.equal(resolveQueue.active, beforeQueue.active);
    assert.equal(resolveQueue.waiting, beforeQueue.waiting);
    assert.equal(afterResolve.data.totals.rescueActive, beforeRescueTotal);
  });
});
