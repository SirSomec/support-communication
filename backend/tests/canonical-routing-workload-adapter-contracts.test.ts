import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "../apps/api-gateway/src/conversation/conversation.types.ts";
import type { IdentityTenantUser } from "../apps/api-gateway/src/identity/identity.types.ts";
import type { TeamDirectoryRecord } from "../apps/api-gateway/src/identity/team-directory.repository.ts";
import type { QueueDirectoryRecord } from "../apps/api-gateway/src/routing/queue-directory.repository.ts";
import { CanonicalRoutingWorkloadAdapter } from "../apps/api-gateway/src/routing/canonical-routing-workload.adapter.ts";
import { CanonicalRoutingConversationRepository } from "../apps/api-gateway/src/routing/canonical-routing-conversation.repository.ts";
import type { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { RoutingService } from "../apps/api-gateway/src/routing/routing.service.ts";

describe("canonical routing workload adapter contracts", () => {
  it("builds tenant-safe operator and queue workload from canonical records", async () => {
    const adapter = workloadAdapter({
      conversations: [
        conversation({ id: "active", operatorId: "operator-a", queueId: "queue-support", status: "assigned" }),
        conversation({ id: "waiting", operatorId: undefined, queueId: "queue-support", status: "queued" }),
        conversation({ channel: "sdk", id: "overdue", operatorId: "operator-a", queueId: "queue-support", slaTone: "danger" }),
        conversation({ id: "closed", operatorId: "operator-a", queueId: "queue-support", status: "closed" }),
        conversation({ id: "foreign", operatorId: "operator-a", queueId: "queue-support", tenantId: "tenant-b" })
      ],
      queues: [queue({ memberIds: ["operator-invited"] }), queue({ id: "queue-foreign", tenantId: "tenant-b" })],
      teams: [team(), team({ id: "team-foreign", memberIds: ["operator-a"], tenantId: "tenant-b" })],
      users: [user(), user({ id: "operator-invited", status: "invited" }), user({ id: "operator-b", tenantId: "tenant-b" })]
    });

    const workload = await adapter.readWorkload("tenant-a");

    assert.equal(workload.tenantId, "tenant-a");
    assert.deepEqual(workload.operators.map((operator) => operator.id), ["operator-a"]);
    assert.deepEqual(workload.operators[0], {
      availability: { online: null, source: "not_recorded" },
      avgFirstResponseSeconds: 0,
      channels: ["telegram"],
      chats: 2,
      id: "operator-a",
      limit: 7,
      metricSources: {
        avgFirstResponseSeconds: "not_recorded",
        chats: "canonical_conversations",
        limit: "identity_user_metadata",
        rescueActive: "not_recorded",
        slaPercent: "canonical_conversations"
      },
      name: "Operator A",
      queueIds: ["queue-support"],
      rescueActive: 0,
      slaPercent: 50,
      status: "offline",
      tenantId: "tenant-a"
    });
    assert.deepEqual(workload.queues.map((queue) => queue.queueId), ["queue-support"]);
    assert.equal(workload.queues[0]?.channel, "queue-support");
    assert.deepEqual(workload.queues[0]?.transportChannels, ["sdk", "telegram"]);
    assert.deepEqual(workload.queues[0]?.memberIds, ["operator-a"]);
    assert.deepEqual(pick(workload.queues[0], ["active", "waiting", "overdue", "health"]), {
      active: 2,
      health: 67,
      overdue: 1,
      waiting: 1
    });
  });

  it("does not infer online presence or fallback from transport channel to queue id", async () => {
    const adapter = workloadAdapter({
      conversations: [conversation({ channel: "telegram", operatorId: "operator-a", queueId: undefined })],
      queues: [queue()],
      teams: [],
      users: [user({ lastActiveAt: new Date().toISOString(), sessions: 3, metadata: undefined })]
    });

    const workload = await adapter.readWorkload("tenant-a");

    assert.equal(workload.operators[0]?.status, "offline");
    assert.deepEqual(workload.operators[0]?.availability, { online: null, source: "not_recorded" });
    assert.equal(workload.operators[0]?.limit, 0);
    assert.equal(workload.operators[0]?.metricSources.limit, "not_recorded");
    assert.equal(workload.operators[0]?.chats, 1);
    assert.deepEqual(workload.queues[0]?.transportChannels, []);
    assert.deepEqual(pick(workload.queues[0], ["active", "waiting", "overdue"]), { active: 0, overdue: 0, waiting: 0 });
  });

  it("requires tenant context and scopes every canonical directory read", async () => {
    const received: Array<[string, string?]> = [];
    const adapter = new CanonicalRoutingWorkloadAdapter({
      conversationRepository: { listConversations: async () => [] },
      identityRepository: { findTenantUsers: async (tenantId) => { received.push(["users", tenantId]); return []; } },
      queueDirectoryRepository: { listQueues: async (tenantId, status) => { received.push(["queues", `${tenantId}:${status}`]); return []; } },
      teamDirectoryRepository: { listTeams: async (tenantId) => { received.push(["teams", tenantId]); return []; } }
    });

    await assert.rejects(() => adapter.readWorkload(" "), /tenantId is required/);
    await adapter.readWorkload("tenant-a");
    assert.deepEqual(received, [["users", "tenant-a"], ["teams", "tenant-a"], ["queues", "tenant-a:active"]]);
  });

  it("drives the live workload endpoint from canonical queues instead of the empty routing snapshot", async () => {
    const adapter = workloadAdapter({
      conversations: [conversation({ id: "waiting", operatorId: undefined, status: "queued" })],
      queues: [queue({ name: "Real support queue" })],
      teams: [team()],
      users: [user()]
    });
    const service = new RoutingService(RoutingRepository.inMemory(), adapter);

    const response = await service.fetchWorkload({}, { tenantId: "tenant-a" });

    assert.equal(response.status, "ok");
    assert.equal(response.data?.dataQuality?.canonical, true);
    assert.deepEqual(response.data?.queues?.map((item: { name: string; queueId: string; waiting: number }) => ({
      name: item.name,
      queueId: item.queueId,
      waiting: item.waiting
    })), [{ name: "Real support queue", queueId: "queue-support", waiting: 1 }]);
    assert.equal(response.data?.operators?.[0]?.availability?.source, "not_recorded");
  });

  // Возврат бота в очередь без свободных операторов: диалог обязан получить
  // статус queued (вкладка «Ожидают»), а не остаться «в работе».
  it("returns an unassigned dialog to the waiting queue when auto-assignment finds no eligible operator", async () => {
    const botDialog = conversation({ id: "conversation-bot", operatorId: undefined, status: "active" });
    const adapter = workloadAdapter({
      conversations: [botDialog],
      queues: [queue()],
      teams: [team()],
      // Канал оператора (telegram) не совпадает с очередью диалога
      // (queue-support) -> channel_access:denied -> кандидат blocked.
      users: [user()]
    });
    const routingRepository = RoutingRepository.inMemory();
    const canonicalConversations = new CanonicalRoutingConversationRepository({
      listConversations: async () => [botDialog]
    } as unknown as ConversationRepository);
    const service = new RoutingService(routingRepository, adapter, canonicalConversations);

    const response = await service.autoAssignConversation("conversation-bot", { tenantId: "tenant-a" });

    assert.equal(response.status, "ok");
    assert.equal(response.data?.assigned, false);
    assert.equal(response.data?.queued, true);
    const queuedConversation = response.data?.conversation as { operatorId?: string; status?: string } | undefined;
    assert.equal(queuedConversation?.status, "queued");
    assert.equal(queuedConversation?.operatorId, undefined);
    const persisted = routingRepository.readState().conversations.find((item) => item.id === "conversation-bot");
    assert.equal(persisted?.status, "queued");

    // Повторный inbound по уже стоящему в очереди диалогу не создает
    // второй transition: канонический статус queued пропускает возврат.
    botDialog.status = "queued";
    const replay = await service.autoAssignConversation("conversation-bot", { tenantId: "tenant-a" });
    assert.equal(replay.data?.queued, true);
    assert.equal("conversation" in (replay.data ?? {}), false);
  });

  // Повторное обращение (форк со статусом new): канонический маппер считает его
  // «queued», но запись остается new и не видна в «Ожидают» — guard обязан
  // смотреть на persistedStatus и переводить диалог в настоящий queued.
  // Ротация автоназначения: оператор, только что обработавший диалог, не
  // должен получать следующее обращение, пока есть такой же свободный
  // коллега, который дольше не получал назначений.
  it("auto-assigns the next dialog to the operator idle the longest when loads are equal", async () => {
    const first = conversation({ id: "conversation-first", operatorId: undefined, status: "queued" });
    const second = conversation({ id: "conversation-second", operatorId: undefined, status: "queued" });
    const conversations = [first, second];
    const adapter = workloadAdapter({
      conversations,
      queues: [queue()],
      // Канал команды совпадает с очередью диалога: оба оператора eligible.
      teams: [team({ channels: ["queue-support"], memberIds: ["operator-a", "operator-b"] })],
      users: [user(), user({ email: "operator-b@example.test", id: "operator-b", name: "Operator B" })]
    });
    const routingRepository = RoutingRepository.inMemory();
    const canonicalConversations = new CanonicalRoutingConversationRepository({
      listConversations: async () => conversations
    } as unknown as ConversationRepository);
    const service = new RoutingService(routingRepository, adapter, canonicalConversations);

    const initial = await service.autoAssignConversation("conversation-first", { tenantId: "tenant-a" });
    assert.equal(initial.status, "ok");
    assert.equal((initial.data?.assignment as { targetOperatorId?: string } | undefined)?.targetOperatorId, "operator-a");

    // Оператор A обработал диалог до прихода следующего обращения: загрузка
    // операторов снова равна (0 и 0), но история назначений уже различает их.
    first.status = "closed";
    first.operatorId = "operator-a";

    const next = await service.autoAssignConversation("conversation-second", { tenantId: "tenant-a" });
    assert.equal(next.status, "ok");
    assert.equal((next.data?.assignment as { targetOperatorId?: string } | undefined)?.targetOperatorId, "operator-b");
  });

  it("queues a repeat-appeal fork (record status new) when the bot hands off without operators", async () => {
    const repeatAppeal = conversation({ id: "conversation-repeat", operatorId: undefined, status: "new" });
    const adapter = workloadAdapter({
      conversations: [repeatAppeal],
      queues: [queue()],
      teams: [team()],
      users: [user()]
    });
    const canonicalConversations = new CanonicalRoutingConversationRepository({
      listConversations: async () => [repeatAppeal]
    } as unknown as ConversationRepository);
    const service = new RoutingService(RoutingRepository.inMemory(), adapter, canonicalConversations);

    const response = await service.autoAssignConversation("conversation-repeat", { tenantId: "tenant-a" });

    assert.equal(response.status, "ok");
    assert.equal(response.data?.assigned, false);
    assert.equal(response.data?.queued, true);
    assert.equal((response.data?.conversation as { status?: string } | undefined)?.status, "queued");
  });
});

function workloadAdapter(input: {
  conversations: ConversationRecord[];
  queues: QueueDirectoryRecord[];
  teams: TeamDirectoryRecord[];
  users: IdentityTenantUser[];
}): CanonicalRoutingWorkloadAdapter {
  return new CanonicalRoutingWorkloadAdapter({
    conversationRepository: { listConversations: async () => input.conversations },
    identityRepository: { findTenantUsers: async () => input.users },
    queueDirectoryRepository: { listQueues: async () => input.queues },
    teamDirectoryRepository: { listTeams: async () => input.teams }
  });
}

function user(overrides: Partial<IdentityTenantUser> = {}): IdentityTenantUser {
  return {
    device: "desktop",
    email: "operator-a@example.test",
    id: "operator-a",
    inviteStatus: "accepted",
    lastActiveAt: "2026-07-11T09:00:00.000Z",
    metadata: { employeeSettings: { chatLimit: 7 } },
    mfa: "configured",
    name: "Operator A",
    risk: "low",
    role: "employee",
    sessions: 2,
    status: "active",
    supportNotes: "",
    tenantId: "tenant-a",
    ...overrides
  };
}

function team(overrides: Partial<TeamDirectoryRecord> = {}): TeamDirectoryRecord {
  return {
    channels: ["telegram"],
    id: "team-support",
    memberIds: ["operator-a"],
    name: "Support",
    scope: "support",
    status: "active",
    tenantId: "tenant-a",
    updatedAt: "2026-07-11T10:00:00.000Z",
    ...overrides
  };
}

function queue(overrides: Partial<QueueDirectoryRecord> = {}): QueueDirectoryRecord {
  return {
    createdAt: "2026-07-11T10:00:00.000Z",
    defaultTeam: { id: "team-support", memberCount: 1, name: "Support", status: "active" },
    defaultTeamId: "team-support",
    id: "queue-support",
    memberCounts: { defaultTeam: 1, queue: 0 },
    memberIds: [],
    name: "Support queue",
    status: "active",
    tenantId: "tenant-a",
    updatedAt: "2026-07-11T10:00:00.000Z",
    ...overrides
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    channel: "telegram",
    clientSince: "2026-07-01",
    device: "mobile",
    entry: "inbound",
    id: "conversation-a",
    initials: "CA",
    language: "ru",
    messages: [],
    name: "Client A",
    operatorId: "operator-a",
    phone: "+70000000000",
    preview: "Test",
    previous: [],
    queueId: "queue-support",
    sla: "00:10",
    slaTone: "ok",
    status: "assigned",
    tags: [],
    tenantId: "tenant-a",
    time: "now",
    topic: "Support",
    ...overrides
  };
}

function pick<T extends object, K extends keyof T>(value: T | undefined, keys: K[]): Pick<T, K> {
  assert.ok(value);
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}
