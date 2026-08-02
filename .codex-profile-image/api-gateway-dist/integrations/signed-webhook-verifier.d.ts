export interface SignedWebhookTimestampVerificationInput {
    now: string;
    timestampHeader?: string;
    toleranceSeconds?: number;
}
export interface SignedWebhookSignatureVerificationInput {
    body: string;
    secret: string;
    signatureHeader?: string;
    timestampHeader: string;
}
export interface SignedWebhookNonceVerificationInput {
    endpointId: string;
    nonceHeader?: string;
    receivedAt: string;
    store: SignedWebhookNonceStore;
}
export interface VerifiedInboundWebhookNormalizationDescriptorInput {
    body: string;
    channel: string;
    endpointId: string;
    nonceHeader?: string;
    now: string;
    secret: string;
    signatureHeader?: string;
    timestampHeader?: string;
    store: SignedWebhookNonceStore;
}
export interface VerifiedInboundWebhookNormalizationDescriptor {
    channel: string;
    endpointId: string;
    id: string;
    kind: "inbound_webhook_normalization";
    normalizationPayload: {
        conversationId: string;
        eventId: string;
        text: string;
    };
    receivedAt: string;
    target: {
        operation: "normalizeInboundEvent";
        service: "channelService";
    };
}
export interface SignedWebhookNonceRecord {
    endpointId: string;
    firstSeenAt: string;
    nonce: string;
}
export interface SignedWebhookNonceStore {
    saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult>;
}
export interface SignedWebhookNonceSaveResult {
    inserted: boolean;
    record: SignedWebhookNonceRecord;
}
export interface SignedWebhookReplayDetails {
    endpointId: string;
    firstSeenAt: string;
    nonce: string;
}
export interface PrismaSignedWebhookNonceStoreOptions {
    client: PrismaSignedWebhookNonceClient;
}
export interface PrismaSignedWebhookNonceClient {
    signedWebhookReplayNonce: {
        create(input: {
            data: PrismaSignedWebhookReplayNonceCreateInput;
        }): Promise<PrismaSignedWebhookReplayNonceRow>;
        findUnique(input: {
            where: {
                endpointId_nonce: {
                    endpointId: string;
                    nonce: string;
                };
            };
        }): Promise<PrismaSignedWebhookReplayNonceRow | null>;
    };
}
interface PrismaSignedWebhookReplayNonceCreateInput {
    endpointId: string;
    firstSeenAt: Date;
    nonce: string;
}
interface PrismaSignedWebhookReplayNonceRow extends PrismaSignedWebhookReplayNonceCreateInput {
    createdAt: Date;
}
export type SignedWebhookTimestampVerification = {
    accepted: true;
    ageSeconds: number;
    timestamp: string;
} | {
    accepted: false;
    code: "webhook_timestamp_malformed" | "webhook_timestamp_outside_tolerance" | "webhook_timestamp_required";
    skewSeconds: number | null;
};
export type SignedWebhookSignatureVerification = {
    accepted: true;
} | {
    accepted: false;
    code: "webhook_signature_malformed" | "webhook_signature_mismatch" | "webhook_signature_required";
};
export type SignedWebhookNonceVerification = {
    accepted: true;
    endpointId: string;
    nonce: string;
} | {
    accepted: false;
    code: "webhook_nonce_replay";
    endpointId: string;
    firstSeenAt: string;
    nonce: string;
} | {
    accepted: false;
    code: "webhook_nonce_required";
};
export type VerifiedInboundWebhookNormalizationDescriptorResult = {
    accepted: true;
    descriptor: VerifiedInboundWebhookNormalizationDescriptor;
} | {
    accepted: false;
    code: string;
    descriptor: null;
    replay?: SignedWebhookReplayDetails;
};
export declare class InMemorySignedWebhookNonceStore implements SignedWebhookNonceStore {
    private readonly nonces;
    saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult>;
}
export declare class PrismaSignedWebhookNonceStore implements SignedWebhookNonceStore {
    private readonly client;
    private constructor();
    static create(options: PrismaSignedWebhookNonceStoreOptions): PrismaSignedWebhookNonceStore;
    saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult>;
}
export declare function verifySignedWebhookTimestamp(input: SignedWebhookTimestampVerificationInput): SignedWebhookTimestampVerification;
export declare function verifySignedWebhookSignature(input: SignedWebhookSignatureVerificationInput): SignedWebhookSignatureVerification;
export declare function verifySignedWebhookNonce(input: SignedWebhookNonceVerificationInput): Promise<SignedWebhookNonceVerification>;
export declare function createVerifiedInboundWebhookNormalizationDescriptor(input: VerifiedInboundWebhookNormalizationDescriptorInput): Promise<VerifiedInboundWebhookNormalizationDescriptorResult>;
export {};
