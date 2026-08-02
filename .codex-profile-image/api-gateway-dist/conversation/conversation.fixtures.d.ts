export interface ConversationMessage {
    attachments?: Array<Record<string, unknown>>;
    author?: string;
    id: string | number;
    side?: "agent" | "client";
    text: string;
    time: string;
    type?: "event" | "internal";
}
export interface ConversationRecord {
    avatar?: string;
    channel: string;
    clientSince: string;
    device: string;
    entry: string;
    id: string;
    initials: string;
    language: string;
    messages: ConversationMessage[];
    name: string;
    phone: string;
    preview: string;
    previous: string[][];
    sla: string;
    slaTone: string;
    status: string;
    tags: string[];
    tenantId?: string;
    time: string;
    topic: string;
    unread?: boolean;
}
export declare const conversationFixtures: ConversationRecord[];
export declare const channelFixtures: {
    id: string;
    name: string;
    status: string;
    delivery: string;
    inboundState: string;
}[];
