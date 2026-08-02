export type OpenChannelHostnameResolver = (hostname: string) => Promise<Array<{
    address: string;
}>>;
export interface OpenChannelOutboundUrlPolicyOptions {
    /**
     * Explicit callback origins for an isolated development environment.  This
     * is intentionally origin-scoped (scheme, host and port) so it cannot turn
     * the general outbound webhook path into an unrestricted private-network
     * client.
     */
    trustedOrigins?: readonly string[];
}
export declare function normalizeOpenChannelOutboundUrl(value: unknown, options?: OpenChannelOutboundUrlPolicyOptions): string | null;
export declare function assertOpenChannelOutboundUrlSafe(value: unknown, resolver?: OpenChannelHostnameResolver, options?: OpenChannelOutboundUrlPolicyOptions): Promise<string>;
