export interface MaxHttpResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}
export type MaxHttpFetch = (input: string, init: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
    signal?: AbortSignal;
}) => Promise<MaxHttpResponse>;
export interface MaxWebhookSubscriptionInput {
    accessToken: string;
    apiBaseUrl?: string;
    fetcher?: MaxHttpFetch;
    secret: string;
    updateTypes?: string[];
    webhookUrl: string;
}
/** Registers the only production ingress supported by MAX Bot API. */
export declare function subscribeMaxWebhook(input: MaxWebhookSubscriptionInput): Promise<void>;
