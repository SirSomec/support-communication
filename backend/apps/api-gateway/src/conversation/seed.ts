import type { ConversationState } from "./conversation.repository.js";
import { channelFixtures, conversationFixtures } from "./seed-catalog.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bootstrapConversationState(base?: Partial<ConversationState>): ConversationState {
  return {
    channelCatalog: base?.channelCatalog ?? clone(channelFixtures),
    conversations: base?.conversations ?? clone(conversationFixtures),
    deliveryReceipts: base?.deliveryReceipts ?? [],
    inboundEvents: base?.inboundEvents ?? [],
    outboundDescriptors: base?.outboundDescriptors ?? [],
    outboxEvents: base?.outboxEvents ?? [],
    realtimeEvents: base?.realtimeEvents ?? []
  };
}

export * from "./seed-catalog.js";
