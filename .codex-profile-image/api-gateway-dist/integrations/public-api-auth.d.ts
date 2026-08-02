import { type BackendEnvelope } from "@support-communication/envelope";
export type PublicApiEnvironment = "production" | "stage";
export interface PublicApiKeyRecord {
    channelConnectionId?: string | null;
    environment: PublicApiEnvironment;
    keyId: string;
    scopes: string[];
    secretHash: string;
    status: "active" | "revoked";
    tenantId: string;
}
export interface PublicApiAuthContext {
    channelConnectionId?: string | null;
    environment: PublicApiEnvironment;
    keyId: string;
    scopes: string[];
    tenantId: string;
}
export interface PublicApiKeyLookup {
    findActiveKeyBySecretHash?(secretHash: string): Promise<PublicApiKeyRecord | undefined> | PublicApiKeyRecord | undefined;
    listActiveKeys(): Promise<PublicApiKeyRecord[]> | PublicApiKeyRecord[];
}
export interface PublicApiAuthRequest {
    authorization?: string;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    requiredScope: string;
}
export interface PublicIdentifyUserRequest {
    authorization?: string;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    payload: {
        externalId?: string;
        traits?: Record<string, unknown>;
    };
}
export type PublicApiAuthDecision = {
    allowed: true;
    context: PublicApiAuthContext;
} | {
    allowed: false;
    code: string;
    status: "denied" | "unauthorized";
};
export declare function hashPublicApiKeySecret(rawSecret: string): string;
export declare function resolvePublicApiRequest(request: PublicApiAuthRequest): Promise<PublicApiAuthDecision>;
export declare function handlePublicIdentifyUserRequest(request: PublicIdentifyUserRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
