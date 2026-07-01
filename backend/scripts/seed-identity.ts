import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "@support-communication/database";
import { tenantBillingStates } from "../apps/api-gateway/src/billing/billing.fixtures.ts";
import { serviceAdminSession, permissionRoles, tenantAuditEvents, tenants, tenantUsers } from "../apps/api-gateway/src/identity/identity.fixtures.ts";
import { hashPasswordCredential } from "../apps/api-gateway/src/identity/identity.repository.ts";

export interface IdentitySeedResult {
  billingTenantStates: number;
  passwordCredentials: number;
  passwordPolicies: number;
  permissionRoles: number;
  rbacPolicyVersions: number;
  rbacRoleGrants: number;
  tenantAuditEvents: number;
  tenantUsers: number;
  tenants: number;
}

export interface PrismaIdentitySeedClient extends PrismaIdentitySeedDelegates {
  $disconnect?(): Promise<void>;
  $transaction<TResult>(operation: (client: PrismaIdentitySeedDelegates) => Promise<TResult>): Promise<TResult>;
}

interface PrismaIdentitySeedDelegates {
  billingTenantState: {
    create(input: { data: PrismaBillingTenantStateSeedInput }): Promise<PrismaBillingTenantStateSeedInput>;
    findUnique(input: { where: { id: string } }): Promise<PrismaBillingTenantStateSeedInput | null>;
    update(input: {
      data: Partial<Omit<PrismaBillingTenantStateSeedInput, "id" | "planId" | "monthlyRevenue" | "arr" | "usage">>;
      where: { id: string };
    }): Promise<PrismaBillingTenantStateSeedInput>;
  };
  permissionRole: {
    create(input: { data: PrismaPermissionRoleSeedInput }): Promise<PrismaPermissionRoleSeedInput>;
    findUnique(input: { where: { key: string } }): Promise<PrismaPermissionRoleSeedInput | null>;
    update(input: {
      data: Partial<Omit<PrismaPermissionRoleSeedInput, "key">>;
      where: { key: string };
    }): Promise<PrismaPermissionRoleSeedInput>;
  };
  rbacPolicyVersion: {
    updateMany(input: {
      data: { status: "retired" };
      where: { id: { not: string }; status: "active" };
    }): Promise<unknown>;
    upsert(input: {
      create: PrismaRbacPolicyVersionSeedInput;
      update: Partial<PrismaRbacPolicyVersionSeedInput>;
      where: { id: string };
    }): Promise<unknown>;
  };
  rbacRoleGrant: {
    upsert(input: {
      create: PrismaRbacRoleGrantSeedInput;
      update: Partial<PrismaRbacRoleGrantSeedInput>;
      where: { id: string };
    }): Promise<unknown>;
  };
  passwordCredential: {
    upsert(input: {
      create: PrismaPasswordCredentialSeedInput;
      update: Partial<PrismaPasswordCredentialSeedInput>;
      where: { email: string };
    }): Promise<unknown>;
  };
  passwordPolicy: {
    upsert(input: {
      create: PrismaPasswordPolicySeedInput;
      update: Partial<PrismaPasswordPolicySeedInput>;
      where: { scope: string };
    }): Promise<unknown>;
  };
  tenant: {
    create(input: { data: PrismaTenantSeedInput }): Promise<PrismaTenantSeedInput>;
    findUnique(input: { where: { id: string } }): Promise<PrismaTenantSeedInput | null>;
    update(input: {
      data: Partial<Omit<PrismaTenantSeedInput, "id" | "status">>;
      where: { id: string };
    }): Promise<PrismaTenantSeedInput>;
  };
  tenantAuditEvent: {
    upsert(input: {
      create: PrismaTenantAuditEventSeedInput;
      update: Partial<PrismaTenantAuditEventSeedInput>;
      where: { id: string };
    }): Promise<unknown>;
  };
  tenantUser: {
    create(input: { data: PrismaTenantUserSeedInput }): Promise<PrismaTenantUserSeedInput>;
    findUnique(input: { where: { id: string } }): Promise<PrismaTenantUserSeedInput | null>;
    update(input: {
      data: Partial<Omit<PrismaTenantUserSeedInput, "id">>;
      where: { id: string };
    }): Promise<PrismaTenantUserSeedInput>;
  };
}

interface PrismaBillingTenantStateSeedInput {
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

interface PrismaTenantSeedInput {
  healthScore: number | null;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  status: string;
}

interface PrismaTenantUserSeedInput {
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

interface PrismaPermissionRoleSeedInput {
  actions: string[];
  aliases: string[];
  description: string;
  groupIds: string[];
  key: string;
  metadata: Record<string, unknown>;
}

interface PrismaRbacPolicyVersionSeedInput {
  activatedAt: Date | null;
  checksum: string;
  createdAt: Date;
  createdBy: string;
  description: string;
  id: string;
  status: string;
  version: string;
}

interface PrismaRbacRoleGrantSeedInput {
  action: string;
  createdAt: Date;
  createdBy: string;
  effect: string;
  id: string;
  policyVersionId: string;
  resource: string;
  roleKey: string;
  tenantId: string | null;
  traceId: string;
}

interface PrismaPasswordCredentialSeedInput {
  algorithm: "sha256";
  email: string;
  hash: string;
  subjectId: string;
  updatedAt: Date;
  version: number;
}

interface PrismaPasswordPolicySeedInput {
  maxFailedAttempts: number;
  minLength: number;
  requireMfa: boolean;
  scope: string;
  updatedAt: Date;
}

interface PrismaTenantAuditEventSeedInput {
  action: string;
  actor: string;
  at: Date;
  id: string;
  reason: string;
  result: string;
  severity: string;
  target: string;
  tenantId: string;
  traceId: string;
}

export async function seedIdentityPrisma(client: PrismaIdentitySeedClient): Promise<IdentitySeedResult> {
  return client.$transaction(async (transaction) => {
    for (const tenant of tenants) {
      const create = toTenantSeedInput(tenant);
      const existing = await transaction.tenant.findUnique({ where: { id: tenant.id } });

      if (!existing) {
        await transaction.tenant.create({ data: create });
        continue;
      }

      await transaction.tenant.update({
        data: {
          healthScore: existing.healthScore ?? create.healthScore,
          metadata: mergeTenantSeedMetadata(create.metadata, existing.metadata),
          name: create.name
        },
        where: { id: tenant.id }
      });
    }

    for (const user of tenantUsers) {
      const create = toTenantUserSeedInput(user);
      const existing = await transaction.tenantUser.findUnique({ where: { id: user.id } });

      if (!existing) {
        await transaction.tenantUser.create({ data: create });
        continue;
      }

      await transaction.tenantUser.update({
        data: {
          device: existing.device || create.device,
          email: create.email,
          inviteStatus: existing.inviteStatus || create.inviteStatus,
          lastActiveAt: existing.lastActiveAt ?? create.lastActiveAt,
          metadata: {
            ...create.metadata,
            ...toJsonRecord(existing.metadata)
          },
          mfa: existing.mfa || create.mfa,
          name: create.name,
          risk: existing.risk || create.risk,
          role: existing.role || create.role,
          sessions: Number.isFinite(existing.sessions) ? existing.sessions : create.sessions,
          status: existing.status || create.status,
          supportNotes: existing.supportNotes || create.supportNotes,
          tenantId: create.tenantId
        },
        where: { id: user.id }
      });
    }

    for (const role of permissionRoles) {
      const create = toPermissionRoleSeedInput(role);
      const existing = await transaction.permissionRole.findUnique({ where: { key: role.key } });

      if (!existing) {
        await transaction.permissionRole.create({ data: create });
        continue;
      }

      await transaction.permissionRole.update({
        data: {
          actions: create.actions,
          aliases: create.aliases,
          description: create.description,
          groupIds: create.groupIds,
          metadata: {
            ...create.metadata,
            ...toJsonRecord(existing.metadata)
          }
        },
        where: { key: role.key }
      });
    }

    const defaultRbacPolicy = defaultRbacPolicyVersionSeedInput();
    await transaction.rbacPolicyVersion.updateMany({
      data: { status: "retired" },
      where: { id: { not: defaultRbacPolicy.id }, status: "active" }
    });
    await transaction.rbacPolicyVersion.upsert({
      create: defaultRbacPolicy,
      update: {
        activatedAt: defaultRbacPolicy.activatedAt,
        checksum: defaultRbacPolicy.checksum,
        description: defaultRbacPolicy.description,
        status: defaultRbacPolicy.status,
        version: defaultRbacPolicy.version
      },
      where: { id: defaultRbacPolicy.id }
    });

    for (const grant of defaultRbacRoleGrantSeedInputs()) {
      await transaction.rbacRoleGrant.upsert({
        create: grant,
        update: {
          action: grant.action,
          effect: grant.effect,
          policyVersionId: grant.policyVersionId,
          resource: grant.resource,
          roleKey: grant.roleKey,
          tenantId: grant.tenantId
        },
        where: { id: grant.id }
      });
    }

    const passwordCredential = defaultServiceAdminPasswordCredential();
    await transaction.passwordCredential.upsert({
      create: passwordCredential,
      update: {
        algorithm: passwordCredential.algorithm,
        subjectId: passwordCredential.subjectId
      },
      where: { email: passwordCredential.email }
    });

    const passwordPolicy = defaultServiceAdminPasswordPolicy();
    await transaction.passwordPolicy.upsert({
      create: passwordPolicy,
      update: {
        maxFailedAttempts: passwordPolicy.maxFailedAttempts,
        minLength: passwordPolicy.minLength,
        requireMfa: passwordPolicy.requireMfa,
        updatedAt: passwordPolicy.updatedAt
      },
      where: { scope: passwordPolicy.scope }
    });

    for (const tenant of tenantBillingStates) {
      const create = toBillingTenantStateSeedInput(tenant);
      const existing = await transaction.billingTenantState.findUnique({ where: { id: tenant.id } });

      if (!existing) {
        await transaction.billingTenantState.create({ data: create });
        continue;
      }

      await transaction.billingTenantState.update({
        data: {
          name: existing.name || create.name,
          status: existing.status || create.status,
          users: Number.isFinite(existing.users) ? existing.users : create.users,
          workspaces: Number.isFinite(existing.workspaces) ? existing.workspaces : create.workspaces
        },
        where: { id: tenant.id }
      });
    }

    for (const event of tenantAuditEvents) {
      await transaction.tenantAuditEvent.upsert({
        create: {
          action: event.action,
          actor: event.actor,
          at: new Date(event.at),
          id: event.id,
          reason: event.reason,
          result: event.result,
          severity: event.severity,
          target: event.target,
          tenantId: event.tenantId,
          traceId: event.traceId
        },
        update: {},
        where: { id: event.id }
      });
    }

    return {
      billingTenantStates: tenantBillingStates.length,
      passwordCredentials: 1,
      passwordPolicies: 1,
      permissionRoles: permissionRoles.length,
      rbacPolicyVersions: 1,
      rbacRoleGrants: defaultRbacRoleGrantSeedInputs().length,
      tenantAuditEvents: tenantAuditEvents.length,
      tenantUsers: tenantUsers.length,
      tenants: tenants.length
    };
  });
}

function defaultServiceAdminPasswordCredential(): PrismaPasswordCredentialSeedInput {
  return {
    algorithm: "sha256",
    email: serviceAdminSession.adminEmail,
    hash: hashPasswordCredential("correct-password"),
    subjectId: serviceAdminSession.adminId,
    updatedAt: new Date("2026-06-28T00:00:00.000Z"),
    version: 1
  };
}

function defaultServiceAdminPasswordPolicy(): PrismaPasswordPolicySeedInput {
  return {
    maxFailedAttempts: 5,
    minLength: 12,
    requireMfa: true,
    scope: "service-admin",
    updatedAt: new Date("2026-06-28T00:00:00.000Z")
  };
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
}

const canonicalStringMetadataKeys = [
  "lastSeenAt",
  "legalName",
  "notes",
  "owner",
  "ownerEmail",
  "planId",
  "region"
] as const;
const canonicalNumberMetadataKeys = [
  "activeUsers",
  "arr",
  "monthlyRevenue",
  "sla",
  "users",
  "workspaces"
] as const;
const canonicalArrayMetadataKeys = ["domains", "flags", "incidentIds"] as const;

function mergeTenantSeedMetadata(seed: Record<string, unknown>, existingValue: unknown): Record<string, unknown> {
  const existing = toJsonRecord(existingValue);
  const metadata: Record<string, unknown> = { ...seed, ...existing };

  for (const key of canonicalStringMetadataKeys) {
    metadata[key] = typeof existing[key] === "string" ? existing[key] : seed[key];
  }

  for (const key of canonicalNumberMetadataKeys) {
    metadata[key] = typeof existing[key] === "number" && Number.isFinite(existing[key]) ? existing[key] : seed[key];
  }

  for (const key of canonicalArrayMetadataKeys) {
    metadata[key] = Array.isArray(existing[key]) ? normalizeStringArray(existing[key]) : seed[key];
  }

  return metadata;
}

function normalizeStringArray(value: unknown[]): string[] {
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function toTenantSeedInput(tenant: (typeof tenants)[number]): PrismaTenantSeedInput {
  const { healthScore, id, name, status, ...metadata } = tenant;

  return {
    healthScore: healthScore ?? null,
    id,
    metadata,
    name,
    status
  };
}

function toBillingTenantStateSeedInput(tenant: (typeof tenantBillingStates)[number]): PrismaBillingTenantStateSeedInput {
  return {
    arr: tenant.arr,
    healthScore: tenant.healthScore,
    id: tenant.id,
    monthlyRevenue: tenant.monthlyRevenue,
    name: tenant.name,
    owner: tenant.owner,
    planId: tenant.planId,
    region: tenant.region,
    sla: tenant.sla,
    status: tenant.status,
    usage: { ...tenant.usage },
    users: tenant.users,
    workspaces: tenant.workspaces
  };
}

function toTenantUserSeedInput(user: (typeof tenantUsers)[number]): PrismaTenantUserSeedInput {
  return {
    device: user.device,
    email: user.email,
    id: user.id,
    inviteStatus: user.inviteStatus,
    lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt) : null,
    metadata: {},
    mfa: user.mfa,
    name: user.name,
    risk: user.risk,
    role: user.role,
    sessions: user.sessions,
    status: user.status,
    supportNotes: user.supportNotes,
    tenantId: user.tenantId
  };
}

function toPermissionRoleSeedInput(role: (typeof permissionRoles)[number]): PrismaPermissionRoleSeedInput {
  return {
    actions: [...role.actions],
    aliases: [...role.aliases],
    description: role.description,
    groupIds: [...role.groupIds],
    key: role.key,
    metadata: toJsonRecord(role.metadata)
  };
}

function defaultRbacPolicyVersionSeedInput(): PrismaRbacPolicyVersionSeedInput {
  return {
    activatedAt: new Date("2026-06-28T00:00:00.000Z"),
    checksum: "sha256:default-rbac-policy",
    createdAt: new Date("2026-06-28T00:00:00.000Z"),
    createdBy: "system",
    description: "Default RBAC policy generated from fixture permission roles.",
    id: "rbac-policy-default",
    status: "active",
    version: "2026.06.28-default"
  };
}

function defaultRbacRoleGrantSeedInputs(): PrismaRbacRoleGrantSeedInput[] {
  const policy = defaultRbacPolicyVersionSeedInput();
  return permissionRoles.flatMap((role) => role.actions.map((action, index) => ({
    action,
    createdAt: new Date("2026-06-28T00:00:00.000Z"),
    createdBy: "system",
    effect: "allow",
    id: `rbac-grant-default-${role.key}-${index}`,
    policyVersionId: policy.id,
    resource: "*",
    roleKey: role.key,
    tenantId: null,
    traceId: "trc_rbac_default"
  })));
}

async function main(): Promise<void> {
  const client = createPrismaClient() as PrismaIdentitySeedClient;

  try {
    const result = await seedIdentityPrisma(client);
    process.stdout.write(`Seeded identity data: ${result.tenants} tenants, ${result.tenantUsers} tenant users, ${result.permissionRoles} permission roles, ${result.billingTenantStates} billing tenant states, ${result.tenantAuditEvents} tenant audit events.\n`);
  } finally {
    await client.$disconnect?.();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}
