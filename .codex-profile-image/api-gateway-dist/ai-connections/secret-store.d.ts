declare const ALGORITHM: "aes-256-gcm";
declare const ENVELOPE_VERSION: 1;
export type SecretEnvelope = {
    algorithm: typeof ALGORITHM;
    authTag: string;
    ciphertext: string;
    envelopeVersion: typeof ENVELOPE_VERSION;
    iv: string;
    keyVersion: string;
};
/** Safe-to-log fields describing an encrypted secret; never contains its value. */
export type SecretMetadata = {
    algorithm: typeof ALGORITHM;
    ciphertextByteLength: number;
    envelopeVersion: typeof ENVELOPE_VERSION;
    keyVersion: string;
};
export type SecretStoreEnvironment = {
    AI_CONNECTIONS_MASTER_KEY?: string;
};
/**
 * Error messages intentionally contain no envelope or secret data. They are
 * suitable for converting to a generic API error by a future caller.
 */
export declare class SecretStoreError extends Error {
    constructor(message: string);
}
/**
 * Encrypts AI-provider credentials before they are persisted. The store has no
 * database dependency: callers persist only the returned envelope and may log
 * only `metadata(envelope)`.
 */
export declare class SecretStore {
    private readonly key;
    readonly keyVersion: string;
    constructor(options: {
        keyVersion: string;
        masterKeyBase64: string;
    });
    static fromEnvironment(keyVersion: string, environment?: SecretStoreEnvironment): SecretStore;
    encrypt(plaintext: string): SecretEnvelope;
    decrypt(envelope: SecretEnvelope): string;
    metadata(envelope: SecretEnvelope): SecretMetadata;
}
export {};
