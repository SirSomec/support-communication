import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IntegrationRepository,
  type PrismaIntegrationClient,
  type ProviderConnectionCredentialRecord
} from "../apps/api-gateway/src/integrations/integration.repository.ts";

const credential = (overrides: Partial<ProviderConnectionCredentialRecord> = {}): ProviderConnectionCredentialRecord => ({
  accessTokenEncrypted: "encrypted-token",
  apiVersion: "5.199",
  channelConnectionId: "conn-vk-1",
  confirmationCodeEncrypted: "encrypted-confirmation",
  createdAt: "2026-07-12T10:00:00.000Z",
  externalAccountId: "group-1",
  keyVersion: "v1",
  lastError: null,
  lastWebhookAt: null,
  provider: "VK",
  status: "active",
  tenantId: "tenant-1",
  updatedAt: "2026-07-12T10:00:00.000Z",
  webhookSecretEncrypted: "encrypted-secret",
  ...overrides
});

describe("ProviderConnectionCredential repository contracts", () => {
  it("normalizes, upserts, isolates by tenant, and lists active provider credentials in JSON state", () => {
    const repository = IntegrationRepository.inMemory();
    repository.saveProviderConnectionCredential(credential());
    repository.saveProviderConnectionCredential(credential({ accessTokenEncrypted: "rotated", updatedAt: "2026-07-12T11:00:00.000Z" }));
    repository.saveProviderConnectionCredential(credential({ channelConnectionId: "conn-vk-disabled", status: "disabled" }));
    repository.saveProviderConnectionCredential(credential({ channelConnectionId: "conn-max-1", provider: "MAX" }));

    assert.equal(repository.findProviderConnectionCredential("tenant-1", "conn-vk-1")?.accessTokenEncrypted, "rotated");
    assert.equal(repository.findProviderConnectionCredential("tenant-2", "conn-vk-1"), undefined);
    assert.deepEqual(repository.listActiveProviderConnectionCredentials("tenant-1", "vk").map((item) => item.channelConnectionId), ["conn-vk-1"]);
    assert.equal(repository.readState().providerConnectionCredentials?.length, 3);
  });

  it("uses the Prisma delegate for async find, active list, and upsert", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const providerDelegate = {
      findMany: ({ where }: { where?: Record<string, unknown> }) => [...rows.values()].filter((row) =>
        Object.entries(where ?? {}).every(([key, value]) => row[key] === value)
      ),
      findUnique: ({ where }: { where: { channelConnectionId: string } }) => rows.get(where.channelConnectionId) ?? null,
      upsert: ({ create, update, where }: { create: Record<string, unknown>; update: Record<string, unknown>; where: { channelConnectionId: string } }) => {
        const row = { ...(rows.get(where.channelConnectionId) ?? create), ...update };
        rows.set(where.channelConnectionId, row);
        return row;
      }
    };
    const genericDelegate = new Proxy({}, { get: () => () => [] });
    const client = new Proxy({ providerConnectionCredential: providerDelegate }, {
      get: (target, property) => property in target ? target[property as keyof typeof target] : genericDelegate
    }) as unknown as PrismaIntegrationClient;
    const repository = IntegrationRepository.prisma({ client });

    await repository.saveProviderConnectionCredentialAsync(credential());
    await repository.saveProviderConnectionCredentialAsync(credential({ accessTokenEncrypted: "rotated" }));

    assert.equal((await repository.findProviderConnectionCredentialAsync("tenant-1", "conn-vk-1"))?.accessTokenEncrypted, "rotated");
    assert.equal(await repository.findProviderConnectionCredentialAsync("tenant-2", "conn-vk-1"), undefined);
    assert.deepEqual((await repository.listActiveProviderConnectionCredentialsAsync("tenant-1", "VK")).map((item) => item.channelConnectionId), ["conn-vk-1"]);
  });

  it("fails closed when the Prisma credential delegate is absent", () => {
    const genericDelegate = new Proxy({}, { get: () => () => [] });
    const client = new Proxy({}, {
      get: (_target, property) => property === "providerConnectionCredential" ? undefined : genericDelegate
    }) as PrismaIntegrationClient;
    assert.throws(() => IntegrationRepository.prisma({ client }), /provider_connection_credential_delegate_required/);
  });
});
