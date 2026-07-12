import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const ENVELOPE_VERSION = 1 as const;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

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

function decodeMasterKey(encodedKey: string | undefined): Buffer {
  if (typeof encodedKey !== "string" || encodedKey.length === 0) {
    throw new Error("PROVIDER_CREDENTIAL_MASTER_KEY must be configured");
  }

  const normalized = encodedKey.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey) || Buffer.from(encodedKey, "base64").toString("base64").replace(/=+$/, "") !== normalized) {
    throw new Error("PROVIDER_CREDENTIAL_MASTER_KEY must be valid base64");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("PROVIDER_CREDENTIAL_MASTER_KEY must decode to exactly 32 bytes");
  }
  return key;
}

function validateKeyVersion(keyVersion: string): string {
  if (typeof keyVersion !== "string" || keyVersion.trim() === "") {
    throw new Error("Provider credential key version must be configured");
  }
  return keyVersion;
}

function additionalAuthenticatedData(keyVersion: string): Buffer {
  return Buffer.from(`provider-credential:${ENVELOPE_VERSION}:${keyVersion}`, "utf8");
}

function decodeEnvelopePart(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("Invalid encrypted provider credential");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new Error("Invalid encrypted provider credential");
  }
  return decoded;
}

export class ProviderConnectionCrypto {
  private readonly key: Buffer;
  readonly keyVersion: string;

  constructor(options: { keyVersion: string; masterKeyBase64: string }) {
    this.key = decodeMasterKey(options.masterKeyBase64);
    this.keyVersion = validateKeyVersion(options.keyVersion);
  }

  static fromEnvironment(
    keyVersion: string,
    environment: ProviderCredentialEnvironment = process.env
  ): ProviderConnectionCrypto {
    return new ProviderConnectionCrypto({
      keyVersion,
      masterKeyBase64: environment.PROVIDER_CREDENTIAL_MASTER_KEY ?? ""
    });
  }

  encrypt(plaintext: string): ProviderCredentialEnvelope {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new Error("Provider credential must not be empty");
    }

    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
    cipher.setAAD(additionalAuthenticatedData(this.keyVersion));
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

  decrypt(envelope: ProviderCredentialEnvelope): string {
    try {
      if (
        envelope?.algorithm !== ALGORITHM ||
        envelope?.envelopeVersion !== ENVELOPE_VERSION ||
        envelope?.keyVersion !== this.keyVersion
      ) {
        throw new Error("Unsupported encrypted provider credential");
      }

      const iv = decodeEnvelopePart(envelope.iv, IV_LENGTH_BYTES);
      const authTag = decodeEnvelopePart(envelope.authTag, AUTH_TAG_LENGTH_BYTES);
      const ciphertext = decodeEnvelopePart(envelope.ciphertext);
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
      decipher.setAAD(additionalAuthenticatedData(envelope.keyVersion));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("Unable to decrypt provider credential");
    }
  }
}
