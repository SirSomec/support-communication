import { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import { IdentityRepository, type IdentityRepositoryPort } from "../identity/identity.repository.js";
import type { IdentityTenantUser } from "../identity/identity.types.js";
import { TeamDirectoryRepository, type TeamDirectoryRecord } from "../identity/team-directory.repository.js";
import { QueueDirectoryRepository, type QueueDirectoryRecord } from "./queue-directory.repository.js";
import type { RoutingOperator, RoutingQueue } from "./routing.types.js";

export interface CanonicalRoutingOperator extends RoutingOperator {
  availability: {
    online: null;
    source: "not_recorded";
  };
  metricSources: {
    avgFirstResponseSeconds: "not_recorded";
    chats: "canonical_conversations";
    limit: "identity_user_metadata" | "not_recorded";
    rescueActive: "not_recorded";
    slaPercent: "canonical_conversations";
  };
  queueIds: string[];
  status: "offline";
}

export interface CanonicalRoutingQueue extends RoutingQueue {
  /** Canonical SupportQueue.id. The legacy channel key carries the same queue id. */
  queueId: string;
  memberIds: string[];
  metricSources: {
    active: "canonical_conversations";
    health: "canonical_conversations";
    limit: "not_recorded";
    overdue: "canonical_conversations";
    waiting: "canonical_conversations";
  };
  name: string;
  transportChannels: string[];
}

export interface CanonicalRoutingWorkload {
  operators: CanonicalRoutingOperator[];
  queues: CanonicalRoutingQueue[];
  tenantId: string;
}

export interface CanonicalRoutingWorkloadDependencies {
  conversationRepository: Pick<ConversationRepository, "listConversations">;
  identityRepository: Pick<IdentityRepositoryPort, "findTenantUsers">;
  queueDirectoryRepository: Pick<QueueDirectoryRepository, "listQueues">;
  teamDirectoryRepository: Pick<TeamDirectoryRepository, "listTeams">;
}

export class CanonicalRoutingWorkloadAdapter {
  private readonly dependencies: CanonicalRoutingWorkloadDependencies;

  constructor(dependencies: Partial<CanonicalRoutingWorkloadDependencies> = {}) {
    this.dependencies = {
      conversationRepository: dependencies.conversationRepository ?? ConversationRepository.default(),
      identityRepository: dependencies.identityRepository ?? IdentityRepository.default(),
      queueDirectoryRepository: dependencies.queueDirectoryRepository ?? new QueueDirectoryRepository(),
      teamDirectoryRepository: dependencies.teamDirectoryRepository ?? TeamDirectoryRepository.default()
    };
  }

  async readWorkload(tenantId: string): Promise<CanonicalRoutingWorkload> {
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

function toRoutingOperator(
  user: IdentityTenantUser,
  teams: TeamDirectoryRecord[],
  queues: QueueDirectoryRecord[],
  conversations: ConversationRecord[]
): CanonicalRoutingOperator {
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

function toRoutingQueue(
  queue: QueueDirectoryRecord,
  teams: TeamDirectoryRecord[],
  conversations: ConversationRecord[],
  users: IdentityTenantUser[]
): CanonicalRoutingQueue {
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

function isOpen(conversation: ConversationRecord): boolean {
  return conversation.status !== "closed";
}

function isActive(conversation: ConversationRecord): boolean {
  return Boolean(conversation.operatorId) && !isWaiting(conversation);
}

function isWaiting(conversation: ConversationRecord): boolean {
  return !conversation.operatorId || conversation.status === "queued" || conversation.status === "waiting_operator";
}

function isOverdue(conversation: ConversationRecord): boolean {
  return conversation.slaTone === "danger";
}

function chatLimitFromMetadata(metadata: Record<string, unknown> | undefined): number | undefined {
  const employeeSettings = metadata?.employeeSettings;
  if (!employeeSettings || typeof employeeSettings !== "object" || Array.isArray(employeeSettings)) return undefined;
  const value = (employeeSettings as Record<string, unknown>).chatLimit;
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function percentage(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 100);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function requireTenantId(value: string): string {
  const tenantId = String(value ?? "").trim();
  if (!tenantId) throw new TypeError("tenantId is required for canonical routing workload access.");
  return tenantId;
}
