import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TopicDirectoryRepository,
  type PrismaTopicDirectoryClient
} from "../apps/api-gateway/src/workspace/topic-directory.repository.ts";
import { TopicDirectoryService } from "../apps/api-gateway/src/workspace/topic-directory.service.ts";

describe("topic directory repository contracts", () => {
  it("keeps tenant topics durable across Prisma-backed service instances", async () => {
    const { client, rows } = createFakePrismaTopicClient();
    const first = new TopicDirectoryService(TopicDirectoryRepository.prisma(client));
    const created = await first.createTopic({
      branchName: "Delivery",
      channels: ["SDK"],
      groupName: "Orders",
      name: "Durable status"
    }, { tenantId: "tenant-volga" });
    const topicId = String(created.data.topic.id);

    const afterRestart = new TopicDirectoryService(TopicDirectoryRepository.prisma(client));
    const ownerView = await afterRestart.fetchTopics({ query: "Durable status" }, { tenantId: "tenant-volga" });
    const foreignView = await afterRestart.fetchTopicUsage(topicId, { tenantId: "tenant-lumen" });

    assert.equal(rows.size, 1);
    assert.deepEqual(ownerView.data.topics.map((topic: Record<string, unknown>) => topic.id), [topicId]);
    assert.equal(foreignView.status, "not_found");
  });
});

function createFakePrismaTopicClient(): {
  client: PrismaTopicDirectoryClient;
  rows: Map<string, FakeTopicRow>;
} {
  const rows = new Map<string, FakeTopicRow>();
  const client: PrismaTopicDirectoryClient = {
    workspaceTopic: {
      async findFirst(input) {
        return Array.from(rows.values()).find((row) => row.id === input.where.id
          && (!input.where.tenantId || row.tenantId === input.where.tenantId)) ?? null;
      },
      async findMany(input) {
        return Array.from(rows.values())
          .filter((row) => row.tenantId === input.where.tenantId)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
      },
      async upsert(input) {
        const next = {
          ...(rows.get(input.where.id) ?? input.create),
          ...input.update,
          id: input.where.id
        };
        rows.set(next.id, next);
        return next;
      }
    }
  };
  return { client, rows };
}

type FakeTopicRow = Awaited<ReturnType<PrismaTopicDirectoryClient["workspaceTopic"]["upsert"]>>;
