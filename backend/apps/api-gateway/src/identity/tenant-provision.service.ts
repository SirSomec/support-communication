import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
import { BillingRepository } from "../billing/billing.repository.js";
import {
  IdentityRepository,
  hashPasswordCredential,
  type IdentityRbacRoleGrant,
  type IdentityTenant,
  type IdentityTenantUser
} from "./identity.repository.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
import type { ServiceAdminRequest } from "./service-admin-auth.js";

const SERVICE = "tenantProvisionService";

interface TenantProvisionPayload {
  admin?: {
    email?: string;
    mfa?: boolean;
    name?: string;
    password?: string;
    role?: string;
  };
  channel?: {
    domain?: string;
    type?: string;
  };
  employees?: Array<{
    email?: string;
    name?: string;
    role?: string;
    team?: string;
  }>;
  plan?: {
    billingCycle?: string;
    id?: string;
    trial?: boolean;
  };
  limits?: {
    afterHoursBot?: boolean;
    aiAssist?: boolean;
    concurrentDialogs?: number;
    dailyMessages?: number;
    operatorLimit?: number;
  };
  tenant?: {
    industry?: string;
    name?: string;
    region?: string;
    slug?: string;
  };
}

export interface TenantProvisionData {
  admin: {
    email: string;
    id: string;
    name: string;
    role: string;
    tenantId: string;
  };
  defaultWorkspaceIds: string[];
  embedSnippet: string;
  operator: {
    email: string;
    id: string;
    name: string;
    role: string;
  };
  publicApiKey: string;
  roleGrants: IdentityRbacRoleGrant[];
  session: {
    accessToken: string;
    expiresAt: string;
  };
  tenant: {
    id: string;
    name: string;
    planId: string;
    region: string;
    slug: string;
    status: "trial" | "active";
  };
  tenantId: string;
}

export class TenantProvisionService {
  constructor(
    private readonly identityRepository = IdentityRepository.default(),
    private readonly billingRepository = BillingRepository.default(),
    private readonly integrationRepository = IntegrationRepository.default()
  ) {}

  async provisionTenant(
    payload: TenantProvisionPayload = {},
    request: Partial<ServiceAdminRequest> = {}
  ): Promise<BackendEnvelope<TenantProvisionData | Record<string, never>>> {
    const traceId = identityTraceId(SERVICE, "provisionTenant");
    const tenantName = String(payload.tenant?.name ?? "").trim();
    const tenantSlug = normalizeSlug(payload.tenant?.slug);
    const tenantRegion = String(payload.tenant?.region ?? "").trim() || "ru-1";
    const adminName = String(payload.admin?.name ?? "").trim();
    const adminEmail = String(payload.admin?.email ?? "").trim().toLowerCase();
    const adminPassword = String(payload.admin?.password ?? "");
    const adminRole = normalizeProvisionAdminRole(payload.admin?.role);
    const mfaRequired = payload.admin?.mfa !== false;
    const channelDomain = String(payload.channel?.domain ?? "").trim();
    const billingCycle = payload.plan?.billingCycle === "annual" ? "annual" : "monthly";
    const industry = String(payload.tenant?.industry ?? "").trim().slice(0, 80) || "unspecified";
    const requestedLimits = normalizeProvisionLimits(payload.limits);
    const planId = normalizeProvisionPlanId(payload.plan?.id);
    const tariff = await this.billingRepository.findTariff(planId);
    const invitedEmployees = normalizeProvisionEmployees(payload.employees, adminEmail);

    if (!tenantName || !tenantSlug || !adminName || !adminEmail || !adminPassword) {
      return invalidProvision(traceId, "tenant_provision_payload_invalid", "Tenant, admin email/name, and admin password are required.");
    }

    if (!channelDomain) {
      return invalidProvision(traceId, "tenant_provision_channel_domain_required", "A real SDK channel domain is required.");
    }

    if (!isValidChannelDomain(channelDomain)) {
      return invalidProvision(traceId, "tenant_provision_channel_domain_invalid", "Channel domain must be a valid hostname.");
    }

    if (!tariff) {
      return invalidProvision(traceId, "tenant_provision_plan_invalid", "The selected billing plan is not available.");
    }

    const limits = applyPlanLimitPolicy(requestedLimits, tariff);

    if (tariff.ownerOnly && invitedEmployees.length > 0) {
      return invalidProvision(traceId, "tenant_provision_owner_only_plan", "The Free plan includes only the organization owner. Upgrade the plan before inviting teammates.");
    }

    if (invitedEmployees.length + 1 > tariff.includedUsers) {
      return invalidProvision(traceId, "tenant_provision_seat_limit_exceeded", "The selected plan does not include enough operator seats for the invited employees.");
    }

    const tenantId = `tenant-${tenantSlug}`;
    if (await this.identityRepository.findTenant(tenantId)) {
      return invalidProvision(traceId, "tenant_slug_duplicate", "Tenant slug is already in use.");
    }

    const [existingAdmin, existingCredential] = await Promise.all([
      this.identityRepository.findTenantUserByEmail(adminEmail),
      this.identityRepository.findPasswordCredentialByEmail(adminEmail)
    ]);
    if (existingAdmin || existingCredential) {
      return invalidProvision(traceId, "tenant_admin_email_duplicate", "Admin email is already assigned to another tenant.");
    }

    const billingStatus = tariff.billingAvailability === "free" ? "active" : payload.plan?.trial ? "trial" : "active";
    const defaultWorkspaceIds = [`ws-${tenantSlug}-dialogs`, `ws-${tenantSlug}-settings`];
    const compensation: Array<() => Promise<void>> = [];

    try {
      compensation.push(async () => {
        await this.identityRepository.removeProvisionedTenant(tenantId);
      });
      await this.identityRepository.saveTenant({
        activeUsers: 1,
        arr: 0,
        domains: channelDomain ? [channelDomain] : [],
        flags: [],
        healthScore: 100,
        id: tenantId,
        incidentIds: [],
        lastSeenAt: new Date().toISOString(),
        legalName: tenantName,
        monthlyRevenue: 0,
        name: tenantName,
        notes: "Provisioned through onboarding.",
        onboarding: {
          adminRole,
          billingCycle,
          industry,
          limits,
          mfaRequired
        },
        owner: adminName,
        ownerEmail: adminEmail,
        planId,
        region: tenantRegion,
        sla: 100,
        status: billingStatus,
        users: 1,
        workspaces: defaultWorkspaceIds.length
      });
      compensation.push(async () => {
        await this.billingRepository.removeProvisionedTenant(tenantId);
      });
      await this.billingRepository.saveTenant({
        arr: 0,
        healthScore: 100,
        id: tenantId,
        monthlyRevenue: 0,
        name: tenantName,
        owner: adminName,
        planId,
        region: tenantRegion,
        sla: "99.9",
        status: billingStatus,
      usage: {
        aiDialogCredits: 0,
        aiDialogs: 0,
          aiTokens: 0,
          botRuns: 0,
          channels: 1,
          operators: 1,
          reportExports: 0,
          storageGb: 0,
          webhooks: 0
        },
        users: 1,
        workspaces: defaultWorkspaceIds.length
      });

      const user: IdentityTenantUser = {
        device: "Provisioned during onboarding",
        email: adminEmail,
        id: `usr-${randomUUID()}`,
        inviteStatus: "accepted",
        lastActiveAt: new Date().toISOString(),
        mfa: mfaRequired ? "required" : "disabled",
        name: adminName,
        risk: "low",
        role: adminRole,
        sessions: 0,
        status: "active",
        supportNotes: "Created by tenant onboarding.",
        tenantId
      };
      await this.identityRepository.saveTenantUser(user);

      await this.identityRepository.savePasswordCredential({
        algorithm: "scrypt",
        email: adminEmail,
        hash: hashPasswordCredential(adminPassword),
        subjectId: user.id,
        updatedAt: new Date().toISOString(),
        version: 1
      });

      const activePolicy = await this.identityRepository.getActiveRbacPolicyVersion();
      const roleGrants: IdentityRbacRoleGrant[] = [];
      if (activePolicy) {
        const grant: IdentityRbacRoleGrant = {
          action: "*",
          createdAt: new Date().toISOString(),
          createdBy: request.serviceAdminContext?.actor.id ?? "service-admin",
          effect: "allow",
          id: `grant_${randomUUID()}`,
          policyVersionId: activePolicy.id,
          resource: "tenant",
          // Канонический ключ роли владельца тенанта — "admin" ("owner"/"владелец"
          // лишь его алиасы). permission.service грузит гранты по резолвнутому
          // ключу роли (admin), а FK rbac_role_grants → permission_roles(key)
          // отвергает alias-значение на Postgres.
          roleKey: "admin",
          tenantId,
          traceId
        };
        await this.identityRepository.recordRbacRoleGrant(grant);
        roleGrants.push(grant);
      }

      for (const employee of invitedEmployees) {
        const employeeEmail = employee.email;

        await this.identityRepository.saveTenantUser({
          device: "Invited during onboarding",
          email: employeeEmail,
          id: `usr-${randomUUID()}`,
          inviteStatus: "pending",
          lastActiveAt: new Date().toISOString(),
          // MFA (email-OTP) обязательна на платформе и включена у всех по умолчанию.
          mfa: "enabled",
          name: String(employee.name ?? employeeEmail.split("@")[0] ?? "Employee"),
          risk: "low",
          role: String(employee.role ?? "Operator"),
          sessions: 0,
          status: "active",
          supportNotes: `Invited during onboarding (${String(employee.team ?? "Support")}).`,
          tenantId
        });
      }

      const rawPublicApiKey = generateStageApiKey();
      compensation.push(async () => {
        await this.integrationRepository.removeProvisionedTenant(tenantId);
      });
      await this.integrationRepository.savePublicApiKey({
        createdAt: new Date().toISOString(),
        environment: "stage",
        keyId: `key-${tenantSlug}-${randomUUID()}`,
        name: `${tenantName} SDK stage key`,
        owner: request.serviceAdminContext?.actor.name ?? "service-admin",
        rawSecret: rawPublicApiKey,
        scopes: ["clients:identify", "conversations:write"],
        status: "active",
        tenantId
      });

      await this.identityRepository.recordServiceAdminAuditEvent({
        action: "tenant.provision",
        actor: request.serviceAdminContext?.actor.id ?? "service-admin",
        actorName: request.serviceAdminContext?.actor.name ?? "Service Admin",
        at: new Date().toISOString(),
        id: makeAuditId("tenant_provision"),
        immutable: true,
        reason: `Provisioned tenant ${tenantId}`,
        result: "ok",
        severity: "info",
        target: tenantId,
        tenantId,
        traceId,
        userId: user.id
      });

      const createdSession = await this.identityRepository.createTenantOperatorSession({
        tenantId,
        userId: user.id
      });

      const embedSnippet = `<script src="https://${channelDomain}/sdk.js" data-api-key="${rawPublicApiKey}" data-tenant-id="${tenantId}" data-channel="${String(payload.channel?.type ?? "sdk").trim() || "sdk"}"></script>`;

      return createEnvelope({
        service: SERVICE,
        operation: "provisionTenant",
        traceId,
        meta: apiMeta({ tenantId }),
        data: {
          tenant: {
            id: tenantId,
            name: tenantName,
            planId,
            region: tenantRegion,
            slug: tenantSlug,
            status: billingStatus
          },
          tenantId,
          admin: {
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId
          },
          operator: {
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role
          },
          session: {
            accessToken: createdSession.accessToken,
            expiresAt: createdSession.expiresAt
          },
          roleGrants,
          defaultWorkspaceIds,
          publicApiKey: rawPublicApiKey,
          embedSnippet
        }
      });
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const rollback of compensation.reverse()) {
        try {
          await rollback();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : "Unknown compensation failure.");
        }
      }

      const causeMessage = error instanceof Error ? error.message : "Tenant provisioning failed.";

      return createEnvelope({
        service: SERVICE,
        operation: "provisionTenant",
        traceId,
        status: "error",
        meta: apiMeta(),
        data: {},
        error: {
          code: rollbackErrors.length > 0 ? "tenant_provision_rollback_failed" : "tenant_provision_failed",
          message: rollbackErrors.length > 0
            ? `${causeMessage} Compensation errors: ${rollbackErrors.join("; ")}`
            : causeMessage
        }
      });
    }
  }
}

function invalidProvision(traceId: string, code: string, message: string) {
  return createEnvelope({
    service: SERVICE,
    operation: "provisionTenant",
    traceId,
    status: "invalid",
    meta: apiMeta(),
    data: {},
    error: { code, message }
  });
}

function normalizeSlug(input: string | undefined): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeProvisionAdminRole(value: string | undefined): "Admin" | "Owner" {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "administrator" || normalized === "администратор"
    ? "Admin"
    : "Owner";
}

function normalizeProvisionPlanId(value: string | undefined): string {
  const normalized = String(value ?? "starter").trim().toLowerCase();
  return normalized === "trial" ? "starter" : normalized || "starter";
}

function normalizeProvisionEmployees(
  employees: TenantProvisionPayload["employees"],
  adminEmail: string
): Array<{ email: string; name?: string; role?: string; team?: string }> {
  const seen = new Set<string>();
  return (employees ?? []).flatMap((employee) => {
    const email = String(employee.email ?? "").trim().toLowerCase();
    if (!email || email === adminEmail || seen.has(email)) {
      return [];
    }
    seen.add(email);
    return [{ ...employee, email }];
  });
}

function applyPlanLimitPolicy(
  limits: NonNullable<IdentityTenant["onboarding"]>["limits"],
  tariff: { includedUsers: number; ownerOnly: boolean }
): NonNullable<IdentityTenant["onboarding"]>["limits"] {
  return {
    ...limits,
    afterHoursBot: tariff.ownerOnly ? false : limits.afterHoursBot,
    aiAssist: tariff.ownerOnly ? false : limits.aiAssist,
    operatorLimit: tariff.ownerOnly ? 1 : Math.min(limits.operatorLimit, tariff.includedUsers)
  };
}

function normalizeProvisionLimits(input: TenantProvisionPayload["limits"]): NonNullable<IdentityTenant["onboarding"]>["limits"] {
  return {
    afterHoursBot: Boolean(input?.afterHoursBot),
    aiAssist: input?.aiAssist !== false,
    concurrentDialogs: boundedInteger(input?.concurrentDialogs, 12, 1, 100),
    dailyMessages: boundedInteger(input?.dailyMessages, 5000, 100, 10_000_000),
    operatorLimit: boundedInteger(input?.operatorLimit, 8, 1, 10_000)
  };
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function isValidChannelDomain(domain: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

function generateStageApiKey(): string {
  return `sk_stage_${randomBytes(18).toString("hex")}`;
}
