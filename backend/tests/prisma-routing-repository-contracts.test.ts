import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { configureRoutingRepository } from "../apps/api-gateway/src/routing/bootstrap.ts";
import {
  RoutingRepository,
  type OperatorCapacityRecord,
  type QueueMembershipRecord,
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
  const routingRules = new Map<string, FakeRoutingRuleCreateInput>();
  const queueMemberships = new Map<string, FakeQueueMembershipCreateInput>();
  const operatorCapacities = new Map<string, FakeOperatorCapacityCreateInput>();
  const calls = {
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
    }>
  };

  const client = {
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
    }
  };

  return { calls, client };
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

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => row[key] === value);
}
