import { channelFixtures, conversationFixtures } from "./seed-catalog.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapConversationState(base) {
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
//# sourceMappingURL=seed.js.map