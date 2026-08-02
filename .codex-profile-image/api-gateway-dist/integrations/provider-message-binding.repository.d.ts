export interface ProviderMessageBindingRecord {
    id: string;
    channelConnectionId: string;
    conversationId: string;
    internalMessageId: string;
    provider: string;
    providerConversationId: string;
    providerMessageId: string;
    status: string;
    tenantId: string;
}
interface ProviderMessageBindingClient {
    providerMessageBinding: {
        findUnique(input: {
            where: {
                tenantId_channelConnectionId_providerMessageId: {
                    channelConnectionId: string;
                    providerMessageId: string;
                    tenantId: string;
                };
            };
        }): Promise<ProviderMessageBindingRecord | null>;
        update(input: {
            data: {
                status: string;
                updatedAt: Date;
            };
            where: {
                id: string;
            };
        }): Promise<ProviderMessageBindingRecord & {
            id: string;
        }>;
    };
}
export declare class ProviderMessageBindingRepository {
    private readonly client;
    private static instance;
    constructor(client?: ProviderMessageBindingClient);
    static default(): ProviderMessageBindingRepository;
    find(tenantId: string, channelConnectionId: string, providerMessageId: string): Promise<ProviderMessageBindingRecord | null>;
    advance(binding: ProviderMessageBindingRecord, status: string): Promise<ProviderMessageBindingRecord>;
}
export {};
