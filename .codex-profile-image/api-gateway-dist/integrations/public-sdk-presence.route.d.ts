import type { IntegrationRepository } from "./integration.repository.js";
import { type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";
export interface PublicSdkPresenceBody {
    externalId?: string;
    pageUrl?: string;
    pagePath?: string;
    referrer?: string;
    sessionId?: string;
}
export declare function handlePublicSdkPresenceHeartbeat(input: {
    authorization?: string;
    body: PublicSdkPresenceBody;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    repository: IntegrationRepository;
    now?: string;
}): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
export declare function handlePublicSdkPresenceDisconnect(input: {
    authorization?: string;
    body: Pick<PublicSdkPresenceBody, "sessionId">;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    repository: IntegrationRepository;
    now?: string;
}): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
export declare function scopedSdkPresenceHash(...parts: string[]): string;
