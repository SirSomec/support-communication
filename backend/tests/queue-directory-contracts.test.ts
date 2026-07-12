import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  QueueDirectoryRepository,
  QueueDirectoryRepositoryError,
  type QueueDirectoryRecord
} from "../apps/api-gateway/src/routing/queue-directory.repository.ts";
import { QueueDirectoryService } from "../apps/api-gateway/src/routing/queue-directory.service.ts";

const TENANT = "tenant-a";

describe("canonical support queue directory contracts", () => {
  it("lists queues only inside the requested tenant and returns active member counts", async () => {
    let receivedWhere: Record<string, unknown> | undefined;
    const client = {
      supportQueue: {
        findMany: async (input: { where: Record<string, unknown> }) => {
          receivedWhere = input.where;
          return [queueRow()];
        }
      }
    } as unknown as PrismaClient;

    const queues = await new QueueDirectoryRepository(client).listQueues(TENANT, "active");

    assert.deepEqual(receivedWhere, { status: "active", tenantId: TENANT });
    assert.equal(queues.length, 1);
    assert.deepEqual(queues[0]?.memberCounts, { defaultTeam: 3, queue: 2 });
    assert.equal(queues[0]?.defaultTeam?.memberCount, 3);
  });

  it("rejects a default team that does not belong to the current tenant", async () => {
    let createCalled = false;
    const transaction = {
      supportQueue: {
        create: async () => {
          createCalled = true;
          return queueRow();
        }
      },
      team: {
        findUnique: async (input: Record<string, unknown>) => {
          assert.deepEqual(input, { where: { tenantId_id: { id: "team-other", tenantId: TENANT } } });
          return null;
        }
      }
    };
    const client = transactionClient(transaction);

    await assert.rejects(
      () => new QueueDirectoryRepository(client).createQueue({
        defaultTeamId: "team-other",
        id: "queue-a",
        name: "First line",
        status: "active",
        tenantId: TENANT
      }),
      (error: unknown) => error instanceof QueueDirectoryRepositoryError && error.code === "default_team_not_found"
    );
    assert.equal(createCalled, false);
  });

  it("does not deactivate a queue with non-closed conversations", async () => {
    let updateCalled = false;
    const transaction = {
      conversation: {
        count: async (input: Record<string, unknown>) => {
          assert.deepEqual(input, {
            where: { queueId: "queue-a", status: { not: "closed" }, tenantId: TENANT }
          });
          return 4;
        }
      },
      supportQueue: {
        findUnique: async () => ({ id: "queue-a", status: "active" }),
        update: async () => {
          updateCalled = true;
          return queueRow();
        }
      },
      team: { findUnique: async () => null }
    };

    await assert.rejects(
      () => new QueueDirectoryRepository(transactionClient(transaction)).updateQueue({
        queueId: "queue-a",
        status: "inactive",
        tenantId: TENANT
      }),
      (error: unknown) => {
        assert.ok(error instanceof QueueDirectoryRepositoryError);
        assert.equal(error.code, "queue_has_active_conversations");
        assert.equal(error.details.activeConversationCount, 4);
        return true;
      }
    );
    assert.equal(updateCalled, false);
  });

  it("requires tenant context and preserves repository conflicts in API envelopes", async () => {
    const repository = {
      createQueue: async () => queueRecord(),
      listQueues: async () => [],
      updateQueue: async () => {
        throw new QueueDirectoryRepositoryError(
          "queue_has_active_conversations",
          "Queue cannot be deactivated while it contains active conversations.",
          { activeConversationCount: 2 }
        );
      }
    } as unknown as QueueDirectoryRepository;
    const service = new QueueDirectoryService(repository);

    const missingTenant = await service.fetchQueues();
    assert.equal(missingTenant.status, "invalid");
    assert.equal(missingTenant.error?.code, "tenant_context_required");

    const conflict = await service.updateQueue("queue-a", { status: "inactive" }, { tenantId: TENANT });
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "queue_has_active_conversations");
    assert.equal(conflict.data.activeConversationCount, 2);
  });

  it("exposes guarded GET, POST and PATCH routes and registers all directory providers", () => {
    const controller = readFileSync(new URL("../apps/api-gateway/src/routing/queue-directory.controller.ts", import.meta.url), "utf8");
    const moduleSource = readFileSync(new URL("../apps/api-gateway/src/routing/routing.module.ts", import.meta.url), "utf8");

    assert.match(controller, /@Controller\("routing\/queues"\)/);
    assert.match(controller, /@Get\(\)/);
    assert.match(controller, /@Post\(\)/);
    assert.match(controller, /@Patch\(\)/);
    assert.match(controller, /@Patch\(":queueId"\)/);
    assert.match(controller, /TenantOperatorOrServiceAdminGuard/);
    assert.match(controller, /tenantOperatorContext\?\.tenantId \?\? request\.serviceAdminContext\?\.currentTenantId/);
    assert.match(moduleSource, /QueueDirectoryController/);
    assert.match(moduleSource, /QueueDirectoryRepository/);
    assert.match(moduleSource, /QueueDirectoryService/);
  });
});

function transactionClient(transaction: Record<string, unknown>): PrismaClient {
  return {
    $transaction: async (callback: (client: Record<string, unknown>) => Promise<unknown>, options?: { isolationLevel?: string }) => {
      assert.equal(options?.isolationLevel, "Serializable");
      return callback(transaction);
    }
  } as unknown as PrismaClient;
}

function queueRow() {
  return {
    _count: { memberships: 2 },
    createdAt: new Date("2026-07-11T10:00:00.000Z"),
    defaultTeam: {
      _count: { memberships: 3 },
      id: "team-a",
      name: "Support",
      status: "active"
    },
    defaultTeamId: "team-a",
    id: "queue-a",
    memberships: [{ operatorId: "operator-1" }, { operatorId: "operator-2" }],
    name: "First line",
    status: "active",
    tenantId: TENANT,
    updatedAt: new Date("2026-07-11T10:00:00.000Z")
  };
}

function queueRecord(): QueueDirectoryRecord {
  return {
    createdAt: "2026-07-11T10:00:00.000Z",
    defaultTeam: null,
    defaultTeamId: null,
    id: "queue-a",
    memberCounts: { defaultTeam: 0, queue: 0 },
    memberIds: [],
    name: "First line",
    status: "active",
    tenantId: TENANT,
    updatedAt: "2026-07-11T10:00:00.000Z"
  };
}
