export interface VkUserProfile {
    displayName: string;
}
export type VkUserProfileResolver = (input: {
    accessToken: string;
    apiVersion?: string | null;
    userId: string;
}) => Promise<VkUserProfile | null>;
/** Fetches only the public name needed to label a support conversation. */
export declare function fetchVkUserProfile(input: {
    accessToken: string;
    apiVersion?: string | null;
    fetcher?: typeof fetch;
    userId: string;
}): Promise<VkUserProfile | null>;
