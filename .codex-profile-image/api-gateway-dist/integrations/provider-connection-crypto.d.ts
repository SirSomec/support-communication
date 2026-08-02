declare const ALGORITHM: "aes-256-gcm";
declare const ENVELOPE_VERSION: 1;
export type ProviderCredentialEnvelope = {
    algorithm: typeof ALGORITHM;
    authTag: string;
    ciphertext: string;
    envelopeVersion: typeof ENVELOPE_VERSION;
    iv: string;
    keyVersion: string;
};
export type ProviderCredentialEnvironment = {
    PROVIDER_CREDENTIAL_MASTER_KEY?: string;
};
export declare class ProviderConnectionCrypto {
    private readonly key;
    readonly keyVersion: string;
    constructor(options: {
        keyVersion: string;
        masterKeyBase64: string;
    });
    static fromEnvironment(keyVersion: string, environment?: ProviderCredentialEnvironment): ProviderConnectionCrypto;
    encrypt(plaintext: string): ProviderCredentialEnvelope;
    decrypt(envelope: ProviderCredentialEnvelope): string;
}
export {};
