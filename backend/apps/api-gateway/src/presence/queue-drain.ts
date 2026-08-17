import type { ConversationRepositoryPort } from "../conversation/conversation.repository.js";

const AUTO_ASSIGNABLE_QUEUE_STATUSES = ["new", "queued", "waiting_operator"];
const QUEUE_DRAIN_PAGE_SIZE = 200;

export async function listUnassignedQueueConversationIds(
  repository: Pick<ConversationRepositoryPort, "listConversations">,
  tenantId: string
): Promise<string[]> {
  const conversationIds: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await repository.listConversations({
      ...(cursor ? { cursor } : {}),
      messageTake: 1,
      statuses: AUTO_ASSIGNABLE_QUEUE_STATUSES,
      take: QUEUE_DRAIN_PAGE_SIZE,
      tenantId,
      unassigned: true
    });
    conversationIds.push(...page.map((conversation) => conversation.id));
    cursor = page.length === QUEUE_DRAIN_PAGE_SIZE ? page.at(-1)?.id : undefined;
  } while (cursor);

  return conversationIds;
}
