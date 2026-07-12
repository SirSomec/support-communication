import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  RoutingRepository,
  type OperatorCapacityRecord,
  type QueueMembershipRecord,
  type QueueMembershipRole,
  type RoutingLimitMode,
  type RoutingPriorityStrategy,
  type RoutingRuleRecord
} from "../apps/api-gateway/src/routing/routing.repository.ts";
import { bootstrapRoutingState } from "../apps/api-gateway/src/routing/seed.ts";

describe("Phase 4.1 routing rule, queue membership and operator capacity repository contracts", () => {
  it("starts empty unless a routing seed is explicitly injected", () => {
    const empty = RoutingRepository.inMemory().readState();
    const seeded = RoutingRepository.inMemory(bootstrapRoutingState()).readState();

    assert.deepEqual(empty.conversations, []);
    assert.deepEqual(empty.operators, []);
    assert.deepEqual(empty.queues, []);
    assert.deepEqual(empty.rescueReportRows, []);
    assert.ok(seeded.conversations.length > 0);
    assert.ok(seeded.operators.length > 0);
    assert.ok(seeded.queues.length > 0);
  });

  it("persists tenant routing rules with channel-scoped lookup", async () => {
    const repository = RoutingRepository.inMemory();
    const rule = routingRule({
      channel: "VK",
      id: "rule_vk_default",
      limitMode: "operator_channel_limit",
      priorityStrategy: "least_loaded",
      tenantId: "tenant-volga",
      waitThresholdSeconds: 180
    });

    const saved = await repository.saveRoutingRule(rule);
    const refetched = await repository.findRoutingRule("rule_vk_default", { tenantId: "tenant-volga" });
    const byChannel = await repository.findRoutingRuleByChannel("tenant-volga", "VK");
    const rules = await repository.listRoutingRules({ tenantId: "tenant-volga" });

    assert.equal(saved.id, "rule_vk_default");
    assert.equal(refetched?.limitMode, "operator_channel_limit");
    assert.equal(byChannel?.waitThresholdSeconds, 180);
    assert.deepEqual(rules.map((item) => item.id), ["rule_vk_default"]);
  });

  it("persists queue membership rows with operator and queue filters", async () => {
    const repository = RoutingRepository.inMemory();
    const membership = queueMembership({
      id: "membership_vk_anna",
      operatorId: "operator-anna",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga"
    });

    const saved = await repository.saveQueueMembership(membership);
    const refetched = await repository.findQueueMembership("membership_vk_anna", { tenantId: "tenant-volga" });
    const byQueue = await repository.listQueueMemberships({ queueId: "VK", tenantId: "tenant-volga" });
    const byOperator = await repository.listQueueMemberships({ operatorId: "operator-anna", tenantId: "tenant-volga" });

    assert.equal(saved.role, "primary");
    assert.equal(refetched?.active, true);
    assert.deepEqual(byQueue.map((item) => item.id), ["membership_vk_anna"]);
    assert.deepEqual(byOperator.map((item) => item.id), ["membership_vk_anna"]);
  });

  it("persists operator capacity rows with channel-scoped lookup", async () => {
    const repository = RoutingRepository.inMemory();
    const capacity = operatorCapacity({
      channel: "VK",
      chatLimit: 12,
      id: "capacity_vk_anna",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-volga"
    });

    const saved = await repository.saveOperatorCapacity(capacity);
    const refetched = await repository.findOperatorCapacity("capacity_vk_anna", { tenantId: "tenant-volga" });
    const byOperatorChannel = await repository.findOperatorCapacityByOperatorChannel("tenant-volga", "operator-anna", "VK");
    const capacities = await repository.listOperatorCapacities({ tenantId: "tenant-volga" });

    assert.equal(saved.chatLimit, 12);
    assert.equal(refetched?.overrideAllowed, false);
    assert.equal(byOperatorChannel?.id, "capacity_vk_anna");
    assert.deepEqual(capacities.map((item) => item.id), ["capacity_vk_anna"]);
  });

  it("persists routing rules, queue membership and operator capacity across JSON repository instances", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "support-routing-json-"));
    const storeFile = join(workspace, "routing.json");
    try {
      const first = RoutingRepository.open({ filePath: storeFile });
      await first.saveRoutingRule(routingRule({ channel: "SDK", id: "rule_sdk", tenantId: "tenant-volga" }));
      await first.saveQueueMembership(queueMembership({ id: "membership_sdk_ivan", operatorId: "operator-ivan", queueId: "SDK", tenantId: "tenant-volga" }));
      await first.saveOperatorCapacity(operatorCapacity({ channel: "SDK", id: "capacity_sdk_ivan", operatorId: "operator-ivan", tenantId: "tenant-volga" }));

      const second = RoutingRepository.open({ filePath: storeFile });
      assert.equal((await second.findRoutingRule("rule_sdk", { tenantId: "tenant-volga" }))?.channel, "SDK");
      assert.deepEqual((await second.listQueueMemberships({ tenantId: "tenant-volga" })).map((item) => item.id), ["membership_sdk_ivan"]);
      assert.deepEqual((await second.listOperatorCapacities({ tenantId: "tenant-volga" })).map((item) => item.id), ["capacity_sdk_ivan"]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("scopes routing rule reads to the requested tenant", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveRoutingRule(routingRule({ channel: "VK", id: "rule_tenant_a", tenantId: "tenant-volga" }));
    await repository.saveRoutingRule(routingRule({ channel: "VK", id: "rule_tenant_b", tenantId: "tenant-lumen" }));

    assert.equal((await repository.findRoutingRule("rule_tenant_a", { tenantId: "tenant-volga" }))?.tenantId, "tenant-volga");
    assert.equal(await repository.findRoutingRule("rule_tenant_a", { tenantId: "tenant-lumen" }), undefined);
    assert.deepEqual((await repository.listRoutingRules({ tenantId: "tenant-volga" })).map((item) => item.id), ["rule_tenant_a"]);
  });

  it("scopes queue membership reads to the requested tenant", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveQueueMembership(queueMembership({ id: "membership_a", operatorId: "operator-ivan", queueId: "VK", tenantId: "tenant-volga" }));
    await repository.saveQueueMembership(queueMembership({ id: "membership_b", operatorId: "operator-ivan", queueId: "VK", tenantId: "tenant-lumen" }));

    assert.equal(await repository.findQueueMembership("membership_a", { tenantId: "tenant-lumen" }), undefined);
    assert.deepEqual((await repository.listQueueMemberships({ tenantId: "tenant-lumen" })).map((item) => item.id), ["membership_b"]);
  });

  it("scopes operator capacity reads to the requested tenant", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveOperatorCapacity(operatorCapacity({ channel: "VK", id: "capacity_a", operatorId: "operator-anna", tenantId: "tenant-volga" }));
    await repository.saveOperatorCapacity(operatorCapacity({ channel: "VK", id: "capacity_b", operatorId: "operator-anna", tenantId: "tenant-lumen" }));

    assert.equal(await repository.findOperatorCapacityByOperatorChannel("tenant-lumen", "operator-anna", "VK")?.id, "capacity_b");
    assert.equal(await repository.findOperatorCapacityByOperatorChannel("tenant-volga", "operator-anna", "VK")?.id, "capacity_a");
    assert.equal(await repository.findOperatorCapacity("capacity_a", { tenantId: "tenant-lumen" }), undefined);
  });

  it("fails closed when routing rule natural keys conflict", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveRoutingRule(routingRule({ channel: "VK", id: "rule_vk_primary", tenantId: "tenant-volga" }));

    await assert.rejects(
      async () => repository.saveRoutingRule(routingRule({ channel: "VK", id: "rule_vk_duplicate", tenantId: "tenant-volga" })),
      /routing_rule_natural_key_conflict/
    );
    assert.deepEqual((await repository.listRoutingRules({ channel: "VK", tenantId: "tenant-volga" })).map((item) => item.id), ["rule_vk_primary"]);
  });

  it("fails closed when queue membership natural keys conflict", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveQueueMembership(queueMembership({ id: "membership_vk_anna_primary", operatorId: "operator-anna", queueId: "VK", tenantId: "tenant-volga" }));

    await assert.rejects(
      async () => repository.saveQueueMembership(queueMembership({ id: "membership_vk_anna_duplicate", operatorId: "operator-anna", queueId: "VK", tenantId: "tenant-volga" })),
      /queue_membership_natural_key_conflict/
    );
    assert.deepEqual((await repository.listQueueMemberships({ queueId: "VK", tenantId: "tenant-volga" })).map((item) => item.id), ["membership_vk_anna_primary"]);
  });

  it("fails closed when operator capacity natural keys conflict", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveOperatorCapacity(operatorCapacity({ channel: "VK", id: "capacity_vk_anna_primary", operatorId: "operator-anna", tenantId: "tenant-volga" }));

    await assert.rejects(
      async () => repository.saveOperatorCapacity(operatorCapacity({ channel: "VK", id: "capacity_vk_anna_duplicate", operatorId: "operator-anna", tenantId: "tenant-volga" })),
      /operator_capacity_natural_key_conflict/
    );
    assert.deepEqual((await repository.listOperatorCapacities({ channel: "VK", tenantId: "tenant-volga" })).map((item) => item.id), ["capacity_vk_anna_primary"]);
  });

  it("fails closed for malformed routing rule limit modes", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveRoutingRule(routingRule({ channel: "VK", id: "rule_valid", tenantId: "tenant-volga" }));

    assert.throws(() => repository.saveRoutingRule({
      ...routingRule({ channel: "Telegram", id: "rule_invalid", tenantId: "tenant-volga" }),
      limitMode: "round_robin_only" as RoutingLimitMode
    }), /Unsupported routing limit mode: round_robin_only/);
    assert.equal((await repository.findRoutingRule("rule_valid", { tenantId: "tenant-volga" }))?.limitMode, "operator_channel_limit");
  });

  it("fails closed for malformed queue membership roles", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveQueueMembership(queueMembership({ id: "membership_valid", operatorId: "operator-ivan", queueId: "VK", tenantId: "tenant-volga" }));

    assert.throws(() => repository.saveQueueMembership({
      ...queueMembership({ id: "membership_invalid", operatorId: "operator-anna", queueId: "VK", tenantId: "tenant-volga" }),
      role: "supervisor" as QueueMembershipRole
    }), /Unsupported queue membership role: supervisor/);
    assert.equal((await repository.findQueueMembership("membership_valid", { tenantId: "tenant-volga" }))?.role, "primary");
  });

  it("fails closed for malformed operator capacity limits", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveOperatorCapacity(operatorCapacity({ channel: "VK", id: "capacity_valid", operatorId: "operator-anna", tenantId: "tenant-volga" }));

    assert.throws(() => repository.saveOperatorCapacity({
      ...operatorCapacity({ channel: "Telegram", id: "capacity_invalid", operatorId: "operator-ivan", tenantId: "tenant-volga" }),
      chatLimit: -1
    }), /chatLimit must be a non-negative integer/);
    assert.equal((await repository.findOperatorCapacity("capacity_valid", { tenantId: "tenant-volga" }))?.chatLimit, 12);
  });
});

function routingRule(input: Partial<RoutingRuleRecord> & Pick<RoutingRuleRecord, "id" | "tenantId">): RoutingRuleRecord {
  return {
    channel: input.channel ?? "*",
    enabled: input.enabled ?? true,
    limitMode: input.limitMode ?? "operator_channel_limit",
    priorityStrategy: input.priorityStrategy ?? "least_loaded",
    updatedAt: input.updatedAt ?? "2026-06-29T12:00:00.000Z",
    waitThresholdSeconds: input.waitThresholdSeconds ?? 180,
    ...input
  };
}

function queueMembership(input: Partial<QueueMembershipRecord> & Pick<QueueMembershipRecord, "id" | "tenantId" | "queueId" | "operatorId">): QueueMembershipRecord {
  return {
    active: input.active ?? true,
    role: input.role ?? "primary",
    updatedAt: input.updatedAt ?? "2026-06-29T12:00:00.000Z",
    ...input
  };
}

function operatorCapacity(input: Partial<OperatorCapacityRecord> & Pick<OperatorCapacityRecord, "id" | "tenantId" | "operatorId" | "channel">): OperatorCapacityRecord {
  return {
    chatLimit: input.chatLimit ?? 12,
    overrideAllowed: input.overrideAllowed ?? false,
    updatedAt: input.updatedAt ?? "2026-06-29T12:00:00.000Z",
    ...input
  };
}
