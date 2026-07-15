import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import type { PrismaBillingClient } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import type { PrismaIdentityClient } from "../apps/api-gateway/src/identity/identity.repository.ts";

describe("billing and identity seed separation", () => {
  it("keeps repository defaults free from demo tenants, users, invoices and passwords", async () => {
    const billing = BillingRepository.inMemory();
    const identity = IdentityRepository.inMemory();

    assert.equal(await billing.findTenant("tenant-volga"), undefined);
    assert.deepEqual(await billing.listTenantInvoices("tenant-volga"), []);
    assert.equal(await identity.findTenant("tenant-volga"), undefined);
    assert.equal(await identity.findTenantUserByEmail("sergey@volga.example"), undefined);
    assert.equal(await identity.findPasswordCredentialByEmail("service-admin@example.com"), undefined);
    assert.ok((await billing.listTariffs()).length > 0);
    assert.ok((await identity.listPermissionRoles()).length > 0);
  });

  it("does not infer fixture state from NODE_ENV under the Prisma runtime", async () => {
    // The Prisma-backed repositories read tenant/user/password state exclusively
    // from the injected client. Under NODE_ENV=development the composition must
    // not synthesize demo fixtures (tenant-volga, its users or passwords):
    // the empty fake clients below never return one, so any leak would come
    // from env-driven inference in the repository, which this guards against.
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const billing = BillingRepository.prisma({ client: createEmptyBillingClient() });
      const identity = IdentityRepository.prisma({ client: createEmptyIdentityClient() });

      assert.equal(await billing.findTenant("tenant-volga"), undefined);
      assert.deepEqual(await billing.listTenantInvoices("tenant-volga"), []);
      assert.equal(await identity.findTenant("tenant-volga"), undefined);
      assert.equal(await identity.findTenantUserByEmail("sergey@volga.example"), undefined);
      assert.equal(await identity.findPasswordCredentialByEmail("service-admin@example.com"), undefined);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});

function createEmptyIdentityClient(): PrismaIdentityClient {
  const client = {
    passwordCredential: {
      findUnique: async () => null
    },
    tenant: {
      findUnique: async () => null
    },
    tenantUser: {
      findFirst: async () => null
    }
  };
  return client as unknown as PrismaIdentityClient;
}

function createEmptyBillingClient(): PrismaBillingClient {
  const client = {
    billingInvoice: {
      findMany: async () => []
    },
    billingTenantState: {
      findUnique: async () => null
    }
  };
  return client as unknown as PrismaBillingClient;
}
