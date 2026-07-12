import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const ENVELOPE_VERSION = 1 as const;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const AAD_NAMESPACE = "ai-connection-secret";

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
export class SecretStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretStoreError";
  }
}

function decodeMasterKey(encodedKey: string | undefined): Buffer {
  if (typeof encodedKey !== "string" || encodedKey.length === 0) {
    throw new SecretStoreError("AI_CONNECTIONS_MASTER_KEY must be configured");
  }

  const normalized = encodedKey.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey) || Buffer.from(encodedKey, "base64").toString("base64").replace(/=+$/, "") !== normalized) {
    throw new SecretStoreError("AI_CONNECTIONS_MASTER_KEY must be valid base64");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new SecretStoreError("AI_CONNECTIONS_MASTER_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function validateKeyVersion(keyVersion: string): string {
  if (typeof keyVersion !== "string" || keyVersion.trim() === "") {
    throw new SecretStoreError("Secret key version must be configured");
  }
  return keyVersion;
}

function associatedData(keyVersion: string): Buffer {
  return Buffer.from(`${AAD_NAMESPACE}:${ENVELOPE_VERSION}:${keyVersion}`, "utf8");
}

function decodeEnvelopePart(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new SecretStoreError("Invalid encrypted secret");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new SecretStoreError("Invalid encrypted secret");
  }
  return decoded;
}

/**
 * Encrypts AI-provider credentials before they are persisted. The store has no
 * database dependency: callers persist only the returned envelope and may log
 * only `metadata(envelope)`.
 */
export class SecretStore {
  private readonly key: Buffer;
  readonly keyVersion: string;

  constructor(options: { keyVersion: string; masterKeyBase64: string }) {
    this.key = decodeMasterKey(options.masterKeyBase64);
    this.keyVersion = validateKeyVersion(options.keyVersion);
  }

  static fromEnvironment(
    keyVersion: string,
    environment: SecretStoreEnvironment = process.env
  ): SecretStore {
    return new SecretStore({
      keyVersion,
      masterKeyBase64: environment.AI_CONNECTIONS_MASTER_KEY ?? ""
    });
  }

  encrypt(plaintext: string): SecretEnvelope {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new SecretStoreError("Secret must not be empty");
    }

    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
    cipher.setAAD(associatedData(this.keyVersion));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    return {
      algorithm: ALGORITHM,
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      envelopeVersion: ENVELOPE_VERSION,
      iv: iv.toString("base64"),
      keyVersion: this.keyVersion
    };
  }

  decrypt(envelope: SecretEnvelope): string {
    try {
      if (
        envelope?.algorithm !== ALGORITHM ||
        envelope?.envelopeVersion !== ENVELOPE_VERSION ||
        envelope?.keyVersion !== this.keyVersion
      ) {
        throw new SecretStoreError("Unsupported encrypted secret");
      }

      const iv = decodeEnvelopePart(envelope.iv, IV_LENGTH_BYTES);
      const authTag = decodeEnvelopePart(envelope.authTag, AUTH_TAG_LENGTH_BYTES);
      const ciphertext = decodeEnvelopePart(envelope.ciphertext);
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
      decipher.setAAD(associatedData(envelope.keyVersion));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new SecretStoreError("Unable to decrypt secret");
    }
  }

  metadata(envelope: SecretEnvelope): SecretMetadata {
    if (
      envelope?.algorithm !== ALGORITHM ||
      envelope?.envelopeVersion !== ENVELOPE_VERSION ||
      typeof envelope.keyVersion !== "string"
    ) {
      throw new SecretStoreError("Invalid encrypted secret");
    }

    return {
      algorithm: envelope.algorithm,
      ciphertextByteLength: decodeEnvelopePart(envelope.ciphertext).length,
      envelopeVersion: envelope.envelopeVersion,
      keyVersion: envelope.keyVersion
    };
  }
}
