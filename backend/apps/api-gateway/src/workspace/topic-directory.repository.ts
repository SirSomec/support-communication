export interface TopicRecord {
  accessScope: string;
  archived: boolean;
  branchName: string;
  channels: string[];
  groupName: string;
  id: string;
  name: string;
  required: boolean;
  routingTarget: string;
  sortOrder: number;
  tenantId: string;
  updatedAt: string;
}

export interface TopicDirectoryRepositoryPort {
  findTopic(topicId: string, tenantId: string): Promise<TopicRecord | undefined> | TopicRecord | undefined;
  listTopics(tenantId: string): Promise<TopicRecord[]> | TopicRecord[];
  saveTopic(topic: TopicRecord): Promise<TopicRecord> | TopicRecord;
}

export interface PrismaTopicDirectoryClient {
  workspaceTopic: {
    findFirst(input: { where: { id: string; tenantId?: string } }): Promise<PrismaWorkspaceTopicRow | null>;
    findMany(input: {
      orderBy: Array<{ sortOrder: "asc" } | { name: "asc" }>;
      where: { tenantId: string };
    }): Promise<PrismaWorkspaceTopicRow[]>;
    upsert(input: {
      create: PrismaWorkspaceTopicInput;
      update: Omit<PrismaWorkspaceTopicInput, "id">;
      where: { id: string };
    }): Promise<PrismaWorkspaceTopicRow>;
  };
}

interface PrismaWorkspaceTopicInput {
  accessScope: string;
  archived: boolean;
  branchName: string;
  channels: string[];
  groupName: string;
  id: string;
  name: string;
  required: boolean;
  routingTarget: string;
  sortOrder: number;
  tenantId: string;
  updatedAt: Date;
}

interface PrismaWorkspaceTopicRow extends PrismaWorkspaceTopicInput {}

let defaultRepository: TopicDirectoryRepository | null = null;

export class TopicDirectoryRepository implements TopicDirectoryRepositoryPort {
  private constructor(private readonly adapter: TopicDirectoryRepositoryPort) {}

  static default(): TopicDirectoryRepository {
    if (!defaultRepository) {
      defaultRepository = TopicDirectoryRepository.inMemory(seedTopicDirectoryRecords());
    }
    return defaultRepository;
  }

  static inMemory(seed: TopicRecord[] = []): TopicDirectoryRepository {
    const topics = new Map(seed.map((topic) => [topic.id, cloneTopic(topic)]));
    return new TopicDirectoryRepository({
      findTopic(topicId, tenantId) {
        const topic = topics.get(topicId);
        return topic?.tenantId === tenantId ? cloneTopic(topic) : undefined;
      },
      listTopics(tenantId) {
        return Array.from(topics.values())
          .filter((topic) => topic.tenantId === tenantId)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
          .map(cloneTopic);
      },
      saveTopic(topic) {
        const existing = topics.get(topic.id);
        if (existing && existing.tenantId !== topic.tenantId) {
          throw new Error("topic_tenant_mismatch");
        }
        topics.set(topic.id, cloneTopic(topic));
        return cloneTopic(topic);
      }
    });
  }

  static prisma(client: PrismaTopicDirectoryClient): TopicDirectoryRepository {
    return new TopicDirectoryRepository({
      async findTopic(topicId, tenantId) {
        const row = await client.workspaceTopic.findFirst({ where: { id: topicId, tenantId } });
        return row ? fromPrismaTopic(row) : undefined;
      },
      async listTopics(tenantId) {
        const rows = await client.workspaceTopic.findMany({
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          where: { tenantId }
        });
        return rows.map(fromPrismaTopic);
      },
      async saveTopic(topic) {
        const existing = await client.workspaceTopic.findFirst({ where: { id: topic.id, tenantId: topic.tenantId } });
        const input = toPrismaTopic(topic);
        if (!existing) {
          const foreign = await client.workspaceTopic.findFirst({ where: { id: topic.id } });
          if (foreign && foreign.tenantId !== topic.tenantId) {
            throw new Error("topic_tenant_mismatch");
          }
        }
        const row = await client.workspaceTopic.upsert({
          create: input,
          update: {
            accessScope: input.accessScope,
            archived: input.archived,
            branchName: input.branchName,
            channels: input.channels,
            groupName: input.groupName,
            name: input.name,
            required: input.required,
            routingTarget: input.routingTarget,
            sortOrder: input.sortOrder,
            tenantId: input.tenantId,
            updatedAt: input.updatedAt
          },
          where: { id: input.id }
        });
        return fromPrismaTopic(row);
      }
    });
  }

  static useDefault(repository: TopicDirectoryRepository): void {
    defaultRepository = repository;
  }

  findTopic(topicId: string, tenantId: string) {
    return this.adapter.findTopic(topicId, tenantId);
  }

  listTopics(tenantId: string) {
    return this.adapter.listTopics(tenantId);
  }

  saveTopic(topic: TopicRecord) {
    return this.adapter.saveTopic(topic);
  }
}

function toPrismaTopic(topic: TopicRecord): PrismaWorkspaceTopicInput {
  return {
    ...cloneTopic(topic),
    updatedAt: new Date(topic.updatedAt)
  };
}

function fromPrismaTopic(row: PrismaWorkspaceTopicRow): TopicRecord {
  return {
    ...row,
    channels: [...row.channels],
    updatedAt: row.updatedAt.toISOString()
  };
}

function cloneTopic(topic: TopicRecord): TopicRecord {
  return { ...topic, channels: [...topic.channels] };
}

export function seedTopicDirectoryRecords(): TopicRecord[] {
  const rows = [
    topic("topic-delivery-status", "Доставка", "Заказ", "Статус заказа", ["SDK", "Telegram"], true, false, "Line 1", "admins", 10),
    topic("topic-delivery-address", "Доставка", "Заказ", "Адрес доставки", ["SDK", "MAX"], true, false, "Operations", "admins", 20),
    topic("topic-delivery-courier", "Доставка", "Курьер", "Связь с курьером", ["Telegram", "VK"], false, false, "Senior operators", "senior", 30),
    topic("topic-payment-refund", "Оплата", "Возвраты", "Возврат", ["SDK", "VK"], true, false, "Finance queue", "admins", 40),
    topic("topic-payment-card-change", "Оплата", "Возвраты", "Смена карты", ["SDK"], false, true, "Finance queue", "admins", 50),
    topic("topic-account-code", "Авторизация", "Вход", "Код", ["MAX", "VK"], true, false, "Antifraud", "admins", 60),
    topic("topic-account-identity", "Авторизация", "Вход", "Проверка личности", ["SDK", "Telegram", "MAX"], true, false, "Senior operators", "senior", 70),
    topic("topic-product-mismatch", "Товар", "Качество", "Несоответствие", ["Telegram", "VK"], true, false, "Catalog", "admins", 80)
  ];
  return [
    ...rows,
    ...rows.map((row) => ({ ...cloneTopic(row), id: `${row.id}-tenant-volga`, tenantId: "tenant-volga" }))
  ];
}

function topic(id: string, groupName: string, branchName: string, name: string, channels: string[], required: boolean, archived: boolean, routingTarget: string, accessScope: string, sortOrder: number): TopicRecord {
  return {
    accessScope,
    archived,
    branchName,
    channels,
    groupName,
    id,
    name,
    required,
    routingTarget,
    sortOrder,
    tenantId: "tenant-northstar",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}
