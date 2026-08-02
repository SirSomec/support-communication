import { ConversationRepository } from "../conversation/conversation.repository.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { QueueDirectoryRepository } from "./queue-directory.repository.js";
export class CanonicalRoutingWorkloadAdapter {
    dependencies;
    constructor(dependencies = {}) {
        this.dependencies = {
            conversationRepository: dependencies.conversationRepository ?? ConversationRepository.default(),
            identityRepository: dependencies.identityRepository ?? IdentityRepository.default(),
            queueDirectoryRepository: dependencies.queueDirectoryRepository ?? new QueueDirectoryRepository(),
            teamDirectoryRepository: dependencies.teamDirectoryRepository ?? TeamDirectoryRepository.default()
        };
    }
    async readWorkload(tenantId) {
        const requiredTenantId = requireTenantId(tenantId);
        const [users, teams, queues, conversations] = await Promise.all([
            this.dependencies.identityRepository.findTenantUsers(requiredTenantId),
            this.dependencies.teamDirectoryRepository.listTeams(requiredTenantId),
            this.dependencies.queueDirectoryRepository.listQueues(requiredTenantId, "active"),
            this.dependencies.conversationRepository.listConversations({
                tenantId: requiredTenantId,
                take: 500,
                messageTake: 1
            })
        ]);
        const tenantUsers = users.filter((user) => user.tenantId === requiredTenantId && user.status === "active");
        const tenantTeams = teams.filter((team) => team.tenantId === requiredTenantId && team.status === "active");
        const tenantQueues = queues.filter((queue) => queue.tenantId === requiredTenantId && queue.status === "active");
        const tenantConversations = conversations.filter((conversation) => conversation.tenantId === requiredTenantId);
        return {
            operators: tenantUsers.map((user) => toRoutingOperator(user, tenantTeams, tenantQueues, tenantConversations)),
            queues: tenantQueues.map((queue) => toRoutingQueue(queue, tenantTeams, tenantConversations, tenantUsers)),
            tenantId: requiredTenantId
        };
    }
}
function toRoutingOperator(user, teams, queues, conversations) {
    const assigned = conversations.filter((conversation) => isOpen(conversation) && conversation.operatorId === user.id);
    const operatorTeams = teams.filter((team) => team.memberIds.includes(user.id));
    const teamIds = new Set(operatorTeams.map((team) => team.id));
    const operatorQueues = queues.filter((queue) => queue.memberIds.includes(user.id) || Boolean(queue.defaultTeamId && teamIds.has(queue.defaultTeamId)));
    const limit = chatLimitFromMetadata(user.metadata);
    const overdue = assigned.filter(isOverdue).length;
    return {
        availability: { online: null, source: "not_recorded" },
        avgFirstResponseSeconds: 0,
        channels: uniqueSorted(operatorTeams.flatMap((team) => team.channels)),
        chats: assigned.length,
        id: user.id,
        limit: limit ?? 0,
        metricSources: {
            avgFirstResponseSeconds: "not_recorded",
            chats: "canonical_conversations",
            limit: limit === undefined ? "not_recorded" : "identity_user_metadata",
            rescueActive: "not_recorded",
            slaPercent: "canonical_conversations"
        },
        name: user.name,
        queueIds: uniqueSorted(operatorQueues.map((queue) => queue.id)),
        rescueActive: 0,
        slaPercent: assigned.length ? percentage(assigned.length - overdue, assigned.length) : 0,
        status: "offline",
        tenantId: user.tenantId
    };
}
function toRoutingQueue(queue, teams, conversations, users) {
    const queueConversations = conversations.filter((conversation) => conversation.queueId === queue.id && isOpen(conversation));
    const active = queueConversations.filter(isActive).length;
    const waiting = queueConversations.filter(isWaiting).length;
    const overdue = queueConversations.filter(isOverdue).length;
    const defaultTeam = teams.find((team) => team.id === queue.defaultTeamId);
    const activeUserIds = new Set(users.map((user) => user.id));
    const memberIds = uniqueSorted([...queue.memberIds, ...(defaultTeam?.memberIds ?? [])].filter((memberId) => activeUserIds.has(memberId)));
    return {
        active,
        channel: queue.id,
        health: queueConversations.length ? percentage(queueConversations.length - overdue, queueConversations.length) : 0,
        limit: 0,
        memberIds,
        metricSources: {
            active: "canonical_conversations",
            health: "canonical_conversations",
            limit: "not_recorded",
            overdue: "canonical_conversations",
            waiting: "canonical_conversations"
        },
        name: queue.name,
        overdue,
        queueId: queue.id,
        tenantId: queue.tenantId,
        transportChannels: uniqueSorted(queueConversations.map((conversation) => conversation.channel)),
        waiting
    };
}
function isOpen(conversation) {
    return conversation.status !== "closed";
}
function isActive(conversation) {
    return Boolean(conversation.operatorId) && !isWaiting(conversation);
}
function isWaiting(conversation) {
    return !conversation.operatorId || conversation.status === "queued" || conversation.status === "waiting_operator";
}
function isOverdue(conversation) {
    return conversation.slaTone === "danger";
}
function chatLimitFromMetadata(metadata) {
    const employeeSettings = metadata?.employeeSettings;
    if (!employeeSettings || typeof employeeSettings !== "object" || Array.isArray(employeeSettings))
        return undefined;
    const value = employeeSettings.chatLimit;
    return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
function percentage(numerator, denominator) {
    return Math.round((numerator / denominator) * 100);
}
function uniqueSorted(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
function requireTenantId(value) {
    const tenantId = String(value ?? "").trim();
    if (!tenantId)
        throw new TypeError("tenantId is required for canonical routing workload access.");
    return tenantId;
}
//# sourceMappingURL=canonical-routing-workload.adapter.js.map