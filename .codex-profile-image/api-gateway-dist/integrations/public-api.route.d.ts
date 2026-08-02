import { type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";
export declare function identifyPublicClientFromRoute(lookup: PublicApiKeyLookup, authorization: string | undefined, environment?: PublicApiEnvironment, payload?: {
    externalId?: string;
    traits?: Record<string, unknown>;
}): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
