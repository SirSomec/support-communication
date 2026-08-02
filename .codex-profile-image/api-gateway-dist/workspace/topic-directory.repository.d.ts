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
        findFirst(input: {
            where: {
                id: string;
                tenantId?: string;
            };
        }): Promise<PrismaWorkspaceTopicRow | null>;
        findMany(input: {
            orderBy: Array<{
                sortOrder: "asc";
            } | {
                name: "asc";
            }>;
            where: {
                tenantId: string;
            };
        }): Promise<PrismaWorkspaceTopicRow[]>;
        upsert(input: {
            create: PrismaWorkspaceTopicInput;
            update: Omit<PrismaWorkspaceTopicInput, "id">;
            where: {
                id: string;
            };
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
interface PrismaWorkspaceTopicRow extends PrismaWorkspaceTopicInput {
}
export declare class TopicDirectoryRepository implements TopicDirectoryRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): TopicDirectoryRepository;
    static inMemory(seed?: TopicRecord[]): TopicDirectoryRepository;
    static prisma(client: PrismaTopicDirectoryClient): TopicDirectoryRepository;
    static useDefault(repository: TopicDirectoryRepository): void;
    findTopic(topicId: string, tenantId: string): TopicRecord | Promise<TopicRecord | undefined> | undefined;
    listTopics(tenantId: string): TopicRecord[] | Promise<TopicRecord[]>;
    saveTopic(topic: TopicRecord): TopicRecord | Promise<TopicRecord>;
}
export declare function seedTopicDirectoryRecords(): TopicRecord[];
export {};
