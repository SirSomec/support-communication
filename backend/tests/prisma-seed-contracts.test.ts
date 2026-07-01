import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { tenantBillingStates } from "../apps/api-gateway/src/billing/billing.fixtures.ts";
import { permissionRoles, tenantAuditEvents, tenants, tenantUsers } from "../apps/api-gateway/src/identity/identity.fixtures.ts";
import { seedIdentityPrisma } from "../scripts/seed-identity.ts";

describe("Prisma identity seed contracts", () => {
  it("exposes a local Prisma seed script", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    assert.match(packageJson.scripts["prisma:seed"], /scripts\/seed-identity\.ts/);
    assert.match(packageJson.scripts["prisma:seed"], /--env-file=.env.example/);
    assert.match(packageJson.scripts["identity:bootstrap:postgres"], /prisma:migrate:deploy/);
    assert.match(packageJson.scripts["identity:bootstrap:postgres"], /prisma:seed/);
  });

  it("idempotently seeds tenants with canonical columns and full metadata", async () => {
    const client = createFakeSeedClient();

    const first = await seedIdentityPrisma(client);
    const second = await seedIdentityPrisma(client);

    assert.deepEqual(first, {
      billingTenantStates: tenantBillingStates.length,
      passwordCredentials: 1,
      passwordPolicies: 1,
      permissionRoles: permissionRoles.length,
      rbacPolicyVersions: 1,
      rbacRoleGrants: permissionRoles.reduce((total, role) => total + role.actions.length, 0),
      tenantAuditEvents: tenantAuditEvents.length,
      tenantUsers: tenantUsers.length,
      tenants: tenants.length
    });
    assert.deepEqual(second, first);
    assert.equal(client.calls.transactions, 2);
    assert.equal(client.calls.tenantCreates.length, tenants.length);
    assert.equal(client.calls.tenantUpdates.length, tenants.length);
    assert.equal(client.calls.passwordCredentialUpserts.length, 2);
    assert.equal(client.calls.passwordPolicyUpserts.length, 2);
    assert.equal(client.calls.rbacPolicyVersionUpdateMany.length, 2);
    assert.equal(client.calls.rbacPolicyVersionUpserts.length, 2);
    assert.equal(client.calls.rbacRoleGrantUpserts.length, permissionRoles.reduce((total, role) => total + role.actions.length, 0) * 2);
    assert.equal(client.passwordCredentials.get("service-admin@example.com")?.hash, "sha256:9246aa9be8de7b40d64eb664986430793b6cc13a19d2a456981e44f28303f9cf");
    assert.doesNotMatch(client.passwordCredentials.get("service-admin@example.com")?.hash ?? "", /correct-password/);
    assert.equal(client.passwordPolicies.get("service-admin")?.requireMfa, true);

    const volga = client.tenants.get("tenant-volga");
    assert.ok(volga);
    assert.equal(volga.name, "Volga Logistics");
    assert.equal(volga.status, "watch");
    assert.equal(volga.healthScore, 76);
    assert.equal(volga.metadata.legalName, "AO Volga Logistics");
    assert.equal(volga.metadata.planId, "scale");
    assert.equal(volga.metadata.region, "ru-west");
    assert.deepEqual(volga.metadata.domains, ["volga.example"]);
    assert.deepEqual(volga.metadata.incidentIds, ["inc-webhook-retry"]);
    assert.equal(volga.metadata.id, undefined);
    assert.equal(volga.metadata.name, undefined);
  });

  it("preserves live tenant status and custom metadata when reseeding existing rows", async () => {
    const client = createFakeSeedClient({
      tenants: [{
        healthScore: null,
        id: "tenant-volga",
        metadata: {
          custom: "keep",
          ownerEmail: "live-owner@volga.example"
        },
        name: "Volga Logistics",
        status: "restricted"
      }]
    });

    await seedIdentityPrisma(client);

    const volga = client.tenants.get("tenant-volga");
    assert.ok(volga);
    assert.equal(volga.status, "restricted");
    assert.equal(volga.healthScore, 76);
    assert.equal(volga.metadata.custom, "keep");
    assert.equal(volga.metadata.ownerEmail, "live-owner@volga.example");
    assert.equal(volga.metadata.region, "ru-west");
    assert.equal(client.calls.tenantUpdates.find((call) => call.where.id === "tenant-volga")?.data.status, undefined);
  });

  it("heals malformed canonical metadata while preserving valid live fields", async () => {
    const client = createFakeSeedClient({
      tenants: [{
        healthScore: null,
        id: "tenant-volga",
        metadata: {
          custom: "keep",
          domains: "bad-domains",
          flags: ["ff-live"],
          ownerEmail: "live-owner@volga.example",
          planId: 42,
          users: "312"
        },
        name: "Volga Logistics",
        status: "restricted"
      }]
    });

    await seedIdentityPrisma(client);

    const volga = client.tenants.get("tenant-volga");
    assert.ok(volga);
    assert.equal(volga.metadata.custom, "keep");
    assert.equal(volga.metadata.ownerEmail, "live-owner@volga.example");
    assert.equal(volga.metadata.planId, "scale");
    assert.deepEqual(volga.metadata.domains, ["volga.example"]);
    assert.deepEqual(volga.metadata.flags, ["ff-live"]);
    assert.equal(volga.metadata.users, 312);
  });

  it("idempotently seeds tenant audit rows after tenant rows", async () => {
    const client = createFakeSeedClient();

    await seedIdentityPrisma(client);

    assert.equal(client.calls.tenantAuditUpserts.length, tenantAuditEvents.length);
    assert.equal(
      Math.max(...client.calls.tenantCreates.map((call) => call.order)) <
        Math.min(...client.calls.tenantAuditUpserts.map((call) => call.order)),
      true
    );

    const audit = client.calls.tenantAuditUpserts.find((call) => call.where.id === "svc-audit-1004")?.create;
    assert.ok(audit);
    assert.equal(audit.tenantId, "tenant-volga");
    assert.equal(audit.action, "impersonation.start");
    assert.equal(audit.at instanceof Date, true);
    assert.equal(audit.traceId, "trc_service_admin_impersonation_1004");
  });

  it("seeds tenant users and permission roles without overwriting live user state", async () => {
    const client = createFakeSeedClient({
      tenantUsers: [{
        device: "Chrome, Windows",
        email: "sergey@volga.example",
        id: "usr-volga-admin",
        inviteStatus: "accepted",
        lastActiveAt: new Date("2026-06-27T07:19:00.000Z"),
        metadata: { custom: "keep" },
        mfa: "reset_pending",
        name: "Sergey Markin",
        risk: "high",
        role: "Admin",
        sessions: 7,
        status: "blocked",
        supportNotes: "Live support note",
        tenantId: "tenant-volga"
      }]
    });

    await seedIdentityPrisma(client);
    await seedIdentityPrisma(client);

    assert.equal(client.calls.tenantUserCreates.length, tenantUsers.length - 1);
    assert.equal(client.calls.permissionRoleCreates.length, permissionRoles.length);

    const user = client.tenantUsers.get("usr-volga-admin");
    assert.ok(user);
    assert.equal(user.status, "blocked");
    assert.equal(user.mfa, "reset_pending");
    assert.equal(user.sessions, 7);
    assert.equal(user.supportNotes, "Live support note");
    assert.equal(user.metadata.custom, "keep");
    assert.equal(user.name, "Sergey Markin");

    const adminRole = client.permissionRoles.get("admin");
    assert.ok(adminRole);
    assert.deepEqual(adminRole.actions, ["*"]);
    assert.equal(adminRole.aliases.includes("administrator"), true);
  });

  it("creates missing service-admin credentials without resetting existing password hashes", async () => {
    const client = createFakeSeedClient({
      passwordCredentials: [{
        algorithm: "sha256",
        email: "service-admin@example.com",
        hash: "sha256:live-custom-password-hash",
        subjectId: "svc-admin-001",
        updatedAt: "2026-06-29T09:00:00.000Z",
        version: 7
      }],
      passwordPolicies: [{
        maxFailedAttempts: 3,
        minLength: 16,
        requireMfa: true,
        scope: "service-admin",
        updatedAt: "2026-06-29T09:00:00.000Z"
      }]
    });

    await seedIdentityPrisma(client);

    const credential = client.passwordCredentials.get("service-admin@example.com");
    const policy = client.passwordPolicies.get("service-admin");
    assert.ok(credential);
    assert.equal(credential.hash, "sha256:live-custom-password-hash");
    assert.equal(credential.version, 7);
    assert.equal(credential.updatedAt, "2026-06-29T09:00:00.000Z");
    assert.equal(client.calls.passwordCredentialUpserts[0].update.hash, undefined);
    assert.equal(client.calls.passwordCredentialUpserts[0].update.version, undefined);
    assert.ok(policy);
    assert.equal(policy.minLength, 12);
    assert.equal(policy.maxFailedAttempts, 5);
  });

  it("seeds billing tenant states without overwriting live tariff and usage state", async () => {
    const client = createFakeSeedClient({
      billingTenantStates: [{
        arr: 1548000,
        healthScore: 77,
        id: "tenant-lumen",
        monthlyRevenue: 129000,
        name: "Lumen Health",
        owner: "Live Billing Owner",
        planId: "business",
        region: "ru-live",
        sla: "99.7",
        status: "trial",
        usage: {
          aiTokens: 200000,
          botRuns: 1500,
          channels: 3,
          operators: 24,
          reportExports: 12,
          storageGb: 19,
          webhooks: 25000
        },
        users: 24,
        workspaces: 2
      }]
    });

    await seedIdentityPrisma(client);
    await seedIdentityPrisma(client);

    assert.equal(client.calls.billingTenantStateCreates.length, tenantBillingStates.length - 1);
    assert.equal(client.calls.billingTenantStateUpdates.length, tenantBillingStates.length + 1);

    const lumen = client.billingTenantStates.get("tenant-lumen");
    assert.ok(lumen);
    assert.equal(lumen.planId, "business");
    assert.equal(lumen.monthlyRevenue, 129000);
    assert.equal(lumen.arr, 1548000);
    assert.equal(lumen.usage.webhooks, 25000);
    assert.equal(lumen.name, "Lumen Health");
    assert.equal(lumen.owner, "Live Billing Owner");
    assert.equal(lumen.region, "ru-live");
    assert.equal(lumen.sla, "99.7");
    assert.equal(lumen.healthScore, 77);

    const update = client.calls.billingTenantStateUpdates.find((call) => call.where.id === "tenant-lumen");
    assert.ok(update);
    assert.equal(update.data.planId, undefined);
    assert.equal(update.data.monthlyRevenue, undefined);
    assert.equal(update.data.arr, undefined);
    assert.equal(update.data.usage, undefined);
    assert.equal(update.data.owner, undefined);
    assert.equal(update.data.region, undefined);
    assert.equal(update.data.sla, undefined);
    assert.equal(update.data.healthScore, undefined);
  });
});

function createFakeSeedClient(seed: {
  billingTenantStates?: FakeBillingTenantStateRow[];
  passwordCredentials?: FakePasswordCredentialRow[];
  passwordPolicies?: FakePasswordPolicyRow[];
  permissionRoles?: FakePermissionRoleRow[];
  tenants?: FakeTenantRow[];
  tenantUsers?: FakeTenantUserRow[];
} = {}) {
  let order = 0;
  const billingTenantStateRows = new Map<string, FakeBillingTenantStateRow>((seed.billingTenantStates ?? []).map((tenant) => [tenant.id, clone(tenant)]));
  const permissionRoleRows = new Map<string, FakePermissionRoleRow>((seed.permissionRoles ?? []).map((role) => [role.key, clone(role)]));
  const rbacPolicyVersionRows = new Map<string, FakeRbacPolicyVersionRow>();
  const rbacRoleGrantRows = new Map<string, FakeRbacRoleGrantRow>();
  const passwordCredentialRows = new Map<string, FakePasswordCredentialRow>((seed.passwordCredentials ?? []).map((credential) => [credential.email, clone(credential)]));
  const passwordPolicyRows = new Map<string, FakePasswordPolicyRow>((seed.passwordPolicies ?? []).map((policy) => [policy.scope, clone(policy)]));
  const tenantRows = new Map<string, FakeTenantRow>((seed.tenants ?? []).map((tenant) => [tenant.id, clone(tenant)]));
  const tenantUserRows = new Map<string, FakeTenantUserRow>((seed.tenantUsers ?? []).map((user) => [user.id, clone(user)]));
  const tenantAuditRows = new Set<string>();
  const calls = {
    billingTenantStateCreates: [] as Array<SeedCreateCall<FakeBillingTenantStateRow>>,
    billingTenantStateFinds: [] as Array<{ order: number; where: { id: string } }>,
    billingTenantStateUpdates: [] as Array<SeedUpdateCall<Partial<FakeBillingTenantStateRow>>>,
    passwordCredentialUpserts: [] as Array<SeedUpsertCall<FakePasswordCredentialRow, { email: string }>>,
    passwordPolicyUpserts: [] as Array<SeedUpsertCall<FakePasswordPolicyRow, { scope: string }>>,
    permissionRoleCreates: [] as Array<SeedCreateCall<FakePermissionRoleRow>>,
    permissionRoleFinds: [] as Array<{ order: number; where: { key: string } }>,
    permissionRoleUpdates: [] as Array<SeedUpdateCall<Partial<FakePermissionRoleRow>, { key: string }>>,
    rbacPolicyVersionUpdateMany: [] as Array<SeedUpdateManyCall<{ status: string }, { id: { not: string }; status: string }>>,
    rbacPolicyVersionUpserts: [] as Array<SeedUpsertCall<FakeRbacPolicyVersionRow, { id: string }>>,
    rbacRoleGrantUpserts: [] as Array<SeedUpsertCall<FakeRbacRoleGrantRow, { id: string }>>,
    tenantAuditUpserts: [] as Array<SeedCall<Record<string, unknown>>>,
    tenantCreates: [] as Array<SeedCreateCall<FakeTenantRow>>,
    tenantFinds: [] as Array<{ order: number; where: { id: string } }>,
    tenantUpdates: [] as Array<SeedUpdateCall<Partial<FakeTenantRow>>>,
    tenantUserCreates: [] as Array<SeedCreateCall<FakeTenantUserRow>>,
    tenantUserFinds: [] as Array<{ order: number; where: { id: string } }>,
    tenantUserUpdates: [] as Array<SeedUpdateCall<Partial<FakeTenantUserRow>>>,
    transactions: 0
  };
  const delegates = {
    billingTenantState: {
      create: async (input: { data: FakeBillingTenantStateRow }) => {
        calls.billingTenantStateCreates.push({ data: clone(input.data), order: ++order });
        billingTenantStateRows.set(input.data.id, clone(input.data));
        return clone(input.data);
      },
      findUnique: async (input: { where: { id: string } }) => {
        calls.billingTenantStateFinds.push({ ...input, order: ++order });
        return clone(billingTenantStateRows.get(input.where.id) ?? null);
      },
      update: async (input: { data: Partial<FakeBillingTenantStateRow>; where: { id: string } }) => {
        calls.billingTenantStateUpdates.push({ data: clone(input.data), order: ++order, where: input.where });
        const current = billingTenantStateRows.get(input.where.id);
        if (!current) {
          throw new Error(`Missing fake billing tenant state ${input.where.id}`);
        }

        const next = { ...current, ...input.data } as FakeBillingTenantStateRow;
        billingTenantStateRows.set(next.id, clone(next));
        return clone(next);
      }
    },
    passwordCredential: {
      upsert: async (input: {
        create: FakePasswordCredentialRow;
        update: Partial<FakePasswordCredentialRow>;
        where: { email: string };
      }) => {
        calls.passwordCredentialUpserts.push({ create: clone(input.create), order: ++order, update: clone(input.update), where: input.where });
        const existing = passwordCredentialRows.get(input.where.email);
        const next = existing ? { ...existing, ...input.update } as FakePasswordCredentialRow : clone(input.create);
        passwordCredentialRows.set(input.where.email, clone(next));
        return clone(next);
      }
    },
    passwordPolicy: {
      upsert: async (input: {
        create: FakePasswordPolicyRow;
        update: Partial<FakePasswordPolicyRow>;
        where: { scope: string };
      }) => {
        calls.passwordPolicyUpserts.push({ create: clone(input.create), order: ++order, update: clone(input.update), where: input.where });
        const existing = passwordPolicyRows.get(input.where.scope);
        const next = existing ? { ...existing, ...input.update } as FakePasswordPolicyRow : clone(input.create);
        passwordPolicyRows.set(input.where.scope, clone(next));
        return clone(next);
      }
    },
    permissionRole: {
      create: async (input: { data: FakePermissionRoleRow }) => {
        calls.permissionRoleCreates.push({ data: clone(input.data), order: ++order });
        permissionRoleRows.set(input.data.key, clone(input.data));
        return clone(input.data);
      },
      findUnique: async (input: { where: { key: string } }) => {
        calls.permissionRoleFinds.push({ ...input, order: ++order });
        return clone(permissionRoleRows.get(input.where.key) ?? null);
      },
      update: async (input: { data: Partial<FakePermissionRoleRow>; where: { key: string } }) => {
        calls.permissionRoleUpdates.push({ data: clone(input.data), order: ++order, where: input.where });
        const current = permissionRoleRows.get(input.where.key);
        if (!current) {
          throw new Error(`Missing fake permission role ${input.where.key}`);
        }

        const next = { ...current, ...input.data } as FakePermissionRoleRow;
        permissionRoleRows.set(next.key, clone(next));
        return clone(next);
      }
    },
    rbacPolicyVersion: {
      updateMany: async (input: {
        data: { status: string };
        where: { id: { not: string }; status: string };
      }) => {
        calls.rbacPolicyVersionUpdateMany.push({ data: clone(input.data), order: ++order, where: input.where });
        let count = 0;
        for (const [id, row] of rbacPolicyVersionRows.entries()) {
          if (id !== input.where.id.not && row.status === input.where.status) {
            rbacPolicyVersionRows.set(id, { ...row, status: input.data.status });
            count += 1;
          }
        }
        return { count };
      },
      upsert: async (input: {
        create: FakeRbacPolicyVersionRow;
        update: Partial<FakeRbacPolicyVersionRow>;
        where: { id: string };
      }) => {
        calls.rbacPolicyVersionUpserts.push({ create: clone(input.create), order: ++order, update: clone(input.update), where: input.where });
        const existing = rbacPolicyVersionRows.get(input.where.id);
        const next = existing ? { ...existing, ...input.update } as FakeRbacPolicyVersionRow : clone(input.create);
        rbacPolicyVersionRows.set(input.where.id, clone(next));
        return clone(next);
      }
    },
    rbacRoleGrant: {
      upsert: async (input: {
        create: FakeRbacRoleGrantRow;
        update: Partial<FakeRbacRoleGrantRow>;
        where: { id: string };
      }) => {
        calls.rbacRoleGrantUpserts.push({ create: clone(input.create), order: ++order, update: clone(input.update), where: input.where });
        const existing = rbacRoleGrantRows.get(input.where.id);
        const next = existing ? { ...existing, ...input.update } as FakeRbacRoleGrantRow : clone(input.create);
        rbacRoleGrantRows.set(input.where.id, clone(next));
        return clone(next);
      }
    },
    tenant: {
      create: async (input: { data: FakeTenantRow }) => {
        calls.tenantCreates.push({ data: clone(input.data), order: ++order });
        tenantRows.set(input.data.id, clone(input.data));
        return clone(input.data);
      },
      findUnique: async (input: { where: { id: string } }) => {
        calls.tenantFinds.push({ ...input, order: ++order });
        return clone(tenantRows.get(input.where.id) ?? null);
      },
      update: async (input: { data: Partial<FakeTenantRow>; where: { id: string } }) => {
        calls.tenantUpdates.push({ data: clone(input.data), order: ++order, where: input.where });
        const current = tenantRows.get(input.where.id);
        if (!current) {
          throw new Error(`Missing fake tenant ${input.where.id}`);
        }

        const next = { ...current, ...input.data } as FakeTenantRow;
        tenantRows.set(next.id, clone(next));
        return clone(next);
      }
    },
    tenantAuditEvent: {
      upsert: async (input: SeedCall<Record<string, unknown>>) => {
        calls.tenantAuditUpserts.push({ ...input, order: ++order });
        tenantAuditRows.add(input.where.id);
        return input.create;
      }
    },
    tenantUser: {
      create: async (input: { data: FakeTenantUserRow }) => {
        calls.tenantUserCreates.push({ data: clone(input.data), order: ++order });
        tenantUserRows.set(input.data.id, clone(input.data));
        return clone(input.data);
      },
      findUnique: async (input: { where: { id: string } }) => {
        calls.tenantUserFinds.push({ ...input, order: ++order });
        return clone(tenantUserRows.get(input.where.id) ?? null);
      },
      update: async (input: { data: Partial<FakeTenantUserRow>; where: { id: string } }) => {
        calls.tenantUserUpdates.push({ data: clone(input.data), order: ++order, where: input.where });
        const current = tenantUserRows.get(input.where.id);
        if (!current) {
          throw new Error(`Missing fake tenant user ${input.where.id}`);
        }

        const next = { ...current, ...input.data } as FakeTenantUserRow;
        tenantUserRows.set(next.id, clone(next));
        return clone(next);
      }
    }
  };

  return {
    ...delegates,
    billingTenantStates: billingTenantStateRows,
    calls,
    passwordCredentials: passwordCredentialRows,
    passwordPolicies: passwordPolicyRows,
    permissionRoles: permissionRoleRows,
    rbacPolicyVersions: rbacPolicyVersionRows,
    rbacRoleGrants: rbacRoleGrantRows,
    tenantAuditRows,
    tenantUsers: tenantUserRows,
    tenants: tenantRows,
    $transaction: async <T>(operation: (transactionClient: typeof delegates) => Promise<T>) => {
      calls.transactions += 1;
      return operation(delegates);
    }
  };
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

interface FakeTenantRow {
  healthScore: number | null;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  status: string;
}

interface FakeTenantUserRow {
  device: string;
  email: string;
  id: string;
  inviteStatus: string;
  lastActiveAt: Date | string | null;
  metadata: Record<string, unknown>;
  mfa: string;
  name: string;
  risk: string;
  role: string;
  sessions: number;
  status: string;
  supportNotes: string;
  tenantId: string;
}

interface FakePermissionRoleRow {
  actions: string[];
  aliases: string[];
  description: string;
  groupIds: string[];
  key: string;
  metadata: Record<string, unknown>;
}

interface FakeRbacPolicyVersionRow {
  activatedAt: Date | string | null;
  checksum: string;
  createdAt: Date | string;
  createdBy: string;
  description: string;
  id: string;
  status: string;
  version: string;
}

interface FakeRbacRoleGrantRow {
  action: string;
  createdAt: Date | string;
  createdBy: string;
  effect: string;
  id: string;
  policyVersionId: string;
  resource: string;
  roleKey: string;
  tenantId: string | null;
  traceId: string;
}

interface FakeBillingTenantStateRow {
  arr: number;
  healthScore: number;
  id: string;
  monthlyRevenue: number;
  name: string;
  owner: string;
  planId: string;
  region: string;
  sla: string;
  status: string;
  usage: {
    aiTokens: number;
    botRuns: number;
    channels: number;
    operators: number;
    reportExports: number;
    storageGb: number;
    webhooks: number;
  };
  users: number;
  workspaces: number;
}

interface FakePasswordCredentialRow {
  algorithm: string;
  email: string;
  hash: string;
  subjectId: string;
  updatedAt: Date | string;
  version: number;
}

interface FakePasswordPolicyRow {
  maxFailedAttempts: number;
  minLength: number;
  requireMfa: boolean;
  scope: string;
  updatedAt: Date | string;
}

interface SeedCreateCall<TData> {
  data: TData;
  order: number;
}

interface SeedUpdateCall<TData, TWhere = { id: string }> {
  data: TData;
  order: number;
  where: TWhere;
}

interface SeedUpdateManyCall<TData, TWhere> {
  data: TData;
  order: number;
  where: TWhere;
}

interface SeedCall<TCreate> {
  create: TCreate;
  order: number;
  update: Partial<TCreate>;
  where: { id: string };
}

interface SeedUpsertCall<TCreate, TWhere> {
  create: TCreate;
  order: number;
  update: Partial<TCreate>;
  where: TWhere;
}
