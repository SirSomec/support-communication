import { createHash } from "node:crypto";
/** Deterministic positive 31-bit id — consumers expect numeric chat_id / visitor numbers. */
export function stableNumericId(value) {
    const digest = createHash("sha256").update(String(value)).digest();
    return digest.readUInt32BE(0) & 0x7fffffff;
}
export function externalClientId(conversation, state) {
    if (state?.clientId)
        return state.clientId;
    const externalTag = conversation.tags.find((tag) => tag.startsWith("external:"));
    return externalTag?.slice("external:".length).trim()
        || conversation.providerUserId
        || conversation.phone.trim()
        || conversation.id;
}
export function visitorFromConversation(conversation, state) {
    const clientId = externalClientId(conversation, state);
    const contact = (state?.attributes ?? {});
    const email = firstString(contact.email, extractTaggedValue(conversation.tags, "email:"));
    const phone = firstString(contact.phone, looksLikePhone(conversation.phone) ? conversation.phone : undefined);
    return {
        chats_count: 1 + (conversation.previous?.length ?? 0),
        description: firstString(contact.description) ?? "",
        ...(email ? { email } : {}),
        name: conversation.name,
        number: String(stableNumericId(clientId)),
        ...(phone ? { phone } : {}),
        social: {}
    };
}
export function agentFromConversation(conversation) {
    if (!conversation.operatorId)
        return null;
    return {
        email: "",
        id: String(conversation.operatorId),
        name: conversation.operatorName ?? String(conversation.operatorId)
    };
}
export function pageFromConversation(conversation) {
    const pageTag = conversation.tags.find((tag) => tag.startsWith("page:"));
    if (!pageTag)
        return null;
    return { url: pageTag.slice("page:".length) };
}
export function sessionStub() {
    // GeoIP/UTM enrichment is not collected server-side yet; the structure is
    // kept so consumers can keep optional-chaining the same paths.
    return {
        geoip: {},
        ip_addr: "",
        user_agent: "",
        utm: "",
        utm_json: {}
    };
}
export function compatWebhookEventBase(eventName, conversation, state, widgetId) {
    return {
        agent: agentFromConversation(conversation),
        assigned_agent: null,
        chat_id: stableNumericId(conversation.id),
        event_name: eventName,
        organization: null,
        page: pageFromConversation(conversation),
        session: sessionStub(),
        status: null,
        tags: conversation.tags
            .filter((tag) => !tag.includes(":"))
            .map((tag) => ({ id: tag, title: tag })),
        user_token: state?.userToken ?? null,
        visitor: visitorFromConversation(conversation, state),
        widget_id: widgetId
    };
}
export function chatMessagesFromConversation(conversation) {
    return conversation.messages
        .filter((message) => message.type !== "event" && message.type !== "internal")
        .map((message) => ({
        message: message.text,
        timestamp: messageTimestamp(message),
        type: message.side === "agent" ? "agent" : "visitor",
        ...(message.side === "agent" && conversation.operatorId ? { agent_id: String(conversation.operatorId) } : {})
    }));
}
export function plainMessagesFromConversation(conversation) {
    return conversation.messages
        .filter((message) => message.type !== "event" && message.type !== "internal")
        .map((message) => `${message.side === "agent" ? "Agent" : "Visitor"}: ${message.text}`)
        .join("\n");
}
function messageTimestamp(message) {
    const parsed = message.createdAt ? Date.parse(message.createdAt) : NaN;
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}
function firstString(...values) {
    for (const value of values) {
        const text = String(value ?? "").trim();
        if (text)
            return text;
    }
    return undefined;
}
function extractTaggedValue(tags, prefix) {
    const tag = tags.find((item) => item.startsWith(prefix));
    return tag ? tag.slice(prefix.length).trim() : undefined;
}
function looksLikePhone(value) {
    return /^\+?[\d\s().-]{5,20}$/.test(String(value ?? "").trim());
}
//# sourceMappingURL=open-channel-payload.js.map