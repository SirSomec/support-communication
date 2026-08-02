import type { ChannelConnectionStoredRecord } from "./integration.repository.js";
export declare function resolveConnectionRoutingQueue(connections: readonly ChannelConnectionStoredRecord[], input: {
    connectionId?: string;
    rawExternalId?: string;
    tenantId: string;
    type: string;
}): string | undefined;
