export interface VkHttpResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}
export type VkHttpFetch = (input: string, init: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
    signal?: AbortSignal;
}) => Promise<VkHttpResponse>;
export interface VkCallbackPreparationInput {
    accessToken: string;
    apiVersion?: string;
    fetcher?: VkHttpFetch;
    groupId: string;
}
export interface VkCallbackSubscriptionInput extends VkCallbackPreparationInput {
    secret: string;
    serverTitle?: string;
    webhookUrl: string;
}
/** Fetches the confirmation value before a server is created. VK sends its
 * confirmation request as part of server creation, so the app must already
 * have persisted this value when that happens. */
export declare function prepareVkCallback(input: VkCallbackPreparationInput): Promise<{
    confirmationCode: string;
}>;
/** Creates a VK Callback API server and enables new community messages. */
export declare function subscribeVkCallback(input: VkCallbackSubscriptionInput): Promise<{
    serverId: number;
}>;
