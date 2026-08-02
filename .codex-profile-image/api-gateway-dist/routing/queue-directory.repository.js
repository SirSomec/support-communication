import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@support-communication/database";
import { Prisma } from "@prisma/client";
export class QueueDirectoryRepositoryError extends Error {
    code;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "QueueDirectoryRepositoryError";
    }
}
const queueProjection = {
    _count: {
        select: {
            memberships: { where: { active: true } }
        }
    },
    defaultTeam: {
        select: {
            _count: {
                select: {
                    memberships: { where: { active: true } }
                }
            },
            id: true,
            name: true,
            status: true
        }
    },
    memberships: {
        select: { operatorId: true },
        where: { active: true }
    }
};
export class QueueDirectoryRepository {
    client;
    constructor(client) {
        this.client = client ?? createPrismaClient();
    }
    async listQueues(tenantId, status) {
        const rows = await this.client.supportQueue.findMany({
            include: queueProjection,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            where: {
                tenantId,
                ...(status ? { status } : {})
            }
        });
        return rows.map(toQueueDirectoryRecord);
    }
    async findQueue(tenantId, queueId) {
        const row = await this.client.supportQueue.findUnique({
            include: queueProjection,
            where: { tenantId_id: { id: queueId, tenantId } }
        });
        return row ? toQueueDirectoryRecord(row) : undefined;
    }
    async createQueue(input) {
        try {
            return await this.client.$transaction(async (transaction) => {
                await assertDefaultTeam(transaction, input.tenantId, input.defaultTeamId);
                await assertQueueMembers(transaction, input.tenantId, input.memberIds);
                const queueId = input.id ?? `queue_${randomUUID()}`;
                await transaction.supportQueue.create({
                    data: {
                        defaultTeamId: input.defaultTeamId ?? null,
                        id: queueId,
                        name: input.name,
                        status: input.status,
                        tenantId: input.tenantId
                    },
                });
                await replaceQueueMembers(transaction, input.tenantId, queueId, input.memberIds ?? []);
                const row = await transaction.supportQueue.findUniqueOrThrow({
                    include: queueProjection,
                    where: { tenantId_id: { id: queueId, tenantId: input.tenantId } }
                });
                return toQueueDirectoryRecord(row);
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        }
        catch (error) {
            if (isPrismaUniqueViolation(error)) {
                throw new QueueDirectoryRepositoryError("queue_id_conflict", "A queue with this identifier already exists.", {
                    queueId: input.id ?? null,
                    tenantId: input.tenantId
                });
            }
            throw error;
        }
    }
    async updateQueue(input) {
        return this.client.$transaction(async (transaction) => {
            const current = await transaction.supportQueue.findUnique({
                where: { tenantId_id: { id: input.queueId, tenantId: input.tenantId } }
            });
            if (!current) {
                throw new QueueDirectoryRepositoryError("queue_not_found", "Queue was not found in the current tenant.", {
                    queueId: input.queueId,
                    tenantId: input.tenantId
                });
            }
            if (input.defaultTeamId !== undefined) {
                await assertDefaultTeam(transaction, input.tenantId, input.defaultTeamId);
            }
            if (input.memberIds !== undefined) {
                await assertQueueMembers(transaction, input.tenantId, input.memberIds);
            }
            if (input.status === "inactive" && current.status !== "inactive") {
                const activeConversationCount = await transaction.conversation.count({
                    where: {
                        queueId: input.queueId,
                        status: { not: "closed" },
                        tenantId: input.tenantId
                    }
                });
                if (activeConversationCount > 0) {
                    throw new QueueDirectoryRepositoryError("queue_has_active_conversations", "Queue cannot be deactivated while it contains active conversations.", { activeConversationCount, queueId: input.queueId, tenantId: input.tenantId });
                }
            }
            await transaction.supportQueue.update({
                data: {
                    ...(input.defaultTeamId !== undefined ? { defaultTeamId: input.defaultTeamId } : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.status !== undefined ? { status: input.status } : {})
                },
                where: { tenantId_id: { id: input.queueId, tenantId: input.tenantId } }
            });
            if (input.memberIds !== undefined) {
                await replaceQueueMembers(transaction, input.tenantId, input.queueId, input.memberIds);
            }
            const row = await transaction.supportQueue.findUniqueOrThrow({
                include: queueProjection,
                where: { tenantId_id: { id: input.queueId, tenantId: input.tenantId } }
            });
            return toQueueDirectoryRecord(row);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
}
async function assertQueueMembers(transaction, tenantId, memberIds) {
    if (!memberIds?.length)
        return;
    const count = await transaction.tenantUser.count({ where: { id: { in: memberIds }, tenantId } });
    if (count !== memberIds.length) {
        throw new QueueDirectoryRepositoryError("queue_operator_not_found", "One or more queue members do not belong to this tenant.", { tenantId });
    }
}
async function replaceQueueMembers(transaction, tenantId, queueId, memberIds) {
    await transaction.queueMembership.deleteMany({ where: { queueId, tenantId } });
    if (!memberIds.length)
        return;
    await transaction.queueMembership.createMany({
        data: memberIds.map((operatorId) => ({
            active: true,
            id: `qm_${randomUUID()}`,
            operatorId,
            queueId,
            role: "member",
            tenantId,
            updatedAt: new Date()
        })),
        skipDuplicates: true
    });
}
async function assertDefaultTeam(transaction, tenantId, defaultTeamId) {
    if (!defaultTeamId) {
        return;
    }
    const team = await transaction.team.findUnique({
        where: { tenantId_id: { id: defaultTeamId, tenantId } }
    });
    if (!team) {
        throw new QueueDirectoryRepositoryError("default_team_not_found", "Default team was not found in the current tenant.", {
            defaultTeamId,
            tenantId
        });
    }
}
function toQueueDirectoryRecord(row) {
    const defaultTeamMemberCount = row.defaultTeam?._count.memberships ?? 0;
    return {
        createdAt: row.createdAt.toISOString(),
        defaultTeam: row.defaultTeam
            ? {
                id: row.defaultTeam.id,
                memberCount: defaultTeamMemberCount,
                name: row.defaultTeam.name,
                status: row.defaultTeam.status
            }
            : null,
        defaultTeamId: row.defaultTeamId,
        id: row.id,
        memberCounts: {
            defaultTeam: defaultTeamMemberCount,
            queue: row._count.memberships
        },
        memberIds: row.memberships.map((membership) => membership.operatorId),
        name: row.name,
        status: row.status,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    };
}
function isPrismaUniqueViolation(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
//# sourceMappingURL=queue-directory.repository.js.map