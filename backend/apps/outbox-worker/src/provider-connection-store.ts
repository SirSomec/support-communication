import { createDecipheriv } from "node:crypto";

const CREDENTIAL_ERROR = "Provider credential is unavailable";
const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = 1;

type ProviderCredentialRow = {
  accessTokenEncrypted: string;
  apiVersion: string | null;
  channelConnectionId: string;
  externalAccountId: string;
  keyVersion: string;
  provider: string;
  status: string;
  tenantId: string;
};

export interface PrismaProviderConnectionCredentialClient {
  providerConnectionCredential: {
    findUnique(args: {
      where: {
        tenantId_channelConnectionId: {
          channelConnectionId: string;
          tenantId: string;
        };
      };
    }): Promise<ProviderCredentialRow | null>;
  };
}

export type ResolvedProviderCredential = {
  apiVersion: string | null;
  externalAccountId: string;
  token: string;
};

type CredentialEnvelope = {
  algorithm?: unknown;
  authTag?: unknown;
  ciphertext?: unknown;
  envelopeVersion?: unknown;
  iv?: unknown;
  keyVersion?: unknown;
};

function decodeBase64(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(CREDENTIAL_ERROR);
  const normalized = value.replace(/=+$/, "");
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length === 0 ||
    (expectedLength !== undefined && decoded.length !== expectedLength) ||
    decoded.toString("base64").replace(/=+$/, "") !== normalized
  ) throw new Error(CREDENTIAL_ERROR);
  return decoded;
}

function decryptAccessToken(encrypted: string, keyVersion: string, encodedMasterKey: string | undefined): string {
  const key = decodeBase64(encodedMasterKey, 32);
  const envelope = JSON.parse(encrypted) as CredentialEnvelope;
  if (
    envelope.algorithm !== ALGORITHM ||
    envelope.envelopeVersion !== ENVELOPE_VERSION ||
    envelope.keyVersion !== keyVersion
  ) throw new Error(CREDENTIAL_ERROR);

  const decipher = createDecipheriv(ALGORITHM, key, decodeBase64(envelope.iv, 12), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`provider-credential:${ENVELOPE_VERSION}:${keyVersion}`, "utf8"));
  decipher.setAuthTag(decodeBase64(envelope.authTag, 16));
  const token = Buffer.concat([
    decipher.update(decodeBase64(envelope.ciphertext)),
    decipher.final()
  ]).toString("utf8");
  if (token.length === 0) throw new Error(CREDENTIAL_ERROR);
  return token;
}

export async function resolveProviderConnectionCredential(
  client: PrismaProviderConnectionCredentialClient,
  tenantId: string,
  channelConnectionId: string,
  provider: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<ResolvedProviderCredential> {
  try {
    if (!tenantId || !channelConnectionId || !provider) throw new Error(CREDENTIAL_ERROR);
    const row = await client.providerConnectionCredential.findUnique({
      where: { tenantId_channelConnectionId: { tenantId, channelConnectionId } }
    });
    if (
      !row ||
      row.tenantId !== tenantId ||
      row.channelConnectionId !== channelConnectionId ||
      row.provider !== provider ||
      row.status !== "active"
    ) throw new Error(CREDENTIAL_ERROR);

    return {
      token: decryptAccessToken(row.accessTokenEncrypted, row.keyVersion, environment.PROVIDER_CREDENTIAL_MASTER_KEY),
      externalAccountId: row.externalAccountId,
      apiVersion: row.apiVersion
    };
  } catch {
    throw new Error(CREDENTIAL_ERROR);
  }
}
