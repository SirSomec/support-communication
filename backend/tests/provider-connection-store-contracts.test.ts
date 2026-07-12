import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { ProviderConnectionCrypto } from "../apps/api-gateway/src/integrations/provider-connection-crypto.ts";
import {
  resolveProviderConnectionCredential,
  type PrismaProviderConnectionCredentialClient
} from "../apps/outbox-worker/src/provider-connection-store.ts";

const key = randomBytes(32).toString("base64");
const crypto = new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: key });

function client(overrides: Record<string, unknown> = {}): PrismaProviderConnectionCredentialClient {
  const row = {
    tenantId: "tenant-1",
    channelConnectionId: "connection-1",
    provider: "vk",
    status: "active",
    accessTokenEncrypted: JSON.stringify(crypto.encrypt("private-provider-token")),
    keyVersion: "v1",
    externalAccountId: "group-42",
    apiVersion: "5.199",
    ...overrides
  };
  return { providerConnectionCredential: { async findUnique() { return row; } } } as PrismaProviderConnectionCredentialClient;
}

const resolve = (db = client(), environment = { PROVIDER_CREDENTIAL_MASTER_KEY: key }) =>
  resolveProviderConnectionCredential(db, "tenant-1", "connection-1", "vk", environment);

describe("outbox provider credential resolver", () => {
  it("loads and decrypts an active credential for the requested connection", async () => {
    const result = await resolve();
    assert.deepEqual(result, { token: "private-provider-token", externalAccountId: "group-42", apiVersion: "5.199" });
  });

  it("uses the tenant-scoped unique lookup", async () => {
    let where: unknown;
    const db = client();
    const original = db.providerConnectionCredential.findUnique;
    db.providerConnectionCredential.findUnique = async (args) => { where = args.where; return original(args); };
    await resolve(db);
    assert.deepEqual(where, { tenantId_channelConnectionId: { tenantId: "tenant-1", channelConnectionId: "connection-1" } });
  });

  it("fails closed for missing, cross-tenant, wrong-provider, or inactive rows", async () => {
    const cases = [
      { missing: true },
      { tenantId: "tenant-2" },
      { channelConnectionId: "connection-2" },
      { provider: "max" },
      { status: "disabled" }
    ];
    for (const value of cases) {
      const db = value.missing
        ? { providerConnectionCredential: { async findUnique() { return null; } } } as PrismaProviderConnectionCredentialClient
        : client(value);
      await assert.rejects(resolve(db), { message: "Provider credential is unavailable" });
    }
  });

  it("fails closed for invalid keys, versions, and encrypted envelopes without leaking secrets", async () => {
    const attempts = [
      resolve(client(), { PROVIDER_CREDENTIAL_MASTER_KEY: randomBytes(32).toString("base64") }),
      resolve(client({ keyVersion: "v2" })),
      resolve(client({ accessTokenEncrypted: "private-provider-token" }))
    ];
    for (const attempt of attempts) {
      await assert.rejects(attempt, (error: Error) => {
        assert.equal(error.message, "Provider credential is unavailable");
        assert.doesNotMatch(error.message, /private-provider-token|group-42|connection-1/);
        return true;
      });
    }
  });
});
