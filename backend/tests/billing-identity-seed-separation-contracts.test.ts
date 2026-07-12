import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { configureBillingRepository } from "../apps/api-gateway/src/billing/bootstrap.ts";
import { BillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { bootstrapBillingState } from "../apps/api-gateway/src/billing/seed.ts";
import { configureIdentityRepository } from "../apps/api-gateway/src/identity/bootstrap.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";

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

  it("injects local fixture state only when the composition caller passes it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "explicit-seed-bootstrap-"));
    try {
      const billing = configureBillingRepository({
        BILLING_REPOSITORY: "json",
        BILLING_STORE_FILE: join(directory, "billing.json"),
        NODE_ENV: "test"
      }, { seed: bootstrapBillingState() });
      const identity = configureIdentityRepository({
        IDENTITY_REPOSITORY: "json",
        IDENTITY_STORE_FILE: join(directory, "identity.json"),
        NODE_ENV: "test"
      }, { seed: bootstrapIdentityState() });

      assert.equal((await billing.findTenant("tenant-volga"))?.planId, "scale");
      assert.equal((await identity.findTenant("tenant-volga"))?.status, "watch");
      assert.ok(await identity.findPasswordCredentialByEmail("service-admin@example.com"));
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("does not infer fixture state from NODE_ENV", async () => {
    const directory = mkdtempSync(join(tmpdir(), "empty-bootstrap-"));
    try {
      const billing = configureBillingRepository({
        BILLING_REPOSITORY: "json",
        BILLING_STORE_FILE: join(directory, "billing.json"),
        NODE_ENV: "development"
      });
      const identity = configureIdentityRepository({
        IDENTITY_REPOSITORY: "json",
        IDENTITY_STORE_FILE: join(directory, "identity.json"),
        NODE_ENV: "development"
      });

      assert.equal(await billing.findTenant("tenant-volga"), undefined);
      assert.equal(await identity.findTenant("tenant-volga"), undefined);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
