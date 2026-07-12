import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { resolveOrCreatePublicSdkConversation } from "../apps/api-gateway/src/integrations/public-sdk-messages.route.ts";
import { resolveConnectionRoutingQueue } from "../apps/api-gateway/src/integrations/routing-queue.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";

describe("canonical conversation queue and team contracts", () => {
  it("resolves only an exact or unambiguous active connection queue", () => {
    const base = {
      chatLimit: 10,
      credentialsMasked: true,
      createdAt: "2026-07-11T00:00:00.000Z",
      environment: "stage",
      health: 100,
      lastSyncAt: "2026-07-11T00:00:00.000Z",
      name: "SDK",
      status: "active",
      tenantId: "tenant-1",
      traffic: "0 events",
      type: "sdk",
      updatedAt: "2026-07-11T00:00:00.000Z",
      webhookUrl: ""
    };
    const connections = [
      { ...base, id: "conn-1", rawExternalId: "sdk:first", routingQueueId: "queue-1" },
      { ...base, id: "conn-2", rawExternalId: "sdk:second", routingQueueId: "queue-2" }
    ];

    assert.equal(resolveConnectionRoutingQueue(connections, { tenantId: "tenant-1", type: "sdk" }), undefined);
    assert.equal(resolveConnectionRoutingQueue(connections, { rawExternalId: "sdk:second", tenantId: "tenant-1", type: "sdk" }), "queue-2");
  });

  it("persists the queue on a new SDK conversation and its creation event", async () => {
    const repository = ConversationRepository.inMemory();
    const conversation = await resolveOrCreatePublicSdkConversation({
      conversationRepository: repository,
      externalId: "visitor-queue",
      queueId: "queue-support",
      tenantId: "tenant-1"
    });

    assert.equal(conversation?.queueId, "queue-support");
    const events = await repository.listLifecycleEvents({ conversationId: conversation?.id, tenantId: "tenant-1" });
    assert.equal(events[0]?.data.queueId, "queue-support");
  });

  it("rejects channel connections that reference a missing or inactive canonical queue", async () => {
    const queues = new Map([
      ["queue-active", { id: "queue-active", status: "active" }],
      ["queue-inactive", { id: "queue-inactive", status: "inactive" }]
    ]);
    const service = new IntegrationService(IntegrationRepository.inMemory(), {
      queueDirectoryRepository: {
        findQueue: async (_tenantId, queueId) => queues.get(queueId) as never
      }
    });

    const missing = await service.createChannelConnection("tenant-1", { name: "SDK missing", routingQueueId: "queue-missing", type: "sdk" });
    const inactive = await service.createChannelConnection("tenant-1", { name: "SDK inactive", routingQueueId: "queue-inactive", type: "sdk" });
    const active = await service.createChannelConnection("tenant-1", { name: "SDK active", routingQueueId: "queue-active", type: "sdk" });

    assert.equal(missing.error?.code, "routing_queue_not_found");
    assert.equal(inactive.error?.code, "routing_queue_not_found");
    assert.equal(active.status, "ok");
  });

  it("creates tenant-safe canonical queue and team relations without backfilling historical conversations", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../prisma/migrations/202607110007_conversation_queue_team/migration.sql", import.meta.url), "utf8");

    assert.match(schema, /model Team[\s\S]*@@id\(\[tenantId, id\]/);
    assert.match(schema, /model SupportQueue[\s\S]*@@id\(\[tenantId, id\]/);
    assert.match(schema, /model TeamMembership[\s\S]*operator\s+TenantUser/);
    assert.match(migration, /CREATE TABLE "support_queues"/);
    assert.match(migration, /integration_channel_connections_queue_fkey/);
    assert.doesNotMatch(migration, /UPDATE "conversations"[\s\S]*"queue_id"/);
    assert.doesNotMatch(migration, /UPDATE "conversations"[\s\S]*"team_id"/);
  });
});
