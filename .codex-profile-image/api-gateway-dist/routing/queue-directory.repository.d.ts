import { type PrismaClient } from "@prisma/client";
export type QueueDirectoryStatus = "active" | "inactive";
export interface QueueDirectoryRecord {
    createdAt: string;
    defaultTeam: null | {
        id: string;
        memberCount: number;
        name: string;
        status: string;
    };
    defaultTeamId: string | null;
    id: string;
    memberCounts: {
        defaultTeam: number;
        queue: number;
    };
    memberIds: string[];
    name: string;
    status: QueueDirectoryStatus;
    tenantId: string;
    updatedAt: string;
}
export interface CreateQueueDirectoryInput {
    defaultTeamId?: string | null;
    id?: string;
    name: string;
    memberIds?: string[];
    status: QueueDirectoryStatus;
    tenantId: string;
}
export interface UpdateQueueDirectoryInput {
    defaultTeamId?: string | null;
    name?: string;
    memberIds?: string[];
    queueId: string;
    status?: QueueDirectoryStatus;
    tenantId: string;
}
export type QueueDirectoryFailureCode = "default_team_not_found" | "queue_has_active_conversations" | "queue_id_conflict" | "queue_not_found" | "queue_operator_not_found";
export declare class QueueDirectoryRepositoryError extends Error {
    readonly code: QueueDirectoryFailureCode;
    readonly details: Record<string, unknown>;
    constructor(code: QueueDirectoryFailureCode, message: string, details?: Record<string, unknown>);
}
export declare class QueueDirectoryRepository {
    private readonly client;
    constructor(client?: PrismaClient);
    listQueues(tenantId: string, status?: QueueDirectoryStatus): Promise<QueueDirectoryRecord[]>;
    findQueue(tenantId: string, queueId: string): Promise<QueueDirectoryRecord | undefined>;
    createQueue(input: CreateQueueDirectoryInput): Promise<QueueDirectoryRecord>;
    updateQueue(input: UpdateQueueDirectoryInput): Promise<QueueDirectoryRecord>;
}
